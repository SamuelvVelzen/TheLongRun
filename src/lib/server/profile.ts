import { compactHabitText } from '$lib/activity-habits';
import {
	compactCoachNotes,
	emptyBodyNotes,
	newBodyNoteId,
	normalizeBodyNotes,
	stampBodyNotes,
	type BodyNote,
	type BodyNotes
} from '$lib/body-notes';
import { isoDateLocal } from '$lib/plan';
import {
	loadActivityHabits,
	persistActivityHabits,
	readContextFile,
	writeContextFile
} from './context';

const BODY_FILE = 'body-notes.json';
const COACH_NOTES_FILE = 'coach-notes.md';

type MdSection = { heading: string; body: string };

/** Split markdown at `## ` headings; the `#` title and intro paragraph are dropped. */
function sectionsOf(md: string): MdSection[] {
	const out: MdSection[] = [];
	let cur: MdSection | null = null;
	for (const line of md.replace(/\r\n/g, '\n').split('\n')) {
		const h = line.match(/^##\s+(.+?)\s*$/);
		if (h) {
			if (cur) out.push(cur);
			cur = { heading: h[1]!, body: '' };
			continue;
		}
		if (cur) cur.body += `${line}\n`;
	}
	if (cur) out.push(cur);
	return out.map((s) => ({ heading: s.heading, body: s.body.trim() })).filter((s) => s.body);
}

function bulletLines(body: string): string[] {
	return body
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean)
		.map((l) => l.replace(/^(?:[-*]|\d+[.)])\s+/, '').trim())
		.filter(Boolean);
}

const PATTERN_RE = /^\*\*(.+?):?\*\*:?\s*(.*)$/;

function bodyNoteFromBullet(line: string, today: string): BodyNote | null {
	const m = line.match(PATTERN_RE);
	if (!m) return null;
	const area = m[1]!.replace(/:$/, '').trim();
	const [trigger = '', helps = ''] = m[2]!.split(/\s*(?:→|->)\s*/);
	const resolved = /\bresolved\b/i.test(m[2]!);
	return {
		id: newBodyNoteId(),
		area: area.toLowerCase(),
		status: resolved ? 'resolved' : 'monitoring',
		trigger: trigger.trim(),
		helps: helps.trim(),
		updated: today
	};
}

// Coaching knowledge any model already has — not worth carrying into the prompt.
const GENERIC_SECTION_RE =
	/traffic|return[- ]to[- ]run|^status$|weekly rhythm|^paces|recent markers|core gear/i;
const GENERIC_RULE_RE =
	/conversational|one major stressor|only one .*stressor|reduce\/stop if pain|stop if pain changes stride/i;

/**
 * One-shot: profile.md / injury.md / gear.md become body notes, coach notes and run habits.
 * Generic sections are dropped. The markdown rows stay in the DB as a backup.
 */
async function migrateLegacyContext(): Promise<{ body: BodyNotes; coachNotes: string }> {
	const [profile, injury, checklist, habits] = await Promise.all([
		readContextFile('profile.md'),
		readContextFile('injury.md'),
		readContextFile('gear.md'),
		loadActivityHabits()
	]);
	const today = isoDateLocal(new Date());
	const notes: BodyNote[] = [];
	const coach: string[] = [];
	let runBefore = '';

	for (const s of sectionsOf(injury)) {
		if (GENERIC_SECTION_RE.test(s.heading)) continue;
		if (/pattern/i.test(s.heading)) {
			const leftovers: string[] = [];
			for (const line of bulletLines(s.body)) {
				const n = bodyNoteFromBullet(line, today);
				if (n) notes.push(n);
				else leftovers.push(`- ${line}`);
			}
			if (leftovers.length) coach.push(`${s.heading}:\n${leftovers.join('\n')}`);
			continue;
		}
		coach.push(`${s.heading}:\n${s.body}`);
	}

	for (const s of sectionsOf(profile)) {
		if (GENERIC_SECTION_RE.test(s.heading)) continue;
		if (/decision rules|rules/i.test(s.heading)) {
			const keep = bulletLines(s.body).filter((l) => !GENERIC_RULE_RE.test(l));
			if (keep.length) coach.push(keep.map((l) => `- ${l}`).join('\n'));
			continue;
		}
		coach.push(`${s.heading}:\n${s.body}`);
	}

	for (const s of sectionsOf(checklist)) {
		if (GENERIC_SECTION_RE.test(s.heading) || /^fuel\b/i.test(s.heading)) continue;
		if (/before every run/i.test(s.heading)) {
			const text = compactHabitText(bulletLines(s.body).join('; '));
			if (!habits.run.before && text) runBefore = text;
			else if (text) coach.push(`Before every run: ${text}`);
			continue;
		}
		coach.push(`${s.heading}:\n${s.body}`);
	}

	const coachNotes = compactCoachNotes(coach.join('\n\n'));
	if (coachNotes) await writeContextFile(COACH_NOTES_FILE, `${coachNotes}\n`);
	if (runBefore) {
		await persistActivityHabits({ ...habits, run: { ...habits.run, before: runBefore } });
	}
	const body = normalizeBodyNotes({ notes });
	await writeContextFile(BODY_FILE, `${JSON.stringify(body, null, 2)}\n`);
	return { body, coachNotes };
}

export async function loadBodyNotes(): Promise<BodyNotes> {
	const raw = await readContextFile(BODY_FILE);
	if (!raw.trim()) return (await migrateLegacyContext()).body;
	try {
		return normalizeBodyNotes(JSON.parse(raw));
	} catch {
		return emptyBodyNotes();
	}
}

export async function persistBodyNotes(next: BodyNotes): Promise<BodyNotes> {
	const prev = await loadBodyNotes();
	const saved = stampBodyNotes(prev, normalizeBodyNotes(next));
	await writeContextFile(BODY_FILE, `${JSON.stringify(saved, null, 2)}\n`);
	return saved;
}

export async function loadCoachNotes(): Promise<string> {
	await loadBodyNotes();
	return compactCoachNotes(await readContextFile(COACH_NOTES_FILE));
}

export async function persistCoachNotes(text: string): Promise<string> {
	const next = compactCoachNotes(text);
	await writeContextFile(COACH_NOTES_FILE, next ? `${next}\n` : '');
	return next;
}

/** Body notes + coach notes in one read (migrates on first use). */
export async function loadProfile(): Promise<{ body: BodyNotes; coachNotes: string }> {
	const body = await loadBodyNotes();
	const coachNotes = compactCoachNotes(await readContextFile(COACH_NOTES_FILE));
	return { body, coachNotes };
}
