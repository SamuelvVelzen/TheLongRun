import { appHead } from '$lib/title';
import { loadCoachPage, type CoachPageData } from '$lib/coach/loader';
import { parseCoachDebriefData } from '$lib/coach/debrief-data';
import { parseCoachPlanData } from '$lib/coach/plan-data';
import { type CoachSearch, validateCoachSearch } from '$lib/coach/search';
import { createFileRoute } from '@tanstack/react-router';
import { DeferredData } from '../components/DeferredData';
import { CoachPanels } from '../components/coach/CoachPanels';

export const Route = createFileRoute('/coach')({
	validateSearch: validateCoachSearch,
	loaderDeps: () => ({}),
	loader: ({ location }) => ({
		page: loadCoachPage(location.search as CoachSearch)
	}),
	head: () => appHead('Coach'),
	component: Coach
});

function Coach() {
	const { page } = Route.useLoaderData();

	return (
		<>
			<DeferredData<CoachPageData> promise={page}>
				{(data) => {
					const debrief = parseCoachDebriefData(data.debrief);
					return (
						<CoachPanels
							debrief={debrief}
							initialSetup={data.weekSetup}
							planData={parseCoachPlanData(data.planData)}
							gear={debrief.gear}
							gearWear={debrief.gearWear}
						/>
					);
				}}
			</DeferredData>
		</>
	);
}
