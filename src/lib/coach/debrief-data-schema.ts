import { emptyActivityHabits, type ActivityHabits } from '$lib/activity-habits';
import { emptyGear, wearByAllGear, type GearContext } from '$lib/gear';
import type { DebriefRaceHint } from '$lib/debrief-types';
import type { WeekView } from '$lib/plan';
import { z } from 'zod';
import type { CoachDebriefData, CoachDebriefRun, CoachDebriefUnit } from './coach-debrief-types';

function isRecord(v: unknown): v is Record<string, unknown> {
	return v != null && typeof v === 'object';
}

function isGearContext(v: unknown): v is GearContext {
	if (!isRecord(v)) return false;
	return isRecord(v.shoes) && isRecord(v.walk_shoes) && isRecord(v.bike);
}

function isActivityHabits(v: unknown): v is ActivityHabits {
	return isRecord(v);
}

function isWeekView(v: unknown): v is WeekView | null {
	if (v === null) return true;
	if (!isRecord(v)) return false;
	return isRecord(v.week) && Array.isArray(v.sessions);
}

function isCoachDebriefRun(v: unknown): v is CoachDebriefRun {
	if (!isRecord(v)) return false;
	return (
		typeof v.id === 'number' &&
		typeof v.slug === 'string' &&
		typeof v.date === 'string' &&
		typeof v.hasFeel === 'boolean'
	);
}

function isCoachDebriefUnit(v: unknown): v is CoachDebriefUnit {
	if (!isRecord(v)) return false;
	return (
		(v.kind === 'single' || v.kind === 'group') &&
		typeof v.slug === 'string' &&
		isCoachDebriefRun(v.run) &&
		Array.isArray(v.members) &&
		v.members.every(isCoachDebriefRun)
	);
}

function isCoachDebriefData(v: unknown): v is CoachDebriefData {
	if (!isRecord(v)) return false;
	return (
		typeof v.prompt === 'string' &&
		Array.isArray(v.runs) &&
		v.runs.every(isCoachDebriefRun) &&
		Array.isArray(v.units) &&
		v.units.every(isCoachDebriefUnit) &&
		isRecord(v.raceBySlug) &&
		isGearContext(v.gear) &&
		isRecord(v.gearWear) &&
		isActivityHabits(v.habits) &&
		isWeekView(v.weekView) &&
		(v.error === null || typeof v.error === 'string')
	);
}

export const coachDebriefDataSchema = z.custom<CoachDebriefData>(isCoachDebriefData, {
	message: 'Invalid coach debrief payload'
});

export function emptyCoachDebriefData(): CoachDebriefData {
	return coachDebriefDataSchema.parse({
		prompt: '',
		run: null,
		runs: [],
		units: [],
		raceBySlug: {} as Record<string, DebriefRaceHint | null>,
		gear: emptyGear(),
		gearWear: wearByAllGear([]),
		habits: emptyActivityHabits(),
		weekView: null,
		error: null
	});
}

export function formatCoachDebriefDataIssues(error: z.ZodError, max = 6): string {
	const lines = error.issues.slice(0, max).map((i) => {
		const path = i.path.length ? i.path.join('.') : '(root)';
		return `${path}: ${i.message}`;
	});
	const extra = error.issues.length > max ? ` (+${error.issues.length - max} more)` : '';
	return lines.join('; ') + extra;
}

export function assertCoachDebriefData(raw: unknown): CoachDebriefData {
	return coachDebriefDataSchema.parse(raw);
}

export function parseCoachDebriefData(raw: unknown): CoachDebriefData {
	const result = coachDebriefDataSchema.safeParse(raw);
	if (result.success) return result.data;
	console.error('Invalid coach debrief data:', formatCoachDebriefDataIssues(result.error));
	return emptyCoachDebriefData();
}
