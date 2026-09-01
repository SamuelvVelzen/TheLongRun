/**
 * Goal helpers (active race vs medals). Safe for client and server.
 */
import { normalizeActivityType } from '$lib/activity';
import { mondayIso, weeksThrough } from '$lib/plan';
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
	plan_start: string;
};

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
		plan_start,
		status: existing?.status === 'done' ? 'done' : 'active',
		result: existing?.result ?? null,
		plan: existing?.plan ?? null
	};
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
