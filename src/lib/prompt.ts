/** Collapse runs of blank lines and trim — safety net for every prompt we hand out. */
export function tidyPrompt(text: string): string {
	return `${text
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim()}\n`;
}

/** Rough token count for pasted prompts (≈4 characters per token for English + numbers). */
export function estimateTokens(text: string): number {
	return Math.ceil((text ?? '').length / 4);
}

export function formatTokenEstimate(text: string): string {
	const n = estimateTokens(text);
	if (n < 1000) return `~${n} tokens`;
	return `~${(Math.round(n / 100) / 10).toFixed(1)}k tokens`;
}

/** Join non-empty sections with one blank line. */
export function joinSections(...parts: (string | null | undefined | false)[]): string {
	return parts
		.map((p) => (typeof p === 'string' ? p.trim() : ''))
		.filter(Boolean)
		.join('\n\n');
}

/** `## Heading` + body, or '' when the body is empty. */
export function section(heading: string, body: string | null | undefined): string {
	const b = (body ?? '').trim();
	return b ? `## ${heading}\n${b}` : '';
}

/** Decoder for the Feel column; `pain` is the label of the tracked body area. */
export function feelScale(pain: string): string {
	const p = pain.toLowerCase();
	return `Feel = effort/${p}/legs/energy. Effort and energy 1–10 (effort higher = harder, energy higher = better). ${pain} and legs 0–10 (higher = worse). – = not recorded.`;
}

/** Feel cell — a single dash when nothing was recorded. */
export function feelCell(r: {
	effort: number | null;
	shins: number | null;
	legs: number | null;
	energy: number | null;
}): string {
	const vals = [r.effort, r.shins, r.legs, r.energy];
	if (vals.every((v) => v == null)) return '–';
	return vals.map((v) => (v == null ? '–' : v)).join('/');
}

/** HR cell — a single dash when neither value exists. */
export function hrCell(r: { avg_hr: number | null; max_hr: number | null }): string {
	if (r.avg_hr == null && r.max_hr == null) return '–';
	return `${r.avg_hr ?? '–'}/${r.max_hr ?? '–'}`;
}
