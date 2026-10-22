import type { RangeKind } from '$lib/date-range';

export type CoachTab = 'training' | 'debrief' | 'plan' | 'generate';

export type CoachSearch = RangeSearch & {
	tab?: CoachTab;
	/** Comma-separated activity ids for debrief. */
	id?: string;
	/** @deprecated Legacy comma-separated slugs — use `id`. */
	slug?: string;
	planWeek?: number;
	includePlan?: boolean;
};

export type RangeSearch = {
	range?: RangeKind;
	from?: string;
	to?: string;
};

export const RANGE_KINDS: RangeKind[] = ['7d', '30d', 'all', 'custom'];

export function withCoachSearch(search: CoachSearch, extra: Partial<CoachSearch> = {}): CoachSearch {
	const id = extra.id !== undefined ? extra.id : search.id;
	const slug = extra.slug !== undefined ? extra.slug : search.slug;
	const includePlan = extra.includePlan !== undefined ? extra.includePlan : search.includePlan;
	return {
		tab: extra.tab ?? search.tab,
		id: id || undefined,
		slug: slug || undefined,
		planWeek: extra.planWeek !== undefined ? extra.planWeek : search.planWeek,
		includePlan: includePlan === true ? true : undefined,
		range: extra.range !== undefined ? extra.range : search.range,
		from: extra.from !== undefined ? extra.from : search.from,
		to: extra.to !== undefined ? extra.to : search.to
	};
}

export function parseCoachTab(v: unknown): CoachTab | undefined {
	if (v === 'training' || v === 'plan' || v === 'generate' || v === 'debrief') return v;
	return undefined;
}

export function parsePlanWeek(v: unknown): number | undefined {
	const n = Number(v);
	if (!Number.isFinite(n)) return undefined;
	const week = Math.floor(n);
	if (week < 1 || week > 52) return undefined;
	return week;
}

export function validateCoachSearch(s: Record<string, unknown>): CoachSearch {
	return {
		range: RANGE_KINDS.includes(s.range as RangeKind) ? (s.range as RangeKind) : undefined,
		from: typeof s.from === 'string' ? s.from : undefined,
		to: typeof s.to === 'string' ? s.to : undefined,
		tab: parseCoachTab(s.tab),
		id: typeof s.id === 'string' && s.id ? s.id : undefined,
		slug: typeof s.slug === 'string' && s.slug ? s.slug : undefined,
		planWeek: parsePlanWeek(s.planWeek),
		includePlan:
			s.includePlan === true || s.includePlan === 'true' || s.includePlan === '1' ? true : undefined
	};
}
