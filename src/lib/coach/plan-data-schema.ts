import type { Goal, SessionRouteRef } from '$lib/types';
import type { PlanCalendar } from '$lib/plan';
import type { WeekView } from '$lib/plan';
import { z } from 'zod';

function isRecord(v: unknown): v is Record<string, unknown> {
	return v != null && typeof v === 'object';
}

function isPlanCalendar(v: unknown): v is PlanCalendar {
	if (!isRecord(v)) return false;
	return (
		typeof v.startIso === 'string' &&
		typeof v.weekCount === 'number' &&
		Number.isFinite(v.weekCount) &&
		typeof v.rolling === 'boolean'
	);
}

function isWeekView(v: unknown): v is WeekView {
	if (!isRecord(v)) return false;
	if (!isRecord(v.week) || typeof v.week.week !== 'number' || !Number.isFinite(v.week.week)) {
		return false;
	}
	if (!Array.isArray(v.sessions)) return false;
	if (!(v.next === null || isRecord(v.next))) return false;
	if (!Array.isArray(v.unplanned)) return false;
	return true;
}

function isGoal(v: unknown): v is Goal {
	if (!isRecord(v)) return false;
	return (
		typeof v.id === 'string' &&
		typeof v.name === 'string' &&
		typeof v.date === 'string' &&
		typeof v.horizon === 'string' &&
		typeof v.distance_km === 'number' &&
		Number.isFinite(v.distance_km) &&
		typeof v.sport === 'string' &&
		typeof v.status === 'string' &&
		(v.status === 'active' || v.status === 'upcoming' || v.status === 'done')
	);
}

function isSessionRouteRef(v: unknown): v is SessionRouteRef {
	if (!isRecord(v)) return false;
	return (
		typeof v.slug === 'string' &&
		typeof v.name === 'string' &&
		(v.distance_km === null || (typeof v.distance_km === 'number' && Number.isFinite(v.distance_km)))
	);
}

const planCalendarSchema = z.custom<PlanCalendar>(isPlanCalendar, {
	message: 'Invalid plan calendar'
});

const weekViewSchema = z.custom<WeekView>(isWeekView, { message: 'Invalid plan week view' });

const goalSchema = z.custom<Goal>(isGoal, { message: 'Invalid goal' });

const sessionRouteRefSchema = z.custom<SessionRouteRef>(isSessionRouteRef, {
	message: 'Invalid session route ref'
});

/** Runtime contract for `getCoachPlan` / coach route loader `planData`. */
export const coachPlanDataSchema = z.object({
	views: z.array(weekViewSchema),
	currentWeek: z.number().finite(),
	generateWeek: z.number().finite(),
	calendar: planCalendarSchema,
	activeGoal: goalSchema.nullable(),
	intentions: z.array(goalSchema),
	routes: z.array(sessionRouteRefSchema)
});

export type CoachPlanData = z.infer<typeof coachPlanDataSchema>;

export function formatCoachPlanDataIssues(error: z.ZodError, max = 6): string {
	const lines = error.issues.slice(0, max).map((i) => {
		const path = i.path.length ? i.path.join('.') : '(root)';
		return `${path}: ${i.message}`;
	});
	const extra = error.issues.length > max ? ` (+${error.issues.length - max} more)` : '';
	return lines.join('; ') + extra;
}
