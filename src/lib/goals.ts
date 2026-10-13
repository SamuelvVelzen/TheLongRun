/**
 * Goal helpers (soonest open race is active; later races wait; medals are done).
 * Safe for client and server.
 */
import { normalizeActivityType } from '$lib/activity';
import { normalizeStartTime } from '$lib/format';
import { daysUntil, isoDateLocal, mondayIso, weeksThrough } from '$lib/plan';
import type { Goal, GoalResult, RunRecord } from '$lib/types';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_HORIZON = /^\d{4}-\d{2}$/;

export function goalIdFrom(name: string, dateOrHorizon: string): string {
	const slug =
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'race';
	const suffix =
		dateOrHorizon
			.trim()
			.replace(/[^0-9-]/g, '')
			.replace(/^-+|-+$/g, '') || 'tbd';
	return `${slug}-${suffix}`;
}

export function isRaceGoal(goal: Pick<Goal, 'date'>): boolean {
	return ISO_DATE.test(goal.date.slice(0, 10));
}

/** Open look-ahead: a target with a month, no booked race day. */
export function isIntentionGoal(goal: Pick<Goal, 'date' | 'status'>): boolean {
	return goal.status !== 'done' && !isRaceGoal(goal);
}

export function normalizeHorizon(raw: string, fromDate = ''): string {
	const date = fromDate.slice(0, 10);
	if (ISO_DATE.test(date)) return date.slice(0, 7);
	const s = String(raw ?? '')
		.trim()
		.slice(0, 7);
	return ISO_HORIZON.test(s) ? s : '';
}

export function formatHorizonLabel(horizon: string): string {
	const m = String(horizon ?? '').match(/^(\d{4})-(\d{2})$/);
	if (!m) return horizon || 'sometime';
	const d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
	if (Number.isNaN(d.getTime())) return horizon;
	return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

export function formatHorizonShort(horizon: string): string {
	const m = String(horizon ?? '').match(/^(\d{4})-(\d{2})$/);
	if (!m) return horizon || '—';
	const d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
	if (Number.isNaN(d.getTime())) return horizon;
	return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

export function isHorizonPast(horizon: string, today = new Date()): boolean {
	const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
	return Boolean(horizon) && horizon < key;
}

export function intentionSortKey(goal: Pick<Goal, 'horizon' | 'name'>): string {
	return `${goal.horizon || '9999-99'}\t${goal.name}`;
}

export function emptyGoalDraft(
	today = new Date()
): Omit<Goal, 'id' | 'status' | 'result' | 'plan'> {
	const date = mondayIso(today);
	return {
		name: '',
		date,
		horizon: date.slice(0, 7),
		distance_km: 10,
		sport: 'run',
		time_goal: '',
		primary: [],
		notes: '',
		url: '',
		itinerary_url: '',
		plan_start: date,
		bib_number: '',
		wave: '',
		start_time: '',
		result_url: '',
		medal_notes: ''
	};
}

export type GoalInput = {
	id?: string;
	name: string;
	date: string;
	horizon?: string;
	distance_km: number;
	sport: string;
	time_goal: string;
	primary: string[];
	notes: string;
	url?: string;
	itinerary_url?: string;
	plan_start: string;
	bib_number?: string;
	wave?: string;
	start_time?: string;
};

/** Drop javascript/data URLs; keep everything else trimmed. */
export function normalizeGoalUrl(raw: string): string {
	const s = String(raw ?? '').trim();
	if (!s) return '';
	if (/^(javascript|data|vbscript):/i.test(s)) return '';
	return s;
}

/** Safe href for an external race/itinerary link, or null if empty/unsafe. */
export function goalUrlHref(raw: string): string | null {
	const s = normalizeGoalUrl(raw);
	if (!s) return null;
	if (/^https?:\/\//i.test(s)) return s;
	if (s.startsWith('//')) return `https:${s}`;
	if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return null;
	return `https://${s}`;
}

export function normalizeGoalInput(input: GoalInput, existing?: Goal | null): Goal {
	const name = input.name.trim() || 'Race';
	const dateRaw = input.date.trim().slice(0, 10);
	const date = ISO_DATE.test(dateRaw) ? dateRaw : '';
	const horizon = normalizeHorizon(input.horizon ?? existing?.horizon ?? '', date);
	const plan_start = date ? mondayIso(input.plan_start || date) : '';
	const id = existing?.id || input.id?.trim() || goalIdFrom(name, date || horizon);
	const distance = Number(input.distance_km);
	return {
		id,
		name,
		date,
		horizon,
		distance_km: Number.isFinite(distance) && distance > 0 ? distance : 10,
		sport: normalizeActivityType(input.sport || 'run'),
		time_goal: input.time_goal.trim(),
		primary: input.primary.map((p) => p.trim()).filter(Boolean),
		notes: input.notes.trim(),
		url: normalizeGoalUrl(input.url ?? existing?.url ?? ''),
		itinerary_url: normalizeGoalUrl(input.itinerary_url ?? existing?.itinerary_url ?? ''),
		plan_start,
		status: existing?.status === 'done' ? 'done' : 'upcoming',
		result: existing?.result ?? null,
		plan: existing?.plan ?? null,
		bib_number: String(input.bib_number ?? existing?.bib_number ?? '').trim(),
		wave: String(input.wave ?? existing?.wave ?? '').trim(),
		start_time: normalizeStartTime(input.start_time ?? existing?.start_time ?? ''),
		result_url: normalizeGoalUrl(existing?.result_url ?? ''),
		medal_notes: String(existing?.medal_notes ?? '').trim()
	};
}

export type MedalDetailsInput = {
	goalId: string;
	bib_number?: string;
	result_url?: string;
	medal_notes?: string;
};

/** Soonest booked race. Look-aheads never become the training target. */
export function pickSoonestOpenGoal(goals: Goal[], today = new Date()): Goal | null {
	const todayIso = isoDateLocal(today);
	const open = goals.filter((g) => g.status !== 'done' && isRaceGoal(g));
	if (!open.length) return null;
	const upcoming = open
		.filter((g) => g.date >= todayIso)
		.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
	if (upcoming[0]) return upcoming[0];
	return (
		[...open].sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name))[0] ??
		null
	);
}

export function openIntentions(goals: Goal[]): Goal[] {
	return goals
		.filter(isIntentionGoal)
		.sort((a, b) => intentionSortKey(a).localeCompare(intentionSortKey(b)));
}

export function stampGoalsByDate(goals: Goal[], today = new Date()): Goal[] {
	const active = pickSoonestOpenGoal(goals, today);
	return goals.map((g) => {
		if (g.status === 'done') return g;
		return { ...g, status: g.id === active?.id ? 'active' : 'upcoming' };
	});
}

/** Distance line for medals: show race distance when the pinned activity distance differs. */
export function formatMedalDistanceLine(
	goal: Pick<Goal, 'distance_km'>,
	result: Pick<GoalResult, 'distance_km'> | null | undefined
): string {
	const raceKm = goal.distance_km;
	const logged = result?.distance_km;
	if (logged == null || !Number.isFinite(logged)) return `${raceKm} km`;
	if (Math.abs(logged - raceKm) < 0.35) return `${logged} km`;
	return `${raceKm} km race · ${logged} km logged`;
}

export function pinnedActivityMismatch(
	goal: Pick<Goal, 'date' | 'sport'>,
	activity: Pick<RunRecord, 'date' | 'activity_type'> | null | undefined
): boolean {
	if (!activity || !isRaceGoal(goal)) return false;
	if (activity.date === goal.date) return false;
	return !activityLooksLikeRace(goal, activity);
}

export function resultFromActivity(
	run: Pick<RunRecord, 'slug' | 'date' | 'time' | 'distance_km' | 'avg_pace'>
): GoalResult {
	return {
		activity_slug: run.slug,
		date: run.date,
		time: run.time || '',
		distance_km: run.distance_km ?? null,
		pace: run.avg_pace || ''
	};
}

/** Same day or ±1 day, same sport — used to offer “this was the race”. */
export function activityLooksLikeRace(
	goal: Pick<Goal, 'date' | 'sport'>,
	run: Pick<RunRecord, 'date' | 'activity_type'>
): boolean {
	const sport = normalizeActivityType(run.activity_type);
	if (sport !== normalizeActivityType(goal.sport)) return false;
	const a = Date.parse(`${run.date}T00:00:00`);
	const b = Date.parse(`${goal.date}T00:00:00`);
	if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
	return Math.abs(a - b) <= 24 * 60 * 60 * 1000;
}

export type GoalPinCandidate = Pick<
	RunRecord,
	'slug' | 'date' | 'day' | 'activity_type' | 'distance_km' | 'time' | 'avg_pace'
>;

/** Recent past races stay in the list; older than this are collapsed until you open them. */
export const PAST_RACE_PIN_DAYS = 7;

export function canPinRaceResult(goal: Pick<Goal, 'date' | 'status'>, today?: Date): boolean {
	if (goal.status === 'done' || !isRaceGoal(goal)) return false;
	const days = daysUntil(goal.date, today);
	return days != null && days <= 1;
}

/** Past, not active, and still inside the week window — shown under Unpinned. */
export function isUnpinnedPastRace(goal: Pick<Goal, 'date'>, today?: Date): boolean {
	if (!isRaceGoal(goal)) return false;
	const days = daysUntil(goal.date, today);
	return days != null && days < 0 && days >= -PAST_RACE_PIN_DAYS;
}

/** Past and older than the week window — hidden by default. */
export function isOlderPastRace(goal: Pick<Goal, 'date'>, today?: Date): boolean {
	if (!isRaceGoal(goal)) return false;
	const days = daysUntil(goal.date, today);
	return days != null && days < -PAST_RACE_PIN_DAYS;
}

export function pinCandidatesForGoal(
	goal: Pick<Goal, 'date' | 'sport'>,
	runs: GoalPinCandidate[],
	limit = 40
): GoalPinCandidate[] {
	if (!isRaceGoal(goal)) return [];
	const raceAt = Date.parse(`${goal.date}T00:00:00`);
	const sport = normalizeActivityType(goal.sport);
	const dayMs = 24 * 60 * 60 * 1000;
	return [...runs]
		.map((r) => {
			const dist = Math.abs(Date.parse(r.date) - raceAt);
			const days = Number.isFinite(dist) ? dist / dayMs : Infinity;
			const sameSport = normalizeActivityType(r.activity_type) === sport;
			const tight = activityLooksLikeRace(goal, r) || r.date === goal.date;
			let rank = Infinity;
			if (tight) rank = 0;
			else if (sameSport && days <= 14) rank = 1;
			else if (sameSport) rank = 2;
			else if (days <= 3) rank = 3;
			return { r, rank, dist };
		})
		.filter((x) => x.rank < Infinity)
		.sort((a, b) => {
			if (a.rank !== b.rank) return a.rank - b.rank;
			if (a.dist !== b.dist) return a.dist - b.dist;
			return a.r.date < b.r.date ? 1 : -1;
		})
		.slice(0, limit)
		.map((x) => ({
			slug: x.r.slug,
			date: x.r.date,
			day: x.r.day,
			activity_type: x.r.activity_type,
			distance_km: x.r.distance_km,
			time: x.r.time,
			avg_pace: x.r.avg_pace
		}));
}

/** Keep the training-block length when the race date moves. */
export function shiftPlanStartWithRaceDate(
	planStart: string,
	fromRaceDate: string,
	toRaceDate: string
): string {
	const from = fromRaceDate.slice(0, 10);
	const to = toRaceDate.slice(0, 10);
	if (!to) return mondayIso(planStart || from);
	if (!from || from === to) return mondayIso(planStart || to);
	const weeks = weeksThrough(planStart || from, from);
	const raceMonday = mondayIso(to);
	const d = new Date(`${raceMonday}T12:00:00`);
	if (Number.isNaN(d.getTime())) return mondayIso(planStart || to);
	d.setDate(d.getDate() - (weeks - 1) * 7);
	return isoDateLocal(d);
}

export function planStartHint(planStart: string, raceDate: string): string {
	if (!ISO_DATE.test(raceDate.slice(0, 10))) return '';
	const start = mondayIso(planStart);
	const weeks = weeksThrough(start, raceDate);
	const race = new Date(`${raceDate}T12:00:00`);
	const raceLabel = Number.isNaN(race.getTime())
		? raceDate
		: race.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
	return `Week 1 starts Monday ${start} · ${weeks} week${weeks === 1 ? '' : 's'} through ${raceLabel}`;
}

export function formatIntentionPromptLine(
	goal: Pick<Goal, 'name' | 'distance_km' | 'horizon' | 'notes'>
): string {
	const when = formatHorizonLabel(goal.horizon);
	const note = goal.notes.trim() ? ` Notes: ${goal.notes.trim()}` : '';
	return `- Intention (not booked): ${goal.name} — ${goal.distance_km} km in ${when}. Date unknown. Use as a look-ahead constraint, not as race week. Do not peak or taper for this.${note}`;
}

export function formatLaterRacePromptLine(
	goal: Pick<Goal, 'name' | 'distance_km' | 'date'>
): string {
	return `- Later: ${goal.name} — ${goal.distance_km} km on ${goal.date} (not the current training target)`;
}
