/**
 * URL-backed date range for Timeline / Dashboard filters.
 * Params: `?range=7d|30d|all|custom` and/or `?from=&to=` (YYYY-MM-DD).
 */
import { formatDuration, parseDurationSeconds } from '$lib/format';
import { avg, sumDistance } from '$lib/plan';
import type { RunRecord } from '$lib/types';

export type RangeKind = '7d' | '30d' | 'all' | 'custom';

export type DateRange = {
	kind: RangeKind;
	/** Inclusive ISO date, or null when unbounded. */
	from: string | null;
	/** Inclusive ISO date, or null when unbounded. */
	to: string | null;
	label: string;
};

export type RangeStats = {
	runCount: number;
	totalKm: number;
	avgPace: string | null;
	avgHr: number | null;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isoDateLocal(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

function todayLocal(now = new Date()): Date {
	const d = new Date(now);
	d.setHours(12, 0, 0, 0);
	return d;
}

function daysAgo(n: number, now = new Date()): string {
	const d = todayLocal(now);
	d.setDate(d.getDate() - (n - 1));
	return isoDateLocal(d);
}

function cleanIso(raw: string | null | undefined): string | null {
	const s = String(raw ?? '').trim();
	return ISO_DATE.test(s) ? s : null;
}

function labelFor(kind: RangeKind, from: string | null, to: string | null): string {
	if (kind === '7d') return 'Last 7 days';
	if (kind === '30d') return 'Last 30 days';
	if (kind === 'all') return 'All time';
	if (from && to) return `${from} → ${to}`;
	if (from) return `From ${from}`;
	if (to) return `Until ${to}`;
	return 'Custom range';
}

/** Resolve search params into a concrete inclusive date window. */
export function parseDateRange(
	searchParams: URLSearchParams,
	now = new Date()
): DateRange {
	const rangeRaw = String(searchParams.get('range') ?? '')
		.trim()
		.toLowerCase();
	const fromParam = cleanIso(searchParams.get('from'));
	const toParam = cleanIso(searchParams.get('to'));

	const today = isoDateLocal(todayLocal(now));

	if (rangeRaw === '7d') {
		return {
			kind: '7d',
			from: daysAgo(7, now),
			to: today,
			label: labelFor('7d', null, null)
		};
	}

	if (rangeRaw === '30d') {
		return {
			kind: '30d',
			from: daysAgo(30, now),
			to: today,
			label: labelFor('30d', null, null)
		};
	}

	if (rangeRaw === 'all' || (!rangeRaw && !fromParam && !toParam)) {
		return { kind: 'all', from: null, to: null, label: labelFor('all', null, null) };
	}

	// custom, or bare from/to without range=
	let from = fromParam;
	let to = toParam;
	if (from && to && from > to) {
		const tmp = from;
		from = to;
		to = tmp;
	}

	if (!from && !to) {
		return { kind: 'all', from: null, to: null, label: labelFor('all', null, null) };
	}

	return {
		kind: 'custom',
		from,
		to,
		label: labelFor('custom', from, to)
	};
}

export function filterRunsByRange<T extends Pick<RunRecord, 'date'>>(
	runs: T[],
	range: DateRange
): T[] {
	if (range.kind === 'all' || (!range.from && !range.to)) return runs;
	return runs.filter((r) => {
		if (range.from && r.date < range.from) return false;
		if (range.to && r.date > range.to) return false;
		return Boolean(r.date);
	});
}

/** Query string for links (leading `?` omitted; empty when all-time). */
export function dateRangeSearch(range: DateRange | RangeKind, from?: string, to?: string): string {
	if (typeof range === 'string') {
		if (range === 'all') return '';
		if (range === '7d' || range === '30d') return `range=${range}`;
		const f = cleanIso(from);
		const t = cleanIso(to);
		const parts: string[] = ['range=custom'];
		if (f) parts.push(`from=${f}`);
		if (t) parts.push(`to=${t}`);
		return parts.join('&');
	}

	if (range.kind === 'all') return '';
	if (range.kind === '7d' || range.kind === '30d') return `range=${range.kind}`;

	const parts: string[] = ['range=custom'];
	if (range.from) parts.push(`from=${range.from}`);
	if (range.to) parts.push(`to=${range.to}`);
	return parts.join('&');
}

export function dateRangeHref(pathname: string, range: DateRange | RangeKind, from?: string, to?: string) {
	const q = dateRangeSearch(range, from, to);
	return q ? `${pathname}?${q}` : pathname;
}

export function buildRangeStats(runs: RunRecord[]): RangeStats {
	const paceSecs = runs
		.map((r) => parseDurationSeconds(r.avg_pace))
		.filter((n): n is number => n != null && n > 0 && n < 60 * 20);
	const avgPaceSecs = avg(paceSecs);

	return {
		runCount: runs.length,
		totalKm: Math.round(sumDistance(runs) * 10) / 10,
		avgPace: avgPaceSecs != null ? formatDuration(avgPaceSecs) : null,
		avgHr: avg(runs.map((r) => r.avg_hr))
	};
}

/** Route track ids (filename without .json) that belong to the given runs. */
export function routeIdsForRuns(runs: Pick<RunRecord, 'route' | 'strava_id'>[]): Set<string> {
	const ids = new Set<string>();
	for (const run of runs) {
		const route = (run.route ?? '').trim();
		if (route) {
			const base = route.split(/[\\/]/).pop() ?? route;
			const name = base.split('?')[0] ?? base;
			if (name.endsWith('.json')) ids.add(name.slice(0, -5));
			else if (name) ids.add(name.replace(/\.json$/i, ''));
		}
		if (run.strava_id) ids.add(run.strava_id);
	}
	return ids;
}
