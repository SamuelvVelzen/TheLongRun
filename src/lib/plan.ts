/**
 * Training plan helpers + dashboard stats.
 */
import { formatDuration, parseDurationSeconds } from '$lib/format';
import { normalizeActivityType } from '$lib/activity';
import type { PlanSession, PlanWeek, RunRecord } from '$lib/types';

export const PLAN_START_ISO = '2026-08-03';
export const PLAN_WEEK_COUNT = 8;

const WEEKDAYS = [
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday',
	'Sunday'
] as const;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function weekNumberForDate(dateStr: string): number | null {
	const start = new Date(`${PLAN_START_ISO}T00:00:00`);
	const d = new Date(`${dateStr}T00:00:00`);
	if (Number.isNaN(d.getTime())) return null;
	const idx = Math.floor((d.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
	if (idx < 1 || idx > PLAN_WEEK_COUNT) return null;
	return idx;
}

export function planWeekIndex(today = new Date()): number {
	const start = new Date(`${PLAN_START_ISO}T00:00:00`);
	return Math.floor((today.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
}

/**
 * Week the Coach “plan a week” prompt should generate.
 * Mon–Sat: current calendar week (still needs a plan if they skipped Sunday).
 * Sunday: next week (end-of-week ritual). Never past PLAN_WEEK_COUNT; before week 1 → week 1.
 */
export function weekToPlan(today = new Date()): number {
	const idx = planWeekIndex(today);
	if (idx < 1) return 1;
	const target = today.getDay() === 0 ? idx + 1 : idx;
	return Math.min(PLAN_WEEK_COUNT, target);
}

export function planWeekStartIso(week: number): string {
	const start = new Date(`${PLAN_START_ISO}T12:00:00`);
	start.setDate(start.getDate() + (week - 1) * 7);
	return isoDateLocal(start);
}

export function planWeekDateRange(week: number): string {
	const start = new Date(`${planWeekStartIso(week)}T12:00:00`);
	const end = new Date(start);
	end.setDate(end.getDate() + 6);
	const f = (d: Date) => `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}`;
	return `${f(start)}–${f(end)} ${end.getFullYear()}`;
}

export function dateForSessionDay(weekStartIso: string, day: string): string | null {
	const idx = WEEKDAYS.findIndex((d) => d.toLowerCase() === day.trim().toLowerCase());
	if (idx < 0) return null;
	const d = new Date(`${weekStartIso}T12:00:00`);
	if (Number.isNaN(d.getTime())) return null;
	d.setDate(d.getDate() + idx);
	return isoDateLocal(d);
}

export function avg(nums: (number | null | undefined)[]) {
	const vals = nums.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
	if (!vals.length) return null;
	return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function sumDistance(runs: RunRecord[]) {
	return runs.reduce((acc, r) => acc + (r.distance_km ?? 0), 0);
}

export function plannedSessionFor(week: PlanWeek | null, day: string) {
	if (!week) return null;
	return week.sessions.find((s) => s.day.toLowerCase() === day.toLowerCase()) ?? null;
}

export function isoDateLocal(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

function round1(n: number): number {
	return Math.round(n * 10) / 10;
}

export type WeekSessionView = PlanSession & {
	date: string | null;
	done: boolean;
	skipped: boolean;
	isToday: boolean;
	isNext: boolean;
};

export type WeekView = {
	week: PlanWeek;
	sessions: WeekSessionView[];
	next: WeekSessionView | null;
};

const SKIP_LANG_RE = /\bskip(?:ped|ping|s)?\b/i;
const REST_LIKE_RE = /^(rest|off|recovery)(\b|[+\-–—]|$)/i;

/** Past incomplete session: workouts count as skipped; rest/off only if skip language is present. */
export function isSessionSkipped(
	session: Pick<PlanSession, 'label' | 'detail'>,
	date: string | null,
	done: boolean,
	todayIso: string
): boolean {
	if (done || date == null || date >= todayIso) return false;
	const text = `${session.label} ${session.detail}`;
	if (SKIP_LANG_RE.test(text)) return true;
	if (REST_LIKE_RE.test(session.label.trim())) return false;
	return true;
}

export function buildWeekView(
	week: PlanWeek,
	runs: Pick<RunRecord, 'date' | 'activity_type'>[],
	today = new Date()
): WeekView {
	const todayIso = isoDateLocal(today);
	const start = planWeekStartIso(week.week);
	const logged = new Set(runs.map((r) => r.date));
	const sessions: WeekSessionView[] = week.sessions.map((s) => {
		const date = dateForSessionDay(start, s.day);
		const done = date != null && logged.has(date);
		return {
			...s,
			date,
			done,
			skipped: isSessionSkipped(s, date, done, todayIso),
			isToday: date === todayIso,
			isNext: false
		};
	});
	// Only today / future incomplete sessions count as NEXT. Past skips (e.g. Rest)
	// must not steal the highlight after a later day is already logged.
	const next =
		sessions.find((s) => !s.done && !s.skipped && (s.date == null || s.date >= todayIso)) ??
		null;
	if (next) next.isNext = true;
	return { week, sessions, next };
}

/** Consecutive planned-session dates (from the plan, any weekdays) that have a logged run. */
export function sessionStreak(runs: RunRecord[], plan: PlanWeek[], today = new Date()): number {
	const todayIso = isoDateLocal(today);
	const runDates = new Set(
		runs.filter((r) => normalizeActivityType(r.activity_type) === 'run').map((r) => r.date)
	);
	const planned: string[] = [];
	for (const w of plan) {
		const start = planWeekStartIso(w.week);
		for (const s of w.sessions) {
			const d = dateForSessionDay(start, s.day);
			if (d && d <= todayIso) planned.push(d);
		}
	}
	planned.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
	const seen = new Set<string>();
	let streak = 0;
	for (const d of planned) {
		if (seen.has(d)) continue;
		seen.add(d);
		if (runDates.has(d)) streak++;
		else break;
	}
	return streak;
}

export type DashboardStats = {
	daysToRace: number | null;
	totalKm: number;
	runCount: number;
	avgEffort: number | null;
	avgShins: number | null;
	avgHr: number | null;
	elevGain: number;
	monthRuns: number;
	monthKm: number;
	weekKm: number;
	longestKm: number | null;
	avgPace: string | null;
	shinRecent: number | null;
	shinPrior: number | null;
	shinDelta: number | null;
	mappedRuns: number;
	streak: number;
};

export function buildDashboardStats(
	runs: RunRecord[],
	opts: { daysToRace: number | null; mappedRuns: number; streak?: number }
): DashboardStats {
	const now = new Date();
	now.setHours(12, 0, 0, 0);
	const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
	const weekAgo = new Date(now);
	weekAgo.setDate(weekAgo.getDate() - 6);
	const weekStart = isoDateLocal(weekAgo);
	const today = isoDateLocal(now);

	const monthRunsList = runs.filter((r) => r.date.startsWith(monthPrefix));
	const weekRuns = runs.filter((r) => r.date >= weekStart && r.date <= today);

	const distances = runs
		.map((r) => r.distance_km)
		.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
	const longestKm = distances.length ? Math.max(...distances) : null;

	const paceSecs = runs
		.map((r) => parseDurationSeconds(r.avg_pace))
		.filter((n): n is number => n != null && n > 0 && n < 60 * 20);
	const avgPaceSecs = avg(paceSecs);
	const avgPace = avgPaceSecs != null ? formatDuration(avgPaceSecs) : null;

	const withShins = runs.filter((r) => r.shins != null);
	const shinRecent = avg(withShins.slice(0, 4).map((r) => r.shins));
	const shinPrior = avg(withShins.slice(4, 8).map((r) => r.shins));
	const shinDelta =
		shinRecent != null && shinPrior != null ? round1(shinRecent - shinPrior) : null;

	return {
		daysToRace: opts.daysToRace,
		totalKm: round1(sumDistance(runs)),
		runCount: runs.length,
		avgEffort: avg(runs.map((r) => r.effort)),
		avgShins: avg(runs.map((r) => r.shins)),
		avgHr: avg(runs.map((r) => r.avg_hr)),
		elevGain: Math.round(runs.reduce((a, r) => a + (r.elev_gain ?? 0), 0)),
		monthRuns: monthRunsList.length,
		monthKm: round1(sumDistance(monthRunsList)),
		weekKm: round1(sumDistance(weekRuns)),
		longestKm: longestKm != null ? round1(longestKm) : null,
		avgPace,
		shinRecent: shinRecent != null ? round1(shinRecent) : null,
		shinPrior: shinPrior != null ? round1(shinPrior) : null,
		shinDelta,
		mappedRuns: opts.mappedRuns,
		streak: opts.streak ?? 0
	};
}
