import { activityLabel, showsField } from '$lib/activity';

/** Marker in the server debrief prompt; the client fills this as you type. */
export const DEBRIEF_WRITEUP_TOKEN = '<<<DEBRIEF_WRITEUP>>>';

export const DEBRIEF_WRITEUP_PLACEHOLDER = '(nothing written yet.)';

export type DebriefWriteupRun = {
	slug: string;
	date: string;
	day?: string | null;
	distance_km?: number | null;
	activity_type?: string | null;
	start_time?: string | null;
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

export function formatDebriefWriteup(
	runs: DebriefWriteupRun[],
	writeups: Record<string, string>
): string {
	const many = runs.length > 1;
	const blocks = runs
		.map((r) => {
			const text = (writeups[r.slug] ?? '').trim();
			if (!text) return '';
			if (!many) return text;
			return `### ${debriefRunTitle(r)} (\`${r.slug}\`)\n${text}`;
		})
		.filter(Boolean);
	if (!blocks.length) return DEBRIEF_WRITEUP_PLACEHOLDER;
	return blocks.join('\n\n');
}

export function injectDebriefWriteup(prompt: string, writeupBody: string): string {
	if (!prompt.includes(DEBRIEF_WRITEUP_TOKEN)) return prompt;
	return prompt.split(DEBRIEF_WRITEUP_TOKEN).join(writeupBody);
}

export function composeDebriefPrompt(
	prompt: string,
	runs: DebriefWriteupRun[],
	writeups: Record<string, string>
): string {
	return injectDebriefWriteup(prompt, formatDebriefWriteup(runs, writeups));
}
