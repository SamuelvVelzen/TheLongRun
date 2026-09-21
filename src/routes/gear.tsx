import { useAuthed } from '$lib/auth';
import { getGearData } from '$lib/server/functions';
import { appHead } from '$lib/title';
import { createFileRoute } from '@tanstack/react-router';
import { DeferredData } from '../components/DeferredData';
import { GearInventory } from '../components/GearInventory';
import { PageHero } from '../components/PageHero';

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
			<PageHero
				variant="quiet"
				kicker="Shoes and bikes"
				title="Gear"
				lead="Default kit is used when you log or import that sport. Mileage is counted from logged activities."
			/>
			<DeferredData promise={page}>
				{(data) => <GearInventory initial={data.gear} wear={data.gearWear} authed={authed} />}
			</DeferredData>
		</>
	);
}
