/**
 * Training plan helpers + dashboard stats.
 */
import { activityLabel, normalizeActivityType } from '$lib/activity';
import { dayFromIsoDate, formatDuration, parseDurationSeconds } from '$lib/format';
import type { PlanSession, PlanWeek, RunRecord, SessionRouteRef } from '$lib/types';
import { sessionActivityType } from '$lib/week-mix';

/** Monday-start training block. Derived from the active goal, or a 1-week rolling window. */
export type PlanCalendar = {
	startIso: string;
	weekCount: number;
	rolling: boolean;
};

const MAX_PLAN_WEEKS = 52;

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

export function mondayIso(isoOrDate: string | Date): string {
	const d =
		typeof isoOrDate === 'string'
			? new Date(`${isoOrDate.slice(0, 10)}T12:00:00`)
			: new Date(isoOrDate.getFullYear(), isoOrDate.getMonth(), isoOrDate.getDate(), 12, 0, 0);
	if (Number.isNaN(d.getTime())) return isoDateLocal(new Date());
	const off = (d.getDay() + 6) % 7;
	d.setDate(d.getDate() - off);
	return isoDateLocal(d);
}

/** Weeks from start Monday through the week that contains `endIso` (race day). */
export function weeksThrough(startIso: string, endIso: string): number {
	const start = new Date(`${mondayIso(startIso)}T00:00:00`);
	const end = new Date(`${endIso.slice(0, 10)}T00:00:00`);
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 1;
	const idx = Math.floor((end.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
	return Math.max(1, Math.min(MAX_PLAN_WEEKS, idx));
}

export function rollingCalendar(today = new Date()): PlanCalendar {
	return { startIso: mondayIso(today), weekCount: 1, rolling: true };
}

export function calendarFromGoal(goal: { plan_start: string; date: string }): PlanCalendar {
	const startIso = mondayIso(goal.plan_start);
	return { startIso, weekCount: weeksThrough(startIso, goal.date), rolling: false };
}

export function daysUntil(iso: string, today = new Date()): number | null {
	const target = new Date(`${iso.slice(0, 10)}T00:00:00`);
	if (Number.isNaN(target.getTime())) return null;
	const start = new Date(`${isoDateLocal(today)}T00:00:00`);
	return Math.round((target.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

export function weekNumberForDate(dateStr: string, cal: PlanCalendar): number | null {
	const start = new Date(`${cal.startIso}T00:00:00`);
	const d = new Date(`${dateStr}T00:00:00`);
	if (Number.isNaN(d.getTime()) || Number.isNaN(start.getTime())) return null;
	const idx = Math.floor((d.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
	if (idx < 1 || idx > cal.weekCount) return null;
	return idx;
}

export function planWeekIndex(cal: PlanCalendar, today = new Date()): number {
	const start = new Date(`${cal.startIso}T00:00:00`);
	const d = new Date(`${isoDateLocal(today)}T00:00:00`);
	return Math.floor((d.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
}

/**
 * Week the Coach generate prompt should target: always the current plan week.
 * Never past weekCount; before week 1 → week 1.
 */
export function weekToPlan(cal: PlanCalendar, today = new Date()): number {
	const idx = planWeekIndex(cal, today);
	if (idx < 1) return 1;
	return Math.min(cal.weekCount, idx);
}

export function planWeekStartIso(week: number, cal: PlanCalendar): string {
	const start = new Date(`${cal.startIso}T12:00:00`);
	start.setDate(start.getDate() + (week - 1) * 7);
	return isoDateLocal(start);
}

export function planWeekEndIso(week: number, cal: PlanCalendar): string {
	const start = new Date(`${planWeekStartIso(week, cal)}T12:00:00`);
	start.setDate(start.getDate() + 6);
	return isoDateLocal(start);
}

export function planWeekDateRange(week: number, cal: PlanCalendar): string {
	const start = new Date(`${planWeekStartIso(week, cal)}T12:00:00`);
	const end = new Date(start);
	end.setDate(end.getDate() + 6);
	const f = (d: Date) => `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}`;
	return `${f(start)}–${f(end)} ${end.getFullYear()}`;
}

/** Compact chip label, e.g. `3–9 Aug` or `31 Aug–6 Sep`. */
export function planWeekDateRangeShort(week: number, cal: PlanCalendar): string {
	const start = new Date(`${planWeekStartIso(week, cal)}T12:00:00`);
	const end = new Date(start);
	end.setDate(end.getDate() + 6);
	if (start.getMonth() === end.getMonth()) {
		return `${start.getDate()}–${end.getDate()} ${MONTHS[end.getMonth()]}`;
	}
	return `${start.getDate()} ${MONTHS[start.getMonth()]}–${end.getDate()} ${MONTHS[end.getMonth()]}`;
}

function dayMonthLabel(iso: string): string {
	const d = new Date(`${iso}T12:00:00`);
	if (Number.isNaN(d.getTime())) return '';
	return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}`;
}

export function weekBelongsToCalendar(week: PlanWeek, cal: PlanCalendar): boolean {
	if (!Number.isInteger(week.week) || week.week < 1 || week.week > cal.weekCount) return false;
	if (!cal.rolling) return true;
	if (week.start) return week.start === cal.startIso;
	const expected = planWeekDateRange(1, cal);
	if (week.dates && week.dates === expected) return true;
	const label = dayMonthLabel(cal.startIso);
	return Boolean(label && (week.dates || '').includes(label));
}

export function filterPlanForCalendar(plan: PlanWeek[], cal: PlanCalendar): PlanWeek[] {
	return plan.filter((w) => weekBelongsToCalendar(w, cal)).sort((a, b) => a.week - b.week);
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
	/** Past workout with no matching log and no skip language in the plan. */
	unlogged: boolean;
	isToday: boolean;
	isNext: boolean;
	route: SessionRouteRef | null;
};

/** Logged activity in this week that did not consume a planned session (date + sport). */
export type UnplannedActivity = {
	slug: string;
	date: string;
	day: string;
	activity_type: string;
	distance_km: number | null;
	isToday: boolean;
};

export type WeekView = {
	week: PlanWeek;
	sessions: WeekSessionView[];
	next: WeekSessionView | null;
	unplanned: UnplannedActivity[];
};

export type WeekViewRun = Pick<
	RunRecord,
	'date' | 'activity_type' | 'slug' | 'distance_km' | 'start_time'
>;

const SKIP_LANG_RE = /\bskip(?:ped|ping|s)?\b/i;
/** Rest / off days — not recovery workouts like "Recovery easy". */
const REST_LIKE_RE = /^(rest|off|recovery)(\s*(day|only))?$/i;

export function isRestLike(label: string): boolean {
	return REST_LIKE_RE.test(label.trim());
}

/** Past incomplete session: skipped only when the plan says so (not from a missing log). */
export function isSessionSkipped(
	session: Pick<PlanSession, 'label' | 'detail'>,
	date: string | null,
	done: boolean,
	todayIso: string
): boolean {
	if (done || date == null || date >= todayIso) return false;
	return SKIP_LANG_RE.test(`${session.label} ${session.detail}`);
}

/** Past workout with no log and no skip language. Rest/off days stay blank, not unlogged. */
export function isSessionUnlogged(
	label: string,
	date: string | null,
	done: boolean,
	skipped: boolean,
	todayIso: string
): boolean {
	if (done || skipped || date == null || date >= todayIso) return false;
	return !isRestLike(label);
}

function logMatchKey(date: string, activityType: string): string {
	return `${date}|${normalizeActivityType(activityType)}`;
}

function sortLogsForMatch(a: WeekViewRun, b: WeekViewRun): number {
	const at = a.start_time || '99:99';
	const bt = b.start_time || '99:99';
	if (at !== bt) return at < bt ? -1 : 1;
	return (a.slug ?? '').localeCompare(b.slug ?? '');
}

export function buildWeekView(
	week: PlanWeek,
	runs: WeekViewRun[],
	cal: PlanCalendar,
	today = new Date()
): WeekView {
	const todayIso = isoDateLocal(today);
	const start = planWeekStartIso(week.week, cal);
	const end = planWeekEndIso(week.week, cal);
	const buckets = new Map<string, WeekViewRun[]>();
	for (const r of runs) {
		const key = logMatchKey(r.date, r.activity_type);
		const list = buckets.get(key) ?? [];
		list.push(r);
		buckets.set(key, list);
	}
	for (const list of buckets.values()) list.sort(sortLogsForMatch);

	const sessions: WeekSessionView[] = week.sessions.map((s) => {
		const date = dateForSessionDay(start, s.day);
		const isRest = isRestLike(s.label);
		const type = sessionActivityType(s);
		const key = date ? logMatchKey(date, type) : '';
		const list = !isRest && key ? buckets.get(key) : undefined;
		const matched = list?.length ? list.shift() : null;
		const done = matched != null;
		const skipped = isSessionSkipped(s, date, done, todayIso);
		return {
			...s,
			date,
			done,
			skipped,
			unlogged: isSessionUnlogged(s.label, date, done, skipped, todayIso),
			isToday: date === todayIso,
			isNext: false,
			route: null
		};
	});
	const unplanned: UnplannedActivity[] = [];
	for (const list of buckets.values()) {
		for (const r of list) {
			if (r.date < start || r.date > end) continue;
			const day = dayFromIsoDate(r.date);
			if (!day) continue;
			unplanned.push({
				slug: r.slug,
				date: r.date,
				day,
				activity_type: normalizeActivityType(r.activity_type),
				distance_km: r.distance_km ?? null,
				isToday: r.date === todayIso
			});
		}
	}
	unplanned.sort((a, b) => {
		if (a.date !== b.date) return a.date < b.date ? -1 : 1;
		return a.slug.localeCompare(b.slug);
	});
	// Only today / future incomplete sessions count as NEXT. Past unlogged / skipped
	// must not steal the highlight after a later day is already logged. Rest days stay
	// on the board but never become the "next run".
	const next =
		sessions.find(
			(s) =>
				!s.done &&
				!s.skipped &&
				!s.unlogged &&
				!isRestLike(s.label) &&
				(s.date == null || s.date >= todayIso)
		) ?? null;
	if (next) next.isNext = true;
	return { week, sessions, next, unplanned };
}

function clearNext(view: WeekView): WeekView {
	if (!view.next && !view.sessions.some((s) => s.isNext)) return view;
	return {
		...view,
		next: null,
		sessions: view.sessions.map((s) => (s.isNext ? { ...s, isNext: false } : s))
	};
}

/**
 * Each week view independently marks its first remaining session as next.
 * Keep that badge only on the soonest remaining session across the plan.
 */
export function keepSoonestNext(views: WeekView[]): WeekView[] {
	const soonestWeek = [...views]
		.sort((a, b) => a.week.week - b.week.week)
		.find((v) => v.next)?.week.week;
	return views.map((v) => (soonestWeek != null && v.week.week === soonestWeek ? v : clearNext(v)));
}

/**
 * Home banner: current week if it still has a next session, otherwise the soonest
 * later week that already has a plan and a remaining session. Falls back to the
 * current week so a "week complete" state can still render.
 */
export function pickBannerWeekView(
	plan: PlanWeek[],
	runs: WeekViewRun[],
	cal: PlanCalendar,
	today = new Date()
): WeekView | null {
	const currentNum = weekToPlan(cal, today);
	const weeks = [...plan]
		.filter((w) => (w.sessions?.length ?? 0) > 0)
		.sort((a, b) => a.week - b.week);
	let currentView: WeekView | null = null;
	for (const w of weeks) {
		if (w.week < currentNum) continue;
		const view = buildWeekView(w, runs, cal, today);
		if (w.week === currentNum) currentView = view;
		if (view.next) return view;
	}
	if (currentView) return currentView;
	const last = weeks[weeks.length - 1];
	return last ? buildWeekView(last, runs, cal, today) : null;
}

export type WeekDayGroup = {
	day: string;
	date: string | null;
	isToday: boolean;
	sessions: WeekSessionView[];
	unplanned: UnplannedActivity[];
};

function canonicalWeekday(day: string): string {
	return WEEKDAYS.find((d) => d.toLowerCase() === day.trim().toLowerCase()) ?? day.trim();
}

/** Sessions and leftover logs grouped by weekday. Days with only unplanned logs still appear. */
export function weekDayGroups(view: WeekView): WeekDayGroup[] {
	const byDay = new Map<string, { sessions: WeekSessionView[]; unplanned: UnplannedActivity[] }>();
	const bucket = (day: string) => {
		const key = canonicalWeekday(day);
		let g = byDay.get(key);
		if (!g) {
			g = { sessions: [], unplanned: [] };
			byDay.set(key, g);
		}
		return g;
	};
	for (const s of view.sessions) bucket(s.day).sessions.push(s);
	for (const u of view.unplanned) bucket(u.day).unplanned.push(u);
	return WEEKDAYS.filter((d) => byDay.has(d)).map((day) => {
		const g = byDay.get(day)!;
		return {
			day,
			date: g.sessions[0]?.date ?? g.unplanned[0]?.date ?? null,
			isToday: g.sessions.some((s) => s.isToday) || g.unplanned.some((u) => u.isToday),
			sessions: g.sessions,
			unplanned: g.unplanned
		};
	});
}

export function formatUnplannedBrief(items: UnplannedActivity[]): string {
	if (!items.length) return '- (none)';
	return items
		.map((u) => {
			const km = u.distance_km != null ? ` · ${u.distance_km} km` : '';
			return `- ${u.day} (${u.date}): ${activityLabel(u.activity_type)}${km} · slug \`${u.slug}\``;
		})
		.join('\n');
}

function sessionCopyState(s: WeekSessionView): string {
	if (s.done) return 'done';
	if (s.skipped) return 'skipped';
	if (s.unlogged) return 'unlogged — no activity logged yet, do not assume skipped';
	if (s.isNext) return s.isToday ? 'next (today)' : 'next';
	if (s.isToday) return 'today';
	return 'upcoming';
}

export function formatWeekPlanMarkdown(view: WeekView): string {
	const w = view.week;
	const lines = [
		`## Week ${w.week} — ${[w.dates, w.phase, w.focus].filter(Boolean).join(' · ')}`
	];
	const groups = weekDayGroups(view);
	if (!groups.length) {
		lines.push('- (no sessions)');
		return lines.join('\n');
	}
	for (const g of groups) {
		const date = g.date ? ` (${g.date})` : '';
		for (const s of g.sessions) {
			const type = activityLabel(s.activity_type ?? 'run');
			const km = s.distance_km != null ? ` · ${s.distance_km} km` : '';
			lines.push(
				`- ${s.day}${date}: ${type}${km} · ${s.label} — ${s.detail} [${sessionCopyState(s)}]`
			);
		}
		for (const u of g.unplanned) {
			const km = u.distance_km != null ? ` · ${u.distance_km} km` : '';
			lines.push(
				`- ${u.day} (${u.date}): ${activityLabel(u.activity_type)}${km} [unplanned] · slug \`${u.slug}\``
			);
		}
	}
	return lines.join('\n');
}

export function weekToPlanJson(week: PlanWeek): unknown {
	return {
		week: week.week,
		dates: week.dates,
		...(week.start ? { start: week.start } : {}),
		phase: week.phase,
		focus: week.focus,
		sessions: week.sessions.map((s) => ({
			day: s.day,
			activity_type: s.activity_type ?? 'run',
			label: s.label,
			distance_km: s.distance_km,
			detail: s.detail
		}))
	};
}

const COPY_STATUS_HINT =
	'Session states: done / skipped / unlogged / next / upcoming / unplanned. Unplanned logs are extra load, already done — do not add a plan row just to file them. If I ask you to revise remaining sessions, keep completed ones and return one JSON object I can paste back.';

export function formatWeekPlanClipboard(view: WeekView, todayIso: string): string {
	return `# The Long Run — week ${view.week.week} snapshot
Today: ${todayIso}. Use this as the current week if we are switching chats. ${COPY_STATUS_HINT}

${formatWeekPlanMarkdown(view)}

\`\`\`json
${JSON.stringify(weekToPlanJson(view.week), null, 2)}
\`\`\`
`;
}

export function formatAllWeeksClipboard(views: WeekView[], todayIso: string): string {
	const ordered = [...views].sort((a, b) => a.week.week - b.week.week);
	const markdown = ordered.map((v) => formatWeekPlanMarkdown(v)).join('\n\n');
	const json = ordered.map((v) => weekToPlanJson(v.week));
	return `# The Long Run — plan snapshot
Today: ${todayIso}. Weeks below already have sessions. ${COPY_STATUS_HINT}

${markdown || '- (no planned weeks yet)'}

\`\`\`json
${JSON.stringify(json, null, 2)}
\`\`\`
`;
}

/** Attach planned-route refs to a week view. Key is lowercase weekday. */
export function withSessionRoutes(
	view: WeekView,
	byDay: Map<string, SessionRouteRef>
): WeekView {
	const sessions = view.sessions.map((s) => ({
		...s,
		route: byDay.get(s.day.trim().toLowerCase()) ?? null
	}));
	const next = view.next
		? (sessions.find((s) => s.isNext) ?? {
				...view.next,
				route: byDay.get(view.next.day.trim().toLowerCase()) ?? null
			})
		: null;
	return { ...view, sessions, next };
}

export type UpcomingPlanSession = PlanSession & {
	week: number;
	date: string | null;
	phase: string;
};

/** Current and future non-rest, non-strength sessions (today included). */
export function upcomingPlanSessions(
	plan: PlanWeek[],
	cal: PlanCalendar,
	today = new Date()
): UpcomingPlanSession[] {
	const todayIso = isoDateLocal(today);
	const out: UpcomingPlanSession[] = [];
	const weeks = [...plan].sort((a, b) => a.week - b.week);
	for (const w of weeks) {
		const start = planWeekStartIso(w.week, cal);
		for (const s of w.sessions) {
			if (isRestLike(s.label)) continue;
			if (sessionActivityType(s) === 'strength') continue;
			const date = dateForSessionDay(start, s.day);
			if (date && date < todayIso) continue;
			out.push({ ...s, week: w.week, date, phase: w.phase });
		}
	}
	out.sort((a, b) => {
		if (a.date && b.date && a.date !== b.date) return a.date < b.date ? -1 : 1;
		if (a.week !== b.week) return a.week - b.week;
		return a.day.localeCompare(b.day);
	});
	return out;
}

/** Consecutive planned-session dates (from the plan, any weekdays) that have a logged run. */
export function sessionStreak(
	runs: RunRecord[],
	plan: PlanWeek[],
	cal: PlanCalendar,
	today = new Date()
): number {
	const todayIso = isoDateLocal(today);
	const runDates = new Set(
		runs.filter((r) => normalizeActivityType(r.activity_type) === 'run').map((r) => r.date)
	);
	const planned: string[] = [];
	for (const w of plan) {
		const start = planWeekStartIso(w.week, cal);
		for (const s of w.sessions) {
			if (isRestLike(s.label)) continue;
			if (sessionActivityType(s) !== 'run') continue;
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
