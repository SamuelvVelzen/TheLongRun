/**
 * Planned fuel / kit on a plan session — fuel is structured; kit is one sentence.
 * Saved on the plan only (not the fuel log).
 */
import { z } from 'zod';
import {
	FUEL_PHASES,
	FUEL_PHASE_META,
	MAX_FUEL_ITEM,
	MAX_FUEL_NOTES,
	MAX_FUEL_TIMING,
	compactFuelText,
	type FuelPhase
} from '$lib/fuel';

export const MAX_PLAN_SESSION_FUEL_ITEMS = 8;
export const MAX_PLAN_SESSION_KIT = 400;

const FUEL_PHASE_ALIASES: Record<string, FuelPhase> = {
	before: 'before',
	pre: 'before',
	prerun: 'before',
	during: 'during',
	mid: 'during',
	inrun: 'during',
	after: 'after',
	post: 'after',
	postrun: 'after'
};

function aliasKey(v: unknown): string {
	return typeof v === 'string' ? v.toLowerCase().replace(/[^a-z]/g, '') : '';
}

function toFuelPhase(v: unknown): unknown {
	return FUEL_PHASE_ALIASES[aliasKey(v)] ?? v;
}

function blankToUndefined(v: unknown): unknown {
	if (v == null) return undefined;
	if (typeof v === 'string' && !v.trim()) return undefined;
	return v;
}

function opt<T extends z.ZodType>(schema: T) {
	return z.preprocess(blankToUndefined, schema.optional());
}

function normalizeFuelInput(v: unknown): unknown {
	if (v == null || v === '') return undefined;
	if (typeof v === 'string') {
		const t = v.trim();
		return t ? [{ phase: 'before', item: t, timing: 'as planned' }] : undefined;
	}
	if (Array.isArray(v)) return v.length ? v : undefined;
	if (typeof v === 'object') return [v];
	return v;
}

/** Legacy kit array → one sentence. */
function normalizeKitInput(v: unknown): unknown {
	if (v == null || v === '') return undefined;
	if (typeof v === 'string') return v.trim() || undefined;
	if (Array.isArray(v)) {
		const parts = v
			.map((row) => {
				if (!row || typeof row !== 'object') return '';
				const o = row as Record<string, unknown>;
				const item = String(o.item ?? '').trim();
				const notes = String(o.notes ?? '').trim();
				return item ? (notes ? `${item} (${notes})` : item) : '';
			})
			.filter(Boolean);
		return parts.length ? parts.join('; ') : undefined;
	}
	return v;
}

export const planSessionFuelItemSchema = z
	.object({
		phase: z.preprocess(toFuelPhase, z.enum(FUEL_PHASES, { message: 'use before, during or after' })),
		item: z.preprocess(
			(v) => compactFuelText(v ?? '', MAX_FUEL_ITEM),
			z.string().trim().min(1, 'needs an item').max(MAX_FUEL_ITEM)
		),
		timing: z.preprocess(
			(v) => compactFuelText(v ?? '', MAX_FUEL_TIMING),
			z.string().trim().min(1, 'needs timing — e.g. 45 min before, every 5 km').max(MAX_FUEL_TIMING)
		),
		notes: opt(
			z.preprocess(
				(v) => compactFuelText(v ?? '', MAX_FUEL_NOTES),
				z.string().max(MAX_FUEL_NOTES)
			)
		)
	})
	.transform((row) => ({
		phase: row.phase,
		item: row.item,
		timing: row.timing,
		...(row.notes ? { notes: row.notes } : {})
	}));

export type PlanSessionFuel = z.output<typeof planSessionFuelItemSchema>;

export function planSessionFuelField() {
	return z
		.preprocess(
			normalizeFuelInput,
			z.array(planSessionFuelItemSchema).max(MAX_PLAN_SESSION_FUEL_ITEMS)
		)
		.optional()
		.transform((list) => (list?.length ? list : undefined));
}

export function planSessionKitField() {
	return z
		.preprocess(
			normalizeKitInput,
			z.string().trim().max(MAX_PLAN_SESSION_KIT, `kit must be at most ${MAX_PLAN_SESSION_KIT} characters`)
		)
		.optional()
		.transform((s) => (s?.trim() ? s.trim() : undefined));
}

export function formatPlanSessionFuelRow(row: PlanSessionFuel): string {
	const note = row.notes?.trim();
	return `${row.item} — ${row.timing}${note ? ` (${note})` : ''}`;
}

export function fuelByPhase(items: PlanSessionFuel[]): Record<FuelPhase, PlanSessionFuel[]> {
	const out: Record<FuelPhase, PlanSessionFuel[]> = { before: [], during: [], after: [] };
	for (const row of items) out[row.phase].push(row);
	return out;
}

export function formatPlanSessionFuelMarkdown(items: PlanSessionFuel[]): string {
	return FUEL_PHASES
		.map((phase) => {
			const rows = fuelByPhase(items)[phase];
			if (!rows.length) return '';
			const label = FUEL_PHASE_META[phase].label;
			return `${label}: ${rows.map(formatPlanSessionFuelRow).join('; ')}`;
		})
		.filter(Boolean)
		.join(' · ');
}

export function formatPlanSessionKitMarkdown(kit: string): string {
	return kit.trim();
}

/** Example rows for the generate prompt. */
export const PLAN_SESSION_FUEL_JSON_EXAMPLE = [
	{ phase: 'before', item: 'Coffee', timing: '45 min before' },
	{ phase: 'during', item: 'Gel', timing: 'every 5 km from km 10' }
];

export const PLAN_SESSION_KIT_JSON_EXAMPLE =
	'Long liner shorts; light jacket until 8 km (drop when warm).';
