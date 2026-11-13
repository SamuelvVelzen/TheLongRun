import { emptyCoachPlanData, parseCoachPlanData, type CoachPlanData } from './plan-data';
import { getCoachPlan, getDebriefPrompt, getWeekPattern } from '$lib/server/functions';
import type { WeekSetup } from '$lib/week-mix';
import type { CoachSearch } from './search';

export type CoachPageDebrief = Awaited<ReturnType<typeof getDebriefPrompt>>;

export type CoachPageData = {
	debrief: CoachPageDebrief;
	weekSetup: WeekSetup;
	planData: CoachPlanData;
};

export function loadCoachPage(search: CoachSearch): Promise<CoachPageData> {
	const id = search.id ?? '';
	const slug = search.slug ?? '';
	const includePlan = search.includePlan === true;
	return Promise.all([
		getDebriefPrompt({ data: { id, slug, includePlan } }),
		getWeekPattern(),
		getCoachPlan().catch((err) => {
			console.error('getCoachPlan failed', err);
			return emptyCoachPlanData();
		})
	]).then(
		([debrief, weekSetup, planData]): CoachPageData => ({
			debrief,
			weekSetup,
			planData: parseCoachPlanData(planData)
		})
	);
}
