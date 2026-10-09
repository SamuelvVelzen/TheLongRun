/**
 * zod schemas for fuel tries — AI replies (describe-what-you-ate, debrief `fuel`) and the manual form.
 * AI wording is normalized leniently (phase/outcome aliases, blank → unset) then checked strictly.
 */
import { z } from 'zod';
import {
	FUEL_OUTCOMES,
	FUEL_PHASES,
	MAX_FUEL_ITEM,
	MAX_FUEL_NOTES,
	MAX_FUEL_TIMING,
	compactFuelText,
	newFuelId,
	type FuelEntry
} from '$lib/fuel';

const PHASE_ALIASES: Record<string, (typeof FUEL_PHASES)[number]> = {
	before: 'before',
	pre: 'before',
	prerun: 'before',
	beforerun: 'before',
	during: 'during',
	mid: 'during',
	midrun: 'during',
	inrun: 'during',
	inrace: 'during',
	after: 'after',
	post: 'after',
	postrun: 'after',
	afterrun: 'after',
	recovery: 'after'
};

const OUTCOME_ALIASES: Record<string, (typeof FUEL_OUTCOMES)[number]> = {
	good: 'good',
	ok: 'good',
	okay: 'good',
	fine: 'good',
	worked: 'good',
	great: 'good',
	positive: 'good',
	mixed: 'mixed',
	meh: 'mixed',
	partial: 'mixed',
	neutral: 'mixed',
	unsure: 'mixed',
	bad: 'bad',
	trouble: 'bad',
	cramps: 'bad',
	cramp: 'bad',
	stitch: 'bad',
	negative: 'bad',
	failed: 'bad'
};

function aliasKey(v: unknown): string {
	return typeof v === 'string' ? v.toLowerCase().replace(/[^a-z]/g, '') : '';
}

function toPhase(v: unknown): unknown {
	return PHASE_ALIASES[aliasKey(v)] ?? v;
}

/** Missing outcome means nothing went wrong worth mentioning. */
function toOutcome(v: unknown): unknown {
	if (v == null || (typeof v === 'string' && !v.trim())) return 'good';
	if (v === true) return 'good';
	if (v === false) return 'bad';
	return OUTCOME_ALIASES[aliasKey(v)] ?? v;
}

function text(max: number) {
	return z.preprocess((v) => compactFuelText(v ?? '', max), z.string());
}

export const fuelItemField = z
	.string()
	.trim()
	.min(1, 'What did you eat or drink?')
	.max(MAX_FUEL_ITEM);
export const fuelTimingField = z
	.string()
	.trim()
	.min(1, 'When — e.g. 20 min before, every 5 km.')
	.max(MAX_FUEL_TIMING);

export const fuelEntrySchema = z.object({
	phase: z.preprocess(toPhase, z.enum(FUEL_PHASES, { message: 'use before, during or after' })),
	item: z.preprocess((v) => compactFuelText(v ?? '', MAX_FUEL_ITEM), fuelItemField),
	timing: z.preprocess((v) => compactFuelText(v ?? '', MAX_FUEL_TIMING), fuelTimingField),
	outcome: z.preprocess(toOutcome, z.enum(FUEL_OUTCOMES, { message: 'use good, mixed or bad' })),
	notes: text(MAX_FUEL_NOTES).optional().default(''),
	slug: text(200).optional().default(''),
	date: z
		.preprocess((v) => String(v ?? '').trim(), z.string())
		.transform((s) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''))
		.optional()
		.default('')
});

export type ParsedFuelEntry = z.output<typeof fuelEntrySchema>;

/** Manual add/edit form — same field rules as AI input. */
export const fuelFormSchema = z.object({
	phase: z.enum(FUEL_PHASES),
	item: fuelItemField,
	timing: fuelTimingField,
	outcome: z.enum(FUEL_OUTCOMES),
	notes: z.string().max(MAX_FUEL_NOTES)
});

export type FuelFormValues = z.input<typeof fuelFormSchema>;

/** `{ fuel: [...] }`, `{ entries: [...] }`, a bare array, or one entry object. */
function fuelList(input: unknown): unknown[] | null {
	if (Array.isArray(input)) return input;
	if (!input || typeof input !== 'object') return null;
	const o = input as Record<string, unknown>;
	if (Array.isArray(o.fuel)) return o.fuel;
	if (Array.isArray(o.entries)) return o.entries;
	if (o.fuel && typeof o.fuel === 'object') return [o.fuel];
	if ('item' in o) return [o];
	return null;
}

function describeEntry(raw: unknown, index: number): string {
	const item =
		raw && typeof raw === 'object' && typeof (raw as { item?: unknown }).item === 'string'
			? (raw as { item: string }).item.trim()
			: '';
	return item ? `Entry ${index + 1} (${item})` : `Entry ${index + 1}`;
}

function formatFuelIssues(error: z.ZodError, list: unknown[], max = 8): string {
	const lines = error.issues.slice(0, max).map((issue) => {
		const path = [...issue.path];
		const idx = path[0];
		const where = typeof idx === 'number' ? describeEntry(list[idx], idx) : 'Fuel';
		if (typeof idx === 'number') path.shift();
		const field = path.map(String).join('.');
		return `- ${[where, field].filter(Boolean).join(' · ')}: ${issue.message}`;
	});
	const more = error.issues.length > max ? `\n- …and ${error.issues.length - max} more` : '';
	return `That fuel JSON has problems:\n${lines.join('\n')}${more}`;
}

function toEntry(p: ParsedFuelEntry, runDates: Record<string, string>): FuelEntry {
	const slug = p.slug && runDates[p.slug] != null ? p.slug : '';
	return {
		id: newFuelId(),
		phase: p.phase,
		item: p.item,
		timing: p.timing,
		outcome: p.outcome,
		notes: p.notes,
		slug,
		date: p.date || (slug ? runDates[slug]! : '')
	};
}

/**
 * Strict: throws an Error listing every problem with its entry. Unknown slugs are cleared,
 * not rejected; a linked activity fills in a missing date.
 */
export function parseFuelReply(input: unknown, runDates: Record<string, string>): FuelEntry[] {
	const list = fuelList(input);
	if (!list || !list.length) throw new Error('No "fuel" entries found in that JSON.');
	const parsed = z.array(fuelEntrySchema).safeParse(list);
	if (!parsed.success) throw new Error(formatFuelIssues(parsed.error, list));
	return parsed.data.map((p) => toEntry(p, runDates));
}

/** Lenient: keeps valid entries and drops broken ones (debrief replies must still save). */
export function parseFuelSuggestions(input: unknown, runDates: Record<string, string>): FuelEntry[] {
	const list = fuelList(input) ?? [];
	const out: FuelEntry[] = [];
	for (const raw of list) {
		const parsed = fuelEntrySchema.safeParse(raw);
		if (parsed.success) out.push(toEntry(parsed.data, runDates));
	}
	return out;
}
