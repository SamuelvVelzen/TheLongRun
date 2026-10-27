import { useAuthed } from '$lib/auth';
import { createPlannedRoute } from '$lib/server/functions';
import { appHead } from '$lib/title';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import {
	errorMessage,
	Field,
	PageHero,
	Panel,
	useDiscardGuard,
	useLeaveGuard,
	useSnackbar
} from '../components/ui';
import { reqClass } from '../components/ui/Field';
import { WaypointEditor } from '../components/WaypointEditor';

export const Route = createFileRoute('/routes/draw')({
	head: () => appHead('Draw route'),
	component: DrawRoutePage
});

async function refreshRoutesList(router: ReturnType<typeof useRouter>) {
	await router.invalidate();
	const match = router.state.matches.find((m) => m.routeId === '/routes/');
	const page = (match?.loaderData as { page?: Promise<unknown> } | undefined)?.page;
	if (page) await page;
}

function DrawRoutePage() {
	const router = useRouter();
	const authed = useAuthed();
	const snack = useSnackbar();
	const [busy, setBusy] = useState(false);
	const [routeName, setRouteName] = useState('');
	const [pinsDirty, setPinsDirty] = useState(false);

	const drawDirty = authed && (pinsDirty || routeName.trim() !== '');
	const { guard: leaveGuard, allowNextLeave } = useLeaveGuard({ dirty: drawDirty });

	const [requestCloseDraw, discardGuard] = useDiscardGuard({
		dirty: drawDirty,
		onDiscard: () => {
			allowNextLeave();
			void router.navigate({ to: '/routes' });
		},
		title: 'Discard this draft route?',
		description: 'Your pins and the name will be lost.'
	});

	async function saveDrawn(data: {
		waypoints: { lat: number; lng: number }[];
		followNetwork: boolean;
		networkCoords: { lat: number; lng: number; elev?: number }[];
	}) {
		const name = routeName.trim();
		if (!name) {
			snack.info('Name this route first.');
			return;
		}
		if (data.waypoints.length < 2) {
			snack.info('Drop at least two pins — start and end, plus any turns in between.');
			return;
		}
		setBusy(true);
		try {
			const result = await createPlannedRoute({
				data: {
					name,
					waypoints: data.waypoints,
					follow_network: data.followNetwork,
					network_coords:
						data.followNetwork && data.networkCoords.length >= 2 ? data.networkCoords : undefined
				}
			});
			snack.success(`Saved ${result.name}`);
			setRouteName('');
			setPinsDirty(false);
			allowNextLeave();
			await refreshRoutesList(router);
			allowNextLeave();
			await router.navigate({
				to: '/routes/$slug',
				params: { slug: result.slug },
				resetScroll: true
			});
		} catch (error) {
			snack.error(errorMessage(error, 'Could not save route'));
			setBusy(false);
		}
	}

	if (!authed) {
		return (
			<>
				<PageHero variant="quiet" kicker="Routes" title="Draw a route" />
				<p className="text-muted">Sign in to save drawn routes.</p>
				<Link to="/routes">Back to routes</Link>
			</>
		);
	}

	return (
		<>
			<PageHero
				variant="quiet"
				className="max-sm:mb-3 sm:mb-4"
				kicker={
					<>
						<Link to="/routes">Routes</Link>
						{' · draw'}
					</>
				}
				title="Draw a route"
				lead={
					<p className="m-0 max-sm:hidden text-[0.92rem]">
						Drop pins along the loop, then save. Attach it to plan days or logged activities later.
					</p>
				}
			/>
			<Panel className="mb-5 max-sm:mb-0 max-sm:pb-0">
				<WaypointEditor
					emptyHint="Tap to drop pins along the loop"
					hint="Place pins in order. Tap a pin to remove it, or tap the line to add one between. Drag to adjust."
					saveLabel="Save route"
					closeLabel="Cancel"
					busy={busy}
					stickyFooter
					mapClassName="h-[min(220px,32vh)] w-full z-0 sm:h-[min(300px,38vh)]"
					onDirtyChange={setPinsDirty}
					onClose={requestCloseDraw}
					onSave={saveDrawn}
				>
					<Field as="label">
						<span className={reqClass}>Name</span>
						<input
							value={routeName}
							required
							autoComplete="off"
							placeholder="Saturday loop"
							disabled={busy}
							onChange={(event) => setRouteName(event.target.value)}
						/>
					</Field>
				</WaypointEditor>
			</Panel>
			{leaveGuard}
			{discardGuard}
		</>
	);
}
