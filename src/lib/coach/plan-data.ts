import { rollingCalendar, weekToPlan } from '$lib/plan';
import {
	coachPlanDataSchema,
	formatCoachPlanDataIssues,
	type CoachPlanData
} from './plan-data-schema';

export type { CoachPlanData } from './plan-data-schema';
export { coachPlanDataSchema } from './plan-data-schema';

export function emptyCoachPlanData(): CoachPlanData {
	const calendar = rollingCalendar();
	const currentWeek = weekToPlan(calendar);
	return coachPlanDataSchema.parse({
		views: [],
		currentWeek,
		generateWeek: currentWeek,
		calendar,
		activeGoal: null,
		intentions: [],
		routes: []
	});
}

/** Server / trusted paths — invalid shape throws. */
export function assertCoachPlanData(raw: unknown): CoachPlanData {
	return coachPlanDataSchema.parse(raw);
}

/**
 * Loader and client boundaries — invalid or partial payloads fall back to an empty plan.
 */
export function parseCoachPlanData(raw: unknown): CoachPlanData {
	const result = coachPlanDataSchema.safeParse(raw);
	if (result.success) return result.data;
	console.error('Invalid coach plan data:', formatCoachPlanDataIssues(result.error));
	return emptyCoachPlanData();
}
