import { activityLabel, showsField } from '$lib/activity';
import {
	formatSessionHabitsBlock,
	type ActivityHabits,
	type HabitPair
} from '$lib/activity-habits';

/** Marker in the server debrief prompt; the client fills this as you type. */
export const DEBRIEF_WRITEUP_TOKEN = '<<<DEBRIEF_WRITEUP>>>';
export const DEBRIEF_HABITS_TOKEN = '<<<DEBRIEF_HABITS>>>';

export const DEBRIEF_WRITEUP_PLACEHOLDER = '(nothing written yet.)';

export type DebriefWriteupRun = {
	id: number;
	slug: string;
	date: string;
	day?: string | null;
	distance_km?: number | null;
	activity_type?: string | null;
	start_time?: string | null;
	before_notes?: string | null;
	after_notes?: string | null;
};

/** Date · day · Run/Strength · start · km — same bits the coach list uses as a title. */
export function debriefRunTitle(
	r: Pick<DebriefWriteupRun, 'date' | 'day' | 'activity_type' | 'distance_km' | 'start_time'>
): string {
	return [
		r.date,
		r.day || null,
		activityLabel(r.activity_type),
		r.start_time || null,
		showsField(r.activity_type, 'distance') && r.distance_km != null ? `${r.distance_km} km` : null
	]
		.filter(Boolean)
		.join(' · ');
}

export type DebriefWriteupUnit = {
	slug: string;
	members: DebriefWriteupRun[];
};

function writeupUnitHeading(u: DebriefWriteupUnit): string {
	if (u.members.length > 1) {
		const lead = u.members[0]!;
		return `### ${debriefRunTitle(lead)} + ${u.members.length - 1} more part(s) (\`${u.slug}\`)`;
	}
	const r = u.members[0]!;
	return `### ${debriefRunTitle(r)} (\`${u.slug}\`)`;
}

export function formatDebriefWriteup(
	units: DebriefWriteupUnit[],
	writeups: Record<string, string>
): string {
	const many = units.length > 1;
	const blocks = units
		.map((u) => {
			const text = (writeups[u.slug] ?? '').trim();
			if (!text) return '';
			if (!many && u.members.length === 1) return text;
			return `${writeupUnitHeading(u)}\n${text}`;
		})
		.filter(Boolean);
	if (!blocks.length) return DEBRIEF_WRITEUP_PLACEHOLDER;
	return blocks.join('\n\n');
}

export function injectDebriefWriteup(prompt: string, writeupBody: string): string {
	if (!prompt.includes(DEBRIEF_WRITEUP_TOKEN)) return prompt;
	return prompt.split(DEBRIEF_WRITEUP_TOKEN).join(writeupBody);
}

export function injectDebriefHabits(prompt: string, habitsBody: string): string {
	if (!prompt.includes(DEBRIEF_HABITS_TOKEN)) return prompt;
	return prompt.split(DEBRIEF_HABITS_TOKEN).join(habitsBody);
}

export function debriefWriteupUnitsFromCoach(debrief: {
	runs?: DebriefWriteupRun[];
	run?: DebriefWriteupRun | null;
	units?: { slug: string; members: DebriefWriteupRun[] }[];
}): DebriefWriteupUnit[] {
	if (debrief.units?.length) {
		return debrief.units.map((u) => ({ slug: u.slug, members: u.members }));
	}
	const runs = debrief.runs?.length ? debrief.runs : debrief.run ? [debrief.run] : [];
	return runs.map((r) => ({ slug: r.slug, members: [r] }));
}

export function composeDebriefPrompt(
	prompt: string,
	units: DebriefWriteupUnit[],
	writeups: Record<string, string>,
	habitDrafts: Record<string, HabitPair> = {},
	habits: ActivityHabits | null = null
): string {
	const withWriteup = injectDebriefWriteup(prompt, formatDebriefWriteup(units, writeups));
	if (!habits) return withWriteup;
	const habitRows = units.map((u) => {
		const lead = u.members[0]!;
		return {
			slug: u.slug,
			activity_type: lead.activity_type,
			before_notes: lead.before_notes,
			after_notes: lead.after_notes
		};
	});
	return injectDebriefHabits(withWriteup, formatSessionHabitsBlock(habitRows, habitDrafts, habits));
}
