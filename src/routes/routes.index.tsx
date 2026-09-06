import { AuthGate, useAuthed } from '$lib/auth';
import {
    createPlannedRoute,
    deletePlannedRoute,
    getPlannedRoutesData,
    importPlannedRoute,
    updatePlannedRoute
} from '$lib/server/functions';
import type { PlannedRoute } from '$lib/types';
import { cn, ui } from '$lib/ui';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { DeferredData } from '../components/DeferredData';
import { DeleteButton } from '../components/DeleteButton';
import { ConfirmDialog } from '../components/Dialog';
import { Icon } from '../components/Icon';
import { PageHero } from '../components/PageHero';
import { MapPinIcon } from '../components/RouteChip';
import { RoutesHeatmap, type RouteMeta } from '../components/RoutesHeatmap';
import { errorMessage, useSnackbar } from '../components/Snackbar';
import { WaypointEditor } from '../components/WaypointEditor';

type RoutesSearch = { draw?: boolean };

export const Route = createFileRoute('/routes/')({
	validateSearch: (s: Record<string, unknown>): RoutesSearch => ({
		draw: s.draw === true || s.draw === '1' || s.draw === 'true' ? true : undefined
	}),
	loader: () => ({ page: getPlannedRoutesData() }),
	component: PlannedRoutes
});

function PlannedRoutes() {
	const { page } = Route.useLoaderData();
	const { draw } = Route.useSearch();
	const router = useRouter();
	const authed = useAuthed();
	const snack = useSnackbar();
	const [dragOver, setDragOver] = useState(false);
	const [busy, setBusy] = useState(false);
	const [drawing, setDrawing] = useState(() => Boolean(draw));
	const [routeName, setRouteName] = useState('');

	useEffect(() => {
		if (draw) setDrawing(true);
	}, [draw]);

	function closeDraw() {
		setDrawing(false);
		if (draw) void router.navigate({ to: '/routes', search: {} });
	}

	async function importFile(file: File | undefined) {
		if (!file) return;
		if (!/\.(gpx|geojson|json)$/i.test(file.name)) {
			snack.error('Use GPX (recommended) or GeoJSON.');
			return;
		}
		setBusy(true);
		try {
			const result = await importPlannedRoute({
				data: { text: await file.text(), filename: file.name }
			});
			snack.success(`Saved ${result.name}`);
			await router.invalidate();
			await router.navigate({ to: '/routes/$slug', params: { slug: result.slug } });
		} catch (error) {
			snack.error(errorMessage(error, 'Import failed'));
			setBusy(false);
		}
	}

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
			setDrawing(false);
			await router.invalidate();
			await router.navigate({ to: '/routes/$slug', params: { slug: result.slug } });
		} catch (error) {
			snack.error(errorMessage(error, 'Could not save route'));
			setBusy(false);
		}
	}

	return (
		<>
			<PageHero
				variant="quiet"
				kicker="Keep planned routes separate from completed activities"
				title="Routes"
				lead={
					<p>
						Draw a loop with pins, or import a <strong>GPX route</strong>. Open it later to attach
						the same loop to upcoming plan days or a logged activity.
					</p>
				}
			/>

			{authed ? (
			<div className="mb-5 grid gap-3">
				{drawing ? (
					<div className={ui.panel}>
						<WaypointEditor
							emptyHint="Tap to drop pins along the loop"
							hint="Place pins in order. Tap a pin to remove it, or tap the line to add one between. Drag to adjust."
							saveLabel="Save route"
							busy={busy}
							onClose={closeDraw}
							onSave={saveDrawn}
						>
							<label className={ui.field}>
								<span className={ui.req}>Name</span>
								<input
									value={routeName}
									required
									autoComplete="off"
									placeholder="Saturday loop"
									disabled={busy}
									onChange={(event) => setRouteName(event.target.value)}
								/>
							</label>
						</WaypointEditor>
					</div>
				) : (
					<button
						className={cn(ui.btnPrimary, 'justify-self-start')}
						type="button"
						onClick={() => setDrawing(true)}
					>
						<Icon name="map" size={16} />
						Draw a route
					</button>
				)}
				{drawing ? null : (
					<label
						className={cn(ui.dropzone, dragOver && ui.dropzoneOver)}
						onDragOver={(event) => {
							event.preventDefault();
							setDragOver(true);
						}}
						onDragLeave={() => setDragOver(false)}
						onDrop={(event) => {
							event.preventDefault();
							setDragOver(false);
							void importFile(event.dataTransfer.files[0]);
						}}
					>
						<input
							type="file"
							accept=".gpx,.geojson,.json,application/gpx+xml,application/geo+json"
							hidden
							disabled={busy}
							onChange={(event) => void importFile(event.target.files?.[0])}
						/>
						<Icon name="upload" size={34} />
						<strong>{busy ? 'Saving route…' : 'Choose a GPX'}</strong>
						<span className={ui.muted}>or tap to browse · waypoints are imported when available</span>
						<span className={cn(ui.muted, 'hidden [@media(hover:hover)_and_(pointer:fine)]:block')}>
							You can also drop a GPX or GeoJSON file here
						</span>
					</label>
				)}
			</div>
			) : null}
			<DeferredData promise={page}>
				{(data) => <PlannedRoutesList data={data} />}
			</DeferredData>
		</>
	);
}

function PlannedRoutesList({
	data
}: {
	data: Awaited<ReturnType<typeof getPlannedRoutesData>>;
}) {
	const meta = useMemo<RouteMeta>(() => {
		const out: RouteMeta = {};
		for (const route of data.routes) {
			const location = [route.place, route.country].filter(Boolean).join(', ');
			const attached =
				route.plan_link_count > 0
					? `${route.plan_link_count} plan day${route.plan_link_count === 1 ? '' : 's'}`
					: '';
			out[route.slug] = {
				slug: route.slug,
				title: route.name,
				sub: [route.distance_km != null ? `${route.distance_km} km` : null, location, attached]
					.filter(Boolean)
					.join(' · ')
			};
		}
		return out;
	}, [data.routes]);

	return (
		<>
			<section className="mb-1" aria-labelledby="planned-routes-map">
				<div className={cn(ui.sectionTitle, 'mt-2')}>
					<div>
						<h2 id="planned-routes-map">Saved route map</h2>
						<p>
							{data.tracks.length
								? `${data.tracks.length} planned route${data.tracks.length === 1 ? '' : 's'} · click a line to open`
								: 'Draw or import a route to see it here'}
						</p>
					</div>
				</div>
				<RoutesHeatmap
					tracks={data.tracks}
					meta={meta}
					focusIds={[]}
					detailPath="/routes/$slug"
					emptyText="No planned routes yet — draw one or import a GPX."
				/>
			</section>

			<div className={ui.sectionTitle}>
				<div>
					<h2>Saved routes</h2>
					<p>{data.routes.length} total · open a route to attach it to a plan day</p>
				</div>
			</div>
			<div className={ui.grid}>
				{data.routes.map((route) => (
					<PlannedRouteRow key={route.slug} route={route} />
				))}
			</div>
		</>
	);
}

function LinkedFlag({
	count,
	kind
}: {
	count: number;
	kind: 'plan' | 'activity';
}) {
	if (count <= 0) return null;
	const noun =
		kind === 'activity'
			? count === 1
				? 'activity'
				: 'activities'
			: count === 1
				? 'plan day'
				: 'plan days';
	return (
		<span className="inline-flex items-center gap-1 text-accent-fg font-bold">
			<MapPinIcon size={13} />
			{count} {noun}
		</span>
	);
}

function linkSummary(route: PlannedRoute) {
	const location = [route.place, route.country].filter(Boolean).join(', ') || `Saved ${route.saved_on}`;
	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
			<span>{location}</span>
			<LinkedFlag count={route.plan_link_count} kind="plan" />
			<LinkedFlag count={route.activity_link_count} kind="activity" />
		</div>
	);
}

function PlannedRouteRow({
	route
}: {
	route: PlannedRoute;
}) {
	const router = useRouter();
	const authed = useAuthed();
	const snack = useSnackbar();
	const [name, setName] = useState(route.name);
	const [pendingDelete, setPendingDelete] = useState(false);

	useEffect(() => {
		setName(route.name);
	}, [route.name]);

	async function persistName() {
		const trimmed = name.trim();
		if (!trimmed) {
			setName(route.name);
			return;
		}
		if (trimmed === route.name) return;
		try {
			await updatePlannedRoute({ data: { slug: route.slug, name: trimmed } });
			await router.invalidate();
		} catch (error) {
			setName(route.name);
			snack.error(errorMessage(error, 'Save failed'));
		}
	}

	async function onDeleteRoute(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		setPendingDelete(true);
	}

	async function confirmDelete() {
		try {
			await deletePlannedRoute({ data: route.slug });
			await router.invalidate();
		} catch (error) {
			snack.error(errorMessage(error, 'Delete failed'));
			throw error;
		}
	}

	return (
		<div className="relative group">
			<div
				className={cn(
					ui.runRow,
					'grid-cols-[1.35fr_0.55fr_0.65fr_0.65fr] pr-[3.25rem] cursor-pointer',
					(route.plan_link_count > 0 || route.activity_link_count > 0) &&
						'border-[color-mix(in_srgb,var(--color-accent)_40%,var(--color-line))]'
				)}
				role="link"
				tabIndex={0}
				title="Open route"
				onClick={() => void router.navigate({ to: '/routes/$slug', params: { slug: route.slug } })}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						void router.navigate({ to: '/routes/$slug', params: { slug: route.slug } });
					}
				}}
			>
				<div>
					{authed ? (
					<input
						className="block w-full max-w-full m-[-0.05rem_-0.35rem_0.15rem] px-[0.35rem] py-[0.05rem] border border-dashed border-transparent rounded-[10px] bg-transparent text-inherit font-inherit font-[650] cursor-text hover:border-line focus:border-solid focus:border-accent focus:outline-none"
						value={name}
						required
						aria-label={`Route name, currently ${route.name}`}
						onClick={(event) => event.stopPropagation()}
						onMouseDown={(event) => event.stopPropagation()}
						onKeyDown={(event) => {
							event.stopPropagation();
							if (event.key === 'Enter') {
								event.preventDefault();
								(event.target as HTMLInputElement).blur();
							}
							if (event.key === 'Escape') {
								event.preventDefault();
								setName(route.name);
								(event.target as HTMLInputElement).blur();
							}
						}}
						onChange={(event) => setName(event.target.value)}
						onBlur={() => void persistName()}
					/>
					) : (
						<div className="font-[650] mb-[0.15rem]">{route.name}</div>
					)}
					<div className={ui.muted}>{linkSummary(route)}</div>
				</div>
				<div>{route.distance_km ?? '—'} km</div>
				<div>{route.elev_gain != null ? `↑ ${route.elev_gain} m` : 'Elevation —'}</div>
				{route.waypoints.length > 0 ? (
					<div>
						{route.waypoints.length} waypoint{route.waypoints.length === 1 ? '' : 's'}
					</div>
				) : null}
			</div>
			<AuthGate>
			<DeleteButton
				className="absolute top-0 bottom-0 right-[0.55rem] z-[2] my-auto opacity-100 sm:opacity-55 group-hover:opacity-100"
				label={`Delete route ${route.name}`}
				onClick={(event) => void onDeleteRoute(event)}
			/>
			</AuthGate>
			<ConfirmDialog
				open={pendingDelete}
				title="Delete this route?"
				description={`“${route.name}” will be removed. This cannot be undone.`}
				onClose={() => setPendingDelete(false)}
				onConfirm={confirmDelete}
			/>
		</div>
	);
}
