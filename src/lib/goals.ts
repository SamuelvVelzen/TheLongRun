/**
 * Goal helpers (soonest open race is active; later races wait; medals are done).
 * Safe for client and server.
 */
import { normalizeActivityType } from '$lib/activity';
import { isoDateLocal, mondayIso, weeksThrough } from '$lib/plan';
import type { Goal, GoalResult, RunRecord } from '$lib/types';

export function goalIdFrom(name: string, date: string): string {
	const slug =
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'race';
	return `${slug}-${date.slice(0, 10)}`;
}

export function emptyGoalDraft(today = new Date()): Omit<Goal, 'id' | 'status' | 'result' | 'plan'> {
	const date = mondayIso(today);
	return {
		name: '',
		date,
		distance_km: 10,
		sport: 'run',
		time_goal: '',
		primary: [],
		notes: '',
		url: '',
		itinerary_url: '',
		plan_start: date
	};
}

export type GoalInput = {
	id?: string;
	name: string;
	date: string;
	distance_km: number;
	sport: string;
	time_goal: string;
	primary: string[];
	notes: string;
	url?: string;
	itinerary_url?: string;
	plan_start: string;
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
	const date = input.date.slice(0, 10);
	const plan_start = mondayIso(input.plan_start || date);
	const id = existing?.id || input.id?.trim() || goalIdFrom(name, date);
	const distance = Number(input.distance_km);
	return {
		id,
		name,
		date,
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
		plan: existing?.plan ?? null
	};
}

/** Soonest open race: next date on/after today, else the most recent unpinned past race. */
export function pickSoonestOpenGoal(goals: Goal[], today = new Date()): Goal | null {
	const todayIso = isoDateLocal(today);
	const open = goals.filter((g) => g.status !== 'done');
	if (!open.length) return null;
	const upcoming = open
		.filter((g) => g.date >= todayIso)
		.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
	if (upcoming[0]) return upcoming[0];
	return [...open].sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name))[0] ?? null;
}

export function stampGoalsByDate(goals: Goal[], today = new Date()): Goal[] {
	const active = pickSoonestOpenGoal(goals, today);
	return goals.map((g) => {
		if (g.status === 'done') return g;
		return { ...g, status: g.id === active?.id ? 'active' : 'upcoming' };
	});
}

export function resultFromActivity(run: Pick<RunRecord, 'slug' | 'date' | 'time' | 'distance_km' | 'avg_pace'>): GoalResult {
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

export function planStartHint(planStart: string, raceDate: string): string {
	const start = mondayIso(planStart);
	const weeks = weeksThrough(start, raceDate);
	const race = new Date(`${raceDate}T12:00:00`);
	const raceLabel = Number.isNaN(race.getTime())
		? raceDate
		: race.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
	return `Week 1 starts Monday ${start} · ${weeks} week${weeks === 1 ? '' : 's'} through ${raceLabel}`;
}
