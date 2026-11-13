import { emptyCoachDebriefData, parseCoachDebriefData, type CoachDebriefData } from './debrief-data';
import { emptyCoachPlanData, parseCoachPlanData, type CoachPlanData } from './plan-data';
import { getCoachPlan, getDebriefPrompt, getWeekPattern } from '$lib/server/functions';
import type { WeekSetup } from '$lib/week-mix';
import type { CoachSearch } from './search';

export type CoachPageData = {
	debrief: CoachDebriefData;
	weekSetup: WeekSetup;
	planData: CoachPlanData;
};

export function loadCoachPage(search: CoachSearch): Promise<CoachPageData> {
	const id = search.id ?? '';
	const slug = search.slug ?? '';
	const includePlan = search.includePlan === true;
	return Promise.all([
		getDebriefPrompt({ data: { id, slug, includePlan } }).catch((err) => {
			console.error('getDebriefPrompt failed', err);
			return emptyCoachDebriefData();
		}),
		getWeekPattern(),
		getCoachPlan().catch((err) => {
			console.error('getCoachPlan failed', err);
			return emptyCoachPlanData();
		})
	]).then(
		([debrief, weekSetup, planData]): CoachPageData => ({
			debrief: parseCoachDebriefData(debrief),
			weekSetup,
			planData: parseCoachPlanData(planData)
		})
	);
}
