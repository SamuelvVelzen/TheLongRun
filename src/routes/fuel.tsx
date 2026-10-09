import { useAuthed } from '$lib/auth';
import { getFuelData } from '$lib/server/functions';
import { appHead } from '$lib/title';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { DeferredData } from '../components/DeferredData';
import { FuelLog, parseFuelTab, type FuelTab } from '../components/FuelLog';
import { PageHero } from '../components/PageHero';

type FuelSearch = { tab?: FuelTab };

export const Route = createFileRoute('/fuel')({
	validateSearch: (s: Record<string, unknown>): FuelSearch => ({
		tab: parseFuelTab(s.tab)
	}),
	loaderDeps: () => ({}),
	loader: () => ({ page: getFuelData() }),
	head: () => appHead('Fuel'),
	component: FuelPage
});

function FuelPage() {
	const { page } = Route.useLoaderData();
	const search = Route.useSearch();
	const router = useRouter();
	const authed = useAuthed();
	const tab = parseFuelTab(search.tab);

	function setTab(next: FuelTab) {
		router.navigate({
			to: '/fuel',
			search: { tab: next },
			replace: true,
			resetScroll: false
		});
	}

	return (
		<>
			<PageHero
				variant="quiet"
				kicker="Food and drink"
				title="Fuel"
				lead="Track what you eat or drink before, during, and after runs, and how your stomach handled it. Most useful once runs pass about an hour — for example when you start training for half marathons, need to fuel mid-run, and want race day to hold no surprises."
			/>
			<DeferredData promise={page}>
				{(data) => (
					<FuelLog
						initial={data.log}
						runsBySlug={data.runsBySlug}
						promptTemplate={data.promptTemplate}
						authed={authed}
						tab={tab}
						onTabChange={setTab}
					/>
				)}
			</DeferredData>
		</>
	);
}
