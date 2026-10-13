import { formatBodyScores, type BodyScore } from '$lib/body-scores';

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

/** Decoder for the Feel column. */
export function feelScale(): string {
	return 'Feel = effort/legs/energy, then body scores per area (e.g. "Shins 3, Left knee 5"). Effort and energy 1–10 (effort higher = harder, energy higher = better). Legs and body scores 0–10 (higher = worse). – = not recorded.';
}

/** Feel cell — a single dash when nothing was recorded. */
export function feelCell(r: {
	effort: number | null;
	body_scores: BodyScore[];
	legs: number | null;
	energy: number | null;
}): string {
	const vals = [r.effort, r.legs, r.energy];
	const body = formatBodyScores(r.body_scores);
	if (vals.every((v) => v == null) && !body) return '–';
	const base = vals.map((v) => (v == null ? '–' : v)).join('/');
	return body ? `${base} · ${body}` : base;
}

/** HR cell — a single dash when neither value exists. */
export function hrCell(r: { avg_hr: number | null; max_hr: number | null }): string {
	if (r.avg_hr == null && r.max_hr == null) return '–';
	return `${r.avg_hr ?? '–'}/${r.max_hr ?? '–'}`;
}
