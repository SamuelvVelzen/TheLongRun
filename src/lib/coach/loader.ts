import { getCoachPlan, getDebriefPrompt, getWeekPattern } from '$lib/server/functions';
import type { CoachSearch } from './search';

export function loadCoachPage(search: CoachSearch) {
	const id = search.id ?? '';
	const slug = search.slug ?? '';
	const includePlan = search.includePlan === true;
	return Promise.all([
		getDebriefPrompt({ data: { id, slug, includePlan } }),
		getWeekPattern(),
		getCoachPlan()
	]).then(([debrief, weekSetup, planData]) => ({ debrief, weekSetup, planData }));
}
