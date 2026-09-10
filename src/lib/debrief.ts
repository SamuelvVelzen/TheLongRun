/** Marker in the server debrief prompt; the client fills this as you type. */
export const DEBRIEF_WRITEUP_TOKEN = '<<<DEBRIEF_WRITEUP>>>';

export const DEBRIEF_WRITEUP_PLACEHOLDER =
	'(nothing written yet — I may still attach screenshots.)';

export type DebriefWriteupRun = {
	slug: string;
	date: string;
	day?: string | null;
	distance_km?: number | null;
};

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
			const km = r.distance_km != null ? ` · ${r.distance_km} km` : '';
			return `### ${r.date}${r.day ? ` · ${r.day}` : ''}${km} (\`${r.slug}\`)\n${text}`;
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
