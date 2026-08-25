/**
 * Shared dashboard/timeline filter search params.
 * Owned by the root route so they survive in-app navigation.
 */
import type { RangeKind } from '$lib/date-range';

export const FILTER_SPORTS = ['all', 'run', 'walk', 'ride', 'swim', 'strength'] as const;

export type FilterSearch = {
	range?: RangeKind;
	from?: string;
	to?: string;
	sport?: string;
	country?: string;
	province?: string;
	place?: string;
};

export const FILTER_SEARCH_KEYS = [
	'range',
	'from',
	'to',
	'sport',
	'country',
	'province',
	'place'
] as const satisfies ReadonlyArray<keyof FilterSearch>;

const RANGE_KINDS: RangeKind[] = ['7d', '30d', 'all', 'custom'];

/** Parse only filter keys; unrelated params are ignored. */
export function validateFilterSearch(s: Record<string, unknown>): FilterSearch {
	return {
		range: RANGE_KINDS.includes(s.range as RangeKind) ? (s.range as RangeKind) : undefined,
		from: typeof s.from === 'string' ? s.from : undefined,
		to: typeof s.to === 'string' ? s.to : undefined,
		sport: FILTER_SPORTS.includes(s.sport as (typeof FILTER_SPORTS)[number])
			? (s.sport as string)
			: undefined,
		country: typeof s.country === 'string' ? s.country : undefined,
		province: typeof s.province === 'string' ? s.province : undefined,
		place: typeof s.place === 'string' ? s.place : undefined
	};
}

/** Explicit undefineds so retainSearchParams treats these as cleared, not missing. */
export function clearFilterSearch(): FilterSearch {
	return {
		range: undefined,
		from: undefined,
		to: undefined,
		sport: undefined,
		country: undefined,
		province: undefined,
		place: undefined
	};
}
