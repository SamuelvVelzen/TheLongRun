/**
 * zod schemas for AI-returned activity feelings — weekly capture, debrief `feelings`, bare arrays.
 */
import { z } from 'zod';

const MAX_NOTES = 8000;
const MAX_SURFACE = 200;
const MAX_SESSION = 40;
const MAX_GEAR = 120;

function blankToUndefined(v: unknown): unknown {
	if (v == null) return undefined;
	if (typeof v === 'string' && !v.trim()) return undefined;
	return v;
}

function opt<T extends z.ZodType>(schema: T) {
	return z.preprocess(blankToUndefined, schema.optional());
}

function clampInt(v: unknown, lo: number, hi: number): unknown {
	if (v === undefined) return undefined;
	if (v === null || v === '') return null;
	const n = Number(v);
	if (!Number.isFinite(n)) return v;
	return Math.max(lo, Math.min(hi, Math.round(n)));
}

function scoreField(lo: number, hi: number) {
	return opt(
		z.preprocess(
			(v) => clampInt(v, lo, hi),
			z.union([z.number().int().min(lo).max(hi), z.null()])
		)
	);
}

function toWantedFaster(v: unknown): unknown {
	if (v === undefined) return undefined;
	if (v === null) return null;
	if (v === true || v === false) return v;
	if (typeof v === 'string') {
		const s = v.trim().toLowerCase();
		if (['y', 'yes', 'true', '1'].includes(s)) return true;
		if (['n', 'no', 'false', '0'].includes(s)) return false;
	}
	return v;
}

function toCadence(v: unknown): unknown {
	if (v === undefined) return undefined;
	if (v === null || v === '') return null;
	const n = Number(v);
	if (!Number.isFinite(n) || n <= 0) return v;
	return Math.round(n);
}

export const feelingsActivitySchema = z.object({
	slug: z.string().trim().min(1, 'needs a "slug"'),
	effort: scoreField(1, 10),
	shins: scoreField(0, 10),
	legs: scoreField(0, 10),
	energy: scoreField(1, 10),
	wanted_faster: opt(
		z.preprocess(
			toWantedFaster,
			z.union([z.boolean(), z.null()])
		)
	),
	surface: opt(z.string().trim().max(MAX_SURFACE)),
	notes: opt(z.string().trim().max(MAX_NOTES)),
	session: opt(z.string().trim().max(MAX_SESSION)),
	cadence: opt(
		z.preprocess(
			toCadence,
			z.union([z.number().int().positive(), z.null()])
		)
	),
	gear: opt(z.string().trim().max(MAX_GEAR))
});

export type ParsedFeelingsActivity = z.output<typeof feelingsActivitySchema>;

/**
 * Pull activity rows from common AI shapes: bare array, `{ activities }`, `{ feelings }`,
 * debrief `{ feelings: { slug, … } }`, or `{ feelings: { activities: [...] } }`.
 */
export function feelingsList(input: unknown): unknown[] | null {
	if (Array.isArray(input)) return input;
	if (!input || typeof input !== 'object') return null;
	const o = input as Record<string, unknown>;
	if (Array.isArray(o.activities)) return o.activities;
	if (Array.isArray(o.feelings)) return o.feelings;
	if (o.feelings && typeof o.feelings === 'object' && !Array.isArray(o.feelings)) {
		const f = o.feelings as Record<string, unknown>;
		if (Array.isArray(f.activities)) return f.activities;
		if (typeof f.slug === 'string') return [o.feelings];
	}
	return null;
}

function describeActivity(raw: unknown, index: number): string {
	if (raw && typeof raw === 'object' && typeof (raw as { slug?: unknown }).slug === 'string') {
		const slug = (raw as { slug: string }).slug.trim();
		if (slug) return `Activity ${slug}`;
	}
	return `Activity #${index + 1}`;
}

function formatFeelingsIssues(error: z.ZodError, list: unknown[], max = 8): string {
	const lines = error.issues.slice(0, max).map((issue) => {
		const path = [...issue.path];
		const idx = path[0];
		const where = typeof idx === 'number' ? describeActivity(list[idx], idx) : 'Feelings';
		if (typeof idx === 'number') path.shift();
		const field = path.map(String).join('.');
		return `- ${[where, field].filter(Boolean).join(' · ')}: ${issue.message}`;
	});
	const more = error.issues.length > max ? `\n- …and ${error.issues.length - max} more` : '';
	return `That feelings JSON has problems:\n${lines.join('\n')}${more}`;
}

/** Strict — throws with readable paths. Used by saveFeelings. */
export function parseFeelingsReply(input: unknown): ParsedFeelingsActivity[] {
	const list = feelingsList(input);
	if (!list?.length) throw new Error('No activities with a "slug" were found in that JSON.');
	const parsed = z.array(feelingsActivitySchema).safeParse(list);
	if (!parsed.success) throw new Error(formatFeelingsIssues(parsed.error, list));
	return parsed.data;
}

/** Lenient — keeps valid rows only (debrief must still save week / fuel). */
export function parseFeelingsSuggestions(input: unknown): ParsedFeelingsActivity[] {
	const list = feelingsList(input);
	if (!list?.length) return [];
	const out: ParsedFeelingsActivity[] = [];
	for (const raw of list) {
		const parsed = feelingsActivitySchema.safeParse(raw);
		if (parsed.success) out.push(parsed.data);
	}
	return out;
}

/** Fields to pass to `updateRunFeelings` — only keys present on the parsed row. */
export function feelingsRowToPatch(row: ParsedFeelingsActivity): Record<string, unknown> {
	const { slug: _slug, ...rest } = row;
	const patch: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(rest)) {
		if (v !== undefined) patch[k] = v;
	}
	return patch;
}
