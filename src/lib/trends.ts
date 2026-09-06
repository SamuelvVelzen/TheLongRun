/**
 * Training trend series for dashboard sparklines.
 */
import {
	normalizeActivityType,
	showsFeel,
	type ActivityType,
	type FeelField
} from '$lib/activity';
import { isoDateLocal } from '$lib/date-range';
import { formatDuration, parseDurationSeconds } from '$lib/format';
import { avg, sumDistance, weekNumberForDate, type PlanCalendar } from '$lib/plan';
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
	/** Lower values are better (pace, effort, shins, legs). Colors the delta. */
	lowerIsBetter?: boolean;
	/** Higher values are better (energy). Colors the delta. */
	higherIsBetter?: boolean;
	/** Render as CSS bars instead of sparkline. */
	bars?: boolean;
};

export type TrainingTrends = {
	series: TrendSeries[];
};

const PACE_MAX_SECS = 60 * 20;
const SWIM_PACE_MAX_SECS = 10 * 60;
const RIDE_KPH_MAX = 80;
const WEEK_COUNT = 12;
const RUN_SERIES_LIMIT = 16;
const EASY_SESSIONS = new Set(['easy', 'shakeout', 'steady']);
const PACE_SPORT_ORDER: ActivityType[] = ['run', 'walk', 'ride', 'swim'];

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

function formatHours(secs: number): string {
	if (!Number.isFinite(secs) || secs <= 0) return '';
	const h = secs / 3600;
	if (h >= 10) return `${Math.round(h)}h`;
	if (h >= 1) return `${round1(h)}h`;
	return `${Math.max(1, Math.round(secs / 60))}m`;
}

function formatDelta(
	first: number,
	last: number,
	opts: { digits?: number; format?: (n: number) => string }
): string {
	const digits = opts.digits ?? 1;
	const diff = last - first;
	const eps = digits === 0 ? 0.5 : 0.05;
	if (Math.abs(diff) < eps) return '→';
	const mag = Math.abs(diff);
	const body = opts.format ? opts.format(mag) : mag.toFixed(digits).replace(/\.0$/, '');
	return `${diff > 0 ? '↑' : '↓'}${body}`;
}

function chronological(runs: RunRecord[]): RunRecord[] {
	return [...runs].filter((r) => Boolean(r.date)).sort((a, b) => a.date.localeCompare(b.date));
}

type WeekBucket = { km: number; sessions: number; seconds: number };

/** Weekly distance buckets ending at `endIso`, optionally clipped by `fromDate`. */
export function buildWeeklyDistance(
	runs: RunRecord[],
	opts?: { weekCount?: number; endDate?: string | null; fromDate?: string | null; calendar?: PlanCalendar }
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

	const buckets = new Map<string, WeekBucket>();
	for (let cursor = new Date(startMonday); cursor.getTime() <= endMonday.getTime(); cursor = addDays(cursor, 7)) {
		buckets.set(isoDateLocal(cursor), { km: 0, sessions: 0, seconds: 0 });
	}
	if (!buckets.size) return [];

	for (const run of dated) {
		const key = isoDateLocal(mondayOf(run.date));
		const bucket = buckets.get(key);
		if (!bucket) continue;
		bucket.km += run.distance_km ?? 0;
		bucket.sessions += 1;
		bucket.seconds += parseDurationSeconds(run.time) ?? 0;
	}

	const entries = [...buckets.entries()];
	const lastIdx = entries.length - 1;
	return entries.map(([iso, raw], i) => {
		const value = round1(raw.km);
		const weeksAgo = lastIdx - i;
		const label = weeksAgo === 0 ? 'now' : `-${weeksAgo}w`;
		const wk = opts?.calendar ? weekNumberForDate(iso, opts.calendar) : null;
		const wkNote = wk != null ? ` · plan wk ${wk}` : '';
		const bits = [`${value} km`];
		if (raw.sessions) bits.push(raw.sessions === 1 ? '1 session' : `${raw.sessions} sessions`);
		const dur = formatHours(raw.seconds);
		if (dur) bits.push(dur);
		return {
			label,
			value,
			display: `${bits.join(' · ')} · wk of ${shortWeekLabel(iso)}${wkNote}`
		};
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

function runPaceSecs(run: RunRecord): number | null {
	const secs = parseDurationSeconds(run.avg_pace);
	if (secs == null || secs <= 0 || secs >= PACE_MAX_SECS) return null;
	return secs;
}

function swimPaceSecs(run: RunRecord): number | null {
	const sec = parseDurationSeconds(run.time);
	if (run.distance_km && sec && sec > 0) {
		const per100 = sec / (run.distance_km * 10);
		if (per100 > 0 && per100 < SWIM_PACE_MAX_SECS) return per100;
	}
	const stored = parseDurationSeconds(run.avg_pace);
	if (stored != null && stored > 0 && stored < SWIM_PACE_MAX_SECS) return stored;
	return null;
}

function rideKph(run: RunRecord): number | null {
	const sec = parseDurationSeconds(run.time);
	if (!run.distance_km || !sec || sec <= 0) return null;
	const kph = run.distance_km / (sec / 3600);
	if (!Number.isFinite(kph) || kph < 5 || kph > RIDE_KPH_MAX) return null;
	return kph;
}

function metricForSport(run: RunRecord, sport: ActivityType): number | null {
	if (normalizeActivityType(run.activity_type) !== sport) return null;
	if (sport === 'ride') return rideKph(run);
	if (sport === 'swim') return swimPaceSecs(run);
	if (sport === 'run' || sport === 'walk') return runPaceSecs(run);
	return null;
}

function paceSport(runs: RunRecord[]): ActivityType | null {
	const counts: Partial<Record<ActivityType, number>> = {};
	for (const run of runs) {
		const t = normalizeActivityType(run.activity_type);
		if (t === 'strength') continue;
		if (metricForSport(run, t) == null) continue;
		counts[t] = (counts[t] ?? 0) + 1;
	}
	const present = PACE_SPORT_ORDER.filter((t) => (counts[t] ?? 0) > 0);
	return present[0] ?? null;
}

function isEasySession(run: RunRecord): boolean {
	return EASY_SESSIONS.has(String(run.session || '').toLowerCase());
}

function buildPaceSeries(runs: RunRecord[]): TrendSeries | null {
	const sport = paceSport(runs);
	if (!sport) return null;

	const all = takeLastWithMetric(runs, (r) => metricForSport(r, sport));
	const easy = takeLastWithMetric(runs, (r) => (isEasySession(r) ? metricForSport(r, sport) : null));
	const useEasy = easy.length >= 2;
	const rows = useEasy ? easy : all;
	if (rows.length < 2) return null;

	const lowerIsBetter = sport !== 'ride';
	const unit = sport === 'ride' ? 'km/h' : sport === 'swim' ? '/100m' : '/km';
	const formatValue = (v: number) =>
		sport === 'ride' ? v.toFixed(1).replace(/\.0$/, '') : formatDuration(v);

	const points: TrendPoint[] = rows.map(({ run, value }) => ({
		label: run.date.slice(5),
		value,
		display: `${formatValue(value)}${unit === 'km/h' ? ' km/h' : unit}`,
		slug: run.slug
	}));
	const first = points[0]!;
	const last = points[points.length - 1]!;
	const noun =
		sport === 'run' ? 'runs' : sport === 'walk' ? 'walks' : sport === 'ride' ? 'rides' : 'swims';
	const title =
		sport === 'ride'
			? 'Ride speed'
			: sport === 'swim'
				? 'Swim pace'
				: useEasy && sport === 'run'
					? 'Easy pace'
					: 'Pace';
	const subtitle = useEasy
		? `Last ${points.length} easy ${noun}`
		: `Last ${points.length} with ${sport === 'ride' ? 'speed' : 'pace'}`;

	return {
		id: 'pace',
		title,
		subtitle,
		unit,
		points,
		latest: formatValue(last.value),
		delta: formatDelta(first.value, last.value, {
			format: sport === 'ride' ? (n) => n.toFixed(1).replace(/\.0$/, '') : (secs) => formatDuration(secs)
		}),
		lowerIsBetter: lowerIsBetter || undefined
	};
}

function buildScoreSeries(
	runs: RunRecord[],
	opts: {
		id: string;
		title: string;
		field: FeelField & ('effort' | 'shins' | 'legs' | 'energy');
		lowerIsBetter?: boolean;
		higherIsBetter?: boolean;
	}
): TrendSeries | null {
	const rows = takeLastWithMetric(runs, (r) =>
		showsFeel(r.activity_type, opts.field) ? r[opts.field] : null
	);
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
		subtitle: `Last ${points.length} scored`,
		unit: '/10',
		points,
		latest: round1(last.value).toFixed(1).replace(/\.0$/, ''),
		delta: formatDelta(first.value, last.value, { digits: 1 }),
		lowerIsBetter: opts.lowerIsBetter,
		higherIsBetter: opts.higherIsBetter
	};
}

function buildHrSeries(runs: RunRecord[]): TrendSeries | null {
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
		subtitle: `Last ${points.length} with HR`,
		unit: 'bpm',
		points,
		latest: String(Math.round(last.value)),
		delta: formatDelta(first.value, last.value, { digits: 0 }),
		lowerIsBetter: true
	};
}

function buildDistanceSeries(
	runs: RunRecord[],
	opts?: { endDate?: string | null; fromDate?: string | null; calendar?: PlanCalendar }
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

/** Build the coherent trend set used on Dashboard. */
export function buildTrainingTrends(
	runs: RunRecord[],
	opts?: { endDate?: string | null; fromDate?: string | null; calendar?: PlanCalendar }
): TrainingTrends {
	const series: TrendSeries[] = [];
	const distance = buildDistanceSeries(runs, opts);
	if (distance) series.push(distance);

	const pace = buildPaceSeries(runs);
	if (pace) series.push(pace);

	const effort = buildScoreSeries(runs, {
		id: 'effort',
		title: 'Effort',
		field: 'effort',
		lowerIsBetter: true
	});
	if (effort) series.push(effort);

	const energy = buildScoreSeries(runs, {
		id: 'energy',
		title: 'Energy',
		field: 'energy',
		higherIsBetter: true
	});
	if (energy) series.push(energy);

	const shins = buildScoreSeries(runs, {
		id: 'shins',
		title: 'Shins',
		field: 'shins',
		lowerIsBetter: true
	});
	if (shins) series.push(shins);

	const legs = buildScoreSeries(runs, {
		id: 'legs',
		title: 'Legs',
		field: 'legs',
		lowerIsBetter: true
	});
	if (legs) series.push(legs);

	const hr = buildHrSeries(runs);
	if (hr) series.push(hr);

	return { series };
}
