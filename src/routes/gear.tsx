import { SignInPanel, useAuthed } from '$lib/auth';
import { getGearData } from '$lib/server/functions';
import { appHead } from '$lib/title';
import { createFileRoute } from '@tanstack/react-router';
import { DeferredData } from '../components/DeferredData';
import { GearInventory } from '../components/GearInventory';
import { PageHero } from '../components/ui';
import { WardrobePanel } from '../components/WardrobePanel';

export const Route = createFileRoute('/gear')({
	loader: () => ({ page: getGearData() }),
	head: () => appHead('Gear'),
	component: GearPage
});

function GearPage() {
	const { page } = Route.useLoaderData();
	const authed = useAuthed();
	return (
		<>
			<PageHero variant="quiet" kicker="Kit and habits" title="Gear" />
			{!authed ? <SignInPanel title="Sign in to edit gear" /> : null}
			<DeferredData promise={page}>
				{(data) => (
					<>
						<GearInventory
							initial={data.gear}
							wear={data.gearWear}
							habits={data.habits}
							authed={authed}
						/>
						<WardrobePanel initial={data.wardrobe} gear={data.gear} authed={authed} />
					</>
				)}
			</DeferredData>
		</>
	);
}
