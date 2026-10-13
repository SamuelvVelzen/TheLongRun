export type BodyNoteStatus = 'active' | 'monitoring' | 'resolved';

export const BODY_NOTE_STATUSES: BodyNoteStatus[] = ['active', 'monitoring', 'resolved'];

export const BODY_NOTE_STATUS_META: Record<BodyNoteStatus, { label: string; hint: string }> = {
	active: { label: 'Active', hint: 'Bothering me now' },
	monitoring: { label: 'Monitoring', hint: 'Settled, keeping an eye on it' },
	resolved: { label: 'Resolved', hint: 'Gone — kept for history' }
};

export type BodyNote = {
	id: string;
	area: string;
	status: BodyNoteStatus;
	/** What sets it off (surfaces, distance, sitting, …). */
	trigger: string;
	/** What helps (warm-up, routes, shoes, …). */
	helps: string;
	/** Labels the per-activity pain score. At most one note is tracked. */
	tracked: boolean;
	/** `YYYY-MM-DD`, stamped on every edit. */
	updated: string;
};

export type BodyNotes = { notes: BodyNote[] };

export const MAX_BODY_AREA = 40;
export const MAX_BODY_TEXT = 300;
export const MAX_COACH_NOTES = 2000;

export const DEFAULT_PAIN_LABEL = 'Pain';

export const BODY_SAFETY_RULE =
	'Not a diagnosis — for sharp pain, limping, focal bone tenderness, or pain at rest, tell me to stop and get it checked.';

export function emptyBodyNotes(): BodyNotes {
	return { notes: [] };
}

export function newBodyNoteId(): string {
	return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function clean(value: unknown, max: number): string {
	return String(value ?? '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, max);
}

function isoToday(): string {
	const d = new Date();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${d.getFullYear()}-${m}-${day}`;
}

export function normalizeBodyNote(raw: unknown): BodyNote | null {
	const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
	const area = clean(o.area, MAX_BODY_AREA);
	if (!area) return null;
	const status = BODY_NOTE_STATUSES.includes(o.status as BodyNoteStatus)
		? (o.status as BodyNoteStatus)
		: 'monitoring';
	const updated =
		typeof o.updated === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.updated) ? o.updated : isoToday();
	return {
		id: clean(o.id, 40) || newBodyNoteId(),
		area,
		status,
		trigger: clean(o.trigger, MAX_BODY_TEXT),
		helps: clean(o.helps, MAX_BODY_TEXT),
		tracked: o.tracked === true,
		updated
	};
}

export function normalizeBodyNotes(raw: unknown): BodyNotes {
	const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
	const list = Array.isArray(o.notes) ? o.notes : [];
	const notes: BodyNote[] = [];
	let tracked = false;
	for (const item of list) {
		const n = normalizeBodyNote(item);
		if (!n) continue;
		if (n.tracked && tracked) n.tracked = false;
		if (n.tracked) tracked = true;
		notes.push(n);
	}
	return { notes };
}

/** Stamp `updated` on notes that changed versus the previous save. */
export function stampBodyNotes(prev: BodyNotes, next: BodyNotes, today = isoToday()): BodyNotes {
	const before = new Map(prev.notes.map((n) => [n.id, n]));
	return {
		notes: next.notes.map((n) => {
			const old = before.get(n.id);
			const same =
				old &&
				old.area === n.area &&
				old.status === n.status &&
				old.trigger === n.trigger &&
				old.helps === n.helps &&
				old.tracked === n.tracked;
			return same ? { ...n, updated: old.updated } : { ...n, updated: today };
		})
	};
}

const STATUS_ALIASES: Record<string, BodyNoteStatus> = {
	active: 'active',
	new: 'active',
	worse: 'active',
	sore: 'active',
	monitoring: 'monitoring',
	monitor: 'monitoring',
	better: 'monitoring',
	settled: 'monitoring',
	resolved: 'resolved',
	gone: 'resolved',
	cleared: 'resolved',
	fine: 'resolved'
};

export type BodySuggestion = { note: BodyNote; existing: boolean };

/**
 * Debrief `body` entries as full notes, ready to confirm: an entry for a known area keeps that
 * note's id (and its trigger/helps when the AI left them blank). Broken entries are dropped.
 */
/** Merge picked import / debrief suggestions into saved body notes. */
export function applyBodyImport(body: BodyNotes, chosen: BodySuggestion[]): BodyNotes {
	const picked = chosen.map((c) => c.note);
	const byId = new Map(picked.map((n) => [n.id, n]));
	const kept = body.notes.map((n) => byId.get(n.id) ?? n);
	const added = picked.filter((n) => !body.notes.some((o) => o.id === n.id));
	return normalizeBodyNotes({ notes: [...kept, ...added] });
}

export function mergeBodySuggestions(current: BodyNotes, input: unknown): BodySuggestion[] {
	const list = Array.isArray(input) ? input : input && typeof input === 'object' ? [input] : [];
	const out: BodySuggestion[] = [];
	for (const raw of list) {
		const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
		const status = STATUS_ALIASES[String(o.status ?? '').toLowerCase().replace(/[^a-z]/g, '')];
		const n = normalizeBodyNote({ ...o, id: '', tracked: false, updated: '', status });
		if (!n) continue;
		const key = n.area.toLowerCase();
		if (out.some((x) => x.note.area.toLowerCase() === key)) continue;
		const old = current.notes.find((x) => x.area.toLowerCase() === key);
		out.push(
			old
				? {
						existing: true,
						note: {
							...old,
							status: status ?? old.status,
							trigger: n.trigger || old.trigger,
							helps: n.helps || old.helps
						}
					}
				: { existing: false, note: n }
		);
	}
	return out;
}

export function capitalize(text: string): string {
	return text ? text[0]!.toUpperCase() + text.slice(1) : text;
}

/** Label for the per-activity pain score: the tracked area (e.g. "Shins"), else "Pain". */
export function painLabel(body: BodyNotes): string {
	const tracked = body.notes.find((n) => n.tracked && n.status !== 'resolved');
	return tracked ? capitalize(tracked.area) : DEFAULT_PAIN_LABEL;
}

function monthLabel(iso: string): string {
	const d = new Date(`${iso}T12:00:00`);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

/** Prompt section — open notes in full with their age, resolved ones on one line. */
export function formatBodyNotesSection(body: BodyNotes): string {
	const open = body.notes.filter((n) => n.status !== 'resolved');
	const resolved = body.notes.filter((n) => n.status === 'resolved');
	if (!open.length && !resolved.length) return '';
	const lines = open.map((n) => {
		const bits = [
			n.trigger ? `trigger: ${n.trigger}` : '',
			n.helps ? `helps: ${n.helps}` : ''
		].filter(Boolean);
		const score = n.tracked ? ' · scored per activity as the pain number' : '';
		return `- ${capitalize(n.area)} (${n.status}, updated ${n.updated}${score})${bits.length ? `: ${bits.join('; ')}` : ''}`;
	});
	if (resolved.length) {
		lines.push(
			`- Resolved: ${resolved.map((n) => `${n.area} (${monthLabel(n.updated)})`).join(', ')}`
		);
	}
	return `## Body notes\n${lines.join('\n')}`;
}

export function compactCoachNotes(text: string | null | undefined): string {
	return String(text ?? '')
		.replace(/\r\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim()
		.slice(0, MAX_COACH_NOTES);
}

export function formatCoachNotesSection(text: string): string {
	const t = compactCoachNotes(text);
	return t ? `## Notes from me\n${t}` : '';
}
