import { SignInPanel, useAuthed } from '$lib/auth';
import { getGearData } from '$lib/server/functions';
import { appHead } from '$lib/title';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { DeferredData } from '../components/DeferredData';
import { GearInventory } from '../components/GearInventory';
import { Icon } from '../components/Icon';
import { TabbedPageHeader } from '../components/ui';
import { WardrobePanel } from '../components/WardrobePanel';

type GearTab = 'kit' | 'clothing';
type GearSearch = { tab?: GearTab };

function parseGearTab(v: unknown): GearTab {
	return v === 'clothing' ? 'clothing' : 'kit';
}

export const Route = createFileRoute('/gear')({
	validateSearch: (s: Record<string, unknown>): GearSearch => ({
		tab: parseGearTab(s.tab)
	}),
	loader: () => ({ page: getGearData() }),
	head: () => appHead('Gear'),
	component: GearPage
});

function GearPage() {
	const { page } = Route.useLoaderData();
	const search = Route.useSearch();
	const router = useRouter();
	const authed = useAuthed();
	const tab = parseGearTab(search.tab);

	function setTab(next: GearTab) {
		router.navigate({
			to: '/gear',
			search: { tab: next },
			replace: true,
			resetScroll: false
		});
	}

	return (
		<>
			<TabbedPageHeader
				kicker="Kit and habits"
				title="Gear"
				tabs={{
					'aria-label': 'Gear',
					value: tab,
					onChange: setTab,
					options: [
						{
							value: 'kit',
							label: (
								<>
									<Icon name="shoe" size={15} />
									Kit
								</>
							)
						},
						{
							value: 'clothing',
							label: (
								<>
									<Icon name="gear" size={15} />
									Clothing
								</>
							)
						}
					]
				}}
			/>
			{!authed ? <SignInPanel title="Sign in to edit gear" /> : null}
			<DeferredData promise={page}>
				{(data) =>
					tab === 'kit' ? (
						<GearInventory
							initial={data.gear}
							wear={data.gearWear}
							habits={data.habits}
							authed={authed}
						/>
					) : (
						<WardrobePanel initial={data.wardrobe} gear={data.gear} authed={authed} />
					)
				}
			</DeferredData>
		</>
	);
}
