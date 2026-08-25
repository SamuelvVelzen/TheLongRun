/**
 * Training trend series for dashboard / timeline sparklines.
 */
import { formatDuration, parseDurationSeconds } from '$lib/format';
import { avg, sumDistance, weekNumberForDate } from '$lib/plan';
import { isoDateLocal } from '$lib/date-range';
import { activityPlural } from '$lib/activity';
import type { RunRecord } from '$lib/types';

export type TrendPoint = {
	/** Short axis label (week number or run date). */
	label: string;
	value: number;
	/** Formatted value for tooltips / captions. */
	display: string;
	/** Run slug for per-run points, so a point can link to its activity. */
	slug?: string;
};

export type TrendSeries = {
	id: string;
	title: string;
	subtitle: string;
	/** Unit suffix shown next to latest value, e.g. `km`, `/km`. */
	unit: string;
	points: TrendPoint[];
	/** Latest point display string. */
	latest: string | null;
	/** First → last delta caption, e.g. `↓0.4` or `→`. */
	delta: string | null;
	/** Whether lower values are better (pace, effort/shins when improving). */
	lowerIsBetter?: boolean;
	/** Render as CSS bars instead of sparkline. */
	bars?: boolean;
};

export type TrainingTrends = {
	series: TrendSeries[];
};

const PACE_MAX_SECS = 60 * 20;
const WEEK_COUNT = 12;
const RUN_SERIES_LIMIT = 16;

function mondayOf(isoDate: string): Date {
	const d = new Date(`${isoDate}T12:00:00`);
	const day = d.getDay(); // 0 Sun … 6 Sat
	const diff = day === 0 ? -6 : 1 - day;
	d.setDate(d.getDate() + diff);
	d.setHours(12, 0, 0, 0);
	return d;
}

function addDays(d: Date, n: number): Date {
	const next = new Date(d);
	next.setDate(next.getDate() + n);
	return next;
}

function shortWeekLabel(iso: string): string {
	const d = new Date(`${iso}T12:00:00`);
	if (Number.isNaN(d.getTime())) return iso.slice(5);
	return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function round1(n: number): number {
	return Math.round(n * 10) / 10;
}

function formatDelta(
	first: number,
	last: number,
	opts: { digits?: number; lowerIsBetter?: boolean; format?: (n: number) => string }
): string {
	const digits = opts.digits ?? 1;
	const diff = last - first;
	const eps = digits === 0 ? 0.5 : 0.05;
	if (Math.abs(diff) < eps) return '→';
	const mag = Math.abs(diff);
	const body = opts.format ? opts.format(mag) : mag.toFixed(digits).replace(/\.0$/, '');
	if (opts.lowerIsBetter) {
		return diff < 0 ? `↓${body}` : `↑${body}`;
	}
	return `${diff > 0 ? '↑' : '↓'}${body}`;
}

function chronological(runs: RunRecord[]): RunRecord[] {
	return [...runs].filter((r) => Boolean(r.date)).sort((a, b) => a.date.localeCompare(b.date));
}

/** Weekly distance buckets ending at `endIso`, optionally clipped by `fromDate`. */
export function buildWeeklyDistance(
	runs: RunRecord[],
	opts?: { weekCount?: number; endDate?: string | null; fromDate?: string | null }
): TrendPoint[] {
	const weekCount = opts?.weekCount ?? WEEK_COUNT;
	const dated = chronological(runs);
	if (!dated.length) return [];

	const endIso =
		opts?.endDate ||
		dated[dated.length - 1]?.date ||
		isoDateLocal(new Date());
	const endMonday = mondayOf(endIso);
	let startMonday = addDays(endMonday, -7 * (weekCount - 1));

	if (opts?.fromDate) {
		const fromMonday = mondayOf(opts.fromDate);
		if (fromMonday.getTime() > startMonday.getTime()) startMonday = fromMonday;
	}

	const buckets = new Map<string, number>();
	for (let cursor = new Date(startMonday); cursor.getTime() <= endMonday.getTime(); cursor = addDays(cursor, 7)) {
		buckets.set(isoDateLocal(cursor), 0);
	}
	if (!buckets.size) return [];

	for (const run of dated) {
		const key = isoDateLocal(mondayOf(run.date));
		if (!buckets.has(key)) continue;
		buckets.set(key, (buckets.get(key) ?? 0) + (run.distance_km ?? 0));
	}

	const entries = [...buckets.entries()];
	const lastIdx = entries.length - 1;
	return entries.map(([iso, raw], i) => {
		const value = round1(raw);
		const weeksAgo = lastIdx - i;
		// Axis reads in weeks, not calendar dates: "now", "-1w", "-2w"…
		const label = weeksAgo === 0 ? 'now' : `-${weeksAgo}w`;
		const wk = weekNumberForDate(iso);
		const wkNote = wk != null ? ` · plan wk ${wk}` : '';
		return { label, value, display: `${value} km · wk of ${shortWeekLabel(iso)}${wkNote}` };
	});
}

function takeLastWithMetric(
	runs: RunRecord[],
	pick: (r: RunRecord) => number | null,
	limit = RUN_SERIES_LIMIT
): { run: RunRecord; value: number }[] {
	const out: { run: RunRecord; value: number }[] = [];
	for (const run of chronological(runs)) {
		const value = pick(run);
		if (value == null || !Number.isFinite(value)) continue;
		out.push({ run, value });
	}
	return out.slice(-limit);
}

function buildPaceSeries(runs: RunRecord[], noun: string): TrendSeries | null {
	const rows = takeLastWithMetric(runs, (r) => {
		const secs = parseDurationSeconds(r.avg_pace);
		if (secs == null || secs <= 0 || secs >= PACE_MAX_SECS) return null;
		return secs;
	});
	if (rows.length < 2) return null;

	const points: TrendPoint[] = rows.map(({ run, value }) => ({
		label: run.date.slice(5),
		value,
		display: `${formatDuration(value)}/km`,
		slug: run.slug
	}));
	const first = points[0]!;
	const last = points[points.length - 1]!;
	return {
		id: 'pace',
		title: 'Pace',
		subtitle: `Last ${points.length} ${noun} with pace`,
		unit: '/km',
		points,
		latest: formatDuration(last.value),
		delta: formatDelta(first.value, last.value, {
			lowerIsBetter: true,
			format: (secs) => formatDuration(secs)
		}),
		lowerIsBetter: true
	};
}

function buildScoreSeries(
	runs: RunRecord[],
	opts: {
		id: string;
		title: string;
		field: 'effort' | 'shins';
		lowerIsBetter: boolean;
		noun: string;
	}
): TrendSeries | null {
	const rows = takeLastWithMetric(runs, (r) => r[opts.field]);
	if (rows.length < 2) return null;

	const points: TrendPoint[] = rows.map(({ run, value }) => ({
		label: run.date.slice(5),
		value,
		display: `${round1(value)}/10`,
		slug: run.slug
	}));
	const first = points[0]!;
	const last = points[points.length - 1]!;
	return {
		id: opts.id,
		title: opts.title,
		subtitle: `Last ${points.length} scored ${opts.noun}`,
		unit: '/10',
		points,
		latest: round1(last.value).toFixed(1).replace(/\.0$/, ''),
		delta: formatDelta(first.value, last.value, {
			digits: 1,
			lowerIsBetter: opts.lowerIsBetter
		}),
		lowerIsBetter: opts.lowerIsBetter
	};
}

function buildHrSeries(runs: RunRecord[], noun: string): TrendSeries | null {
	const rows = takeLastWithMetric(runs, (r) => r.avg_hr);
	if (rows.length < 2) return null;

	const points: TrendPoint[] = rows.map(({ run, value }) => ({
		label: run.date.slice(5),
		value,
		display: `${Math.round(value)} bpm`,
		slug: run.slug
	}));
	const first = points[0]!;
	const last = points[points.length - 1]!;
	return {
		id: 'hr',
		title: 'Heart rate',
		subtitle: `Last ${points.length} ${noun} with HR`,
		unit: 'bpm',
		points,
		latest: String(Math.round(last.value)),
		delta: formatDelta(first.value, last.value, { digits: 0, lowerIsBetter: true }),
		lowerIsBetter: true
	};
}

function buildDistanceSeries(
	runs: RunRecord[],
	opts?: { endDate?: string | null; fromDate?: string | null }
): TrendSeries | null {
	const points = buildWeeklyDistance(runs, opts);
	const withData = points.filter((p) => p.value > 0);
	if (withData.length < 2 && sumDistance(runs) <= 0) return null;
	if (points.every((p) => p.value === 0)) return null;

	const first = withData[0] ?? points[0]!;
	const last = withData[withData.length - 1] ?? points[points.length - 1]!;
	const mean = avg(points.map((p) => p.value));
	const weekLabel = points.length === 1 ? '1 week' : `Last ${points.length} weeks`;

	return {
		id: 'weekly-distance',
		title: 'Weekly distance',
		subtitle: `${weekLabel} · avg ${mean != null ? round1(mean) : '—'} km`,
		unit: 'km',
		points,
		latest: String(last.value),
		delta: withData.length >= 2 ? formatDelta(first.value, last.value, { digits: 1 }) : null,
		bars: true
	};
}

/** Build the coherent trend set used on Dashboard / Timeline. */
export function buildTrainingTrends(
	runs: RunRecord[],
	opts?: { endDate?: string | null; fromDate?: string | null; sport?: string | null }
): TrainingTrends {
	const noun = activityPlural(opts?.sport);
	const series: TrendSeries[] = [];
	const distance = buildDistanceSeries(runs, opts);
	if (distance) series.push(distance);

	const pace = buildPaceSeries(runs, noun);
	if (pace) series.push(pace);

	const effort = buildScoreSeries(runs, {
		id: 'effort',
		title: 'Effort',
		field: 'effort',
		lowerIsBetter: true,
		noun
	});
	if (effort) series.push(effort);

	const shins = buildScoreSeries(runs, {
		id: 'shins',
		title: 'Shins',
		field: 'shins',
		lowerIsBetter: true,
		noun
	});
	if (shins) series.push(shins);

	const hr = buildHrSeries(runs, noun);
	if (hr) series.push(hr);

	return { series };
}
