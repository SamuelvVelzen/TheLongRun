import { useAuthed } from '$lib/auth';
import {
    downloadPlannedRouteGpx,
    openPlannedRouteInBrouter,
    plannedRouteAppleMapsStartUrl,
    preferredMapsApp,
    type MapsPref
} from '$lib/planned-route-export';
import {
    deletePlannedRoute,
    getPlannedRouteDetail,
    updatePlannedRoute
} from '$lib/server/functions';
import { cn, ui } from '$lib/ui';
import { createFileRoute, Link, notFound, useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { ConfirmDialog } from '../components/Dialog';
import { PageHero } from '../components/PageHero';
import { Icon } from '../components/Icon';
import { PlannedRouteMap } from '../components/PlannedRouteMap';
import { RouteAttach } from '../components/RouteAttach';
import { errorMessage, useSnackbar } from '../components/Snackbar';

export const Route = createFileRoute('/routes/$slug')({
	loader: async ({ params }) => {
		const route = await getPlannedRouteDetail({ data: params.slug });
		if (!route) throw notFound();
		return route;
	},
	component: PlannedRouteDetail
});

function PlannedRouteDetail() {
	const route = Route.useLoaderData();
	const router = useRouter();
	const authed = useAuthed();
	const snack = useSnackbar();
	const [editing, setEditing] = useState(false);
	const [name, setName] = useState(route.name);
	const [notes, setNotes] = useState(route.notes);
	const [pendingDelete, setPendingDelete] = useState(false);

	async function save(event: React.FormEvent) {
		event.preventDefault();
		try {
			await updatePlannedRoute({ data: { slug: route.slug, name, notes } });
			setEditing(false);
			await router.invalidate();
		} catch (error) {
			snack.error(errorMessage(error, 'Save failed'));
		}
	}

	function remove() {
		setPendingDelete(true);
	}

	const [mapsPref, setMapsPref] = useState<MapsPref>('desktop');
	const appleMapsUrl = plannedRouteAppleMapsStartUrl(route.geojson, route.name);

	useEffect(() => {
		setMapsPref(preferredMapsApp());
	}, []);

	function openAppleMaps() {
		if (!appleMapsUrl) {
			snack.info('This route has no start point for Apple Maps.');
			return;
		}
		if (mapsPref === 'apple') window.location.assign(appleMapsUrl);
		else window.open(appleMapsUrl, '_blank', 'noopener,noreferrer');
	}

	function openInBrouter() {
		const opened = openPlannedRouteInBrouter(route.geojson, route.waypoints);
		if (!opened) snack.info('This route has too few points for BRouter.');
	}

	const location = [route.place, route.province, route.country].filter(Boolean).join(', ');
	const elevationRange =
		route.elev_min != null && route.elev_max != null
			? `${route.elev_min}–${route.elev_max} m`
			: null;
	const elevationLabel =
		route.elev_gain != null && route.elev_loss != null
			? `↑${route.elev_gain} ↓${route.elev_loss}`
			: route.elev_gain != null
				? `↑ ${route.elev_gain} m`
				: route.elev_loss != null
					? `↓ ${route.elev_loss} m`
					: elevationRange;
	const viaWaypoints = route.waypoints.filter(
		(point) => point.name !== 'from' && point.name !== 'to'
	);
	const waypointCount = viaWaypoints.length || route.waypoints.length;

	async function persistName() {
		const trimmed = name.trim();
		if (!trimmed) {
			setName(route.name);
			return;
		}
		if (trimmed === route.name) return;
		try {
			await updatePlannedRoute({ data: { slug: route.slug, name: trimmed, notes: route.notes } });
			await router.invalidate();
		} catch (error) {
			snack.error(errorMessage(error, 'Save failed'));
		}
	}

	return (
		<>
			<div className="max-sm:flex max-sm:flex-col">
			<PageHero
				variant="route"
				className="max-sm:contents max-sm:mb-0"
				copyClassName="max-sm:mb-3"
				kicker={
					<>
						<Link to="/routes">Routes</Link>
						{location ? ` · ${location}` : ''} · saved {route.saved_on}
					</>
				}
				title={
					authed ? (
						<input
							className="block w-full max-w-[min(28ch,100%)] m-0 px-[0.4rem] py-[0.1rem] border border-dashed border-line rounded-[10px] bg-transparent text-inherit font-inherit focus:border-solid focus:border-accent focus:outline-none"
							value={name}
							required
							aria-label="Route name"
							onChange={(event) => setName(event.target.value)}
							onBlur={() => void persistName()}
							onKeyDown={(event) => {
								if (event.key === 'Enter') {
									event.preventDefault();
									(event.target as HTMLInputElement).blur();
								}
							}}
						/>
					) : (
						route.name
					)
				}
				lead={<p>{route.notes || 'Imported from GPX.'}</p>}
				actionsClassName="max-sm:order-3 max-sm:mt-1 max-sm:mb-4"
				actions={
					<>
						<button
							className={mapsPref === 'apple' ? ui.btnPrimary : ui.btnGhost}
							type="button"
							onClick={openAppleMaps}
						>
							<Icon name="map" size={16} />
							Apple Maps
							<Icon name="external" size={13} />
						</button>
						<button
							className={mapsPref === 'desktop' ? ui.btnPrimary : ui.btnGhost}
							type="button"
							onClick={openInBrouter}
						>
							<Icon name="routes" size={16} />
							Open in BRouter
							<Icon name="external" size={13} />
						</button>
						<button
							className={ui.btnGhost}
							type="button"
							onClick={() => downloadPlannedRouteGpx(route.name, route.geojson, route.waypoints)}
						>
							<Icon name="download" size={16} />
							Download GPX
						</button>
						{authed && (
							<>
								<button className={ui.btnGhost} type="button" onClick={() => setEditing(!editing)}>
									<Icon name={editing ? 'close' : 'pencil'} size={16} />
									{editing ? 'Cancel' : 'Edit notes'}
								</button>
								<button
									className={cn(ui.btnGhost, ui.btnDanger)}
									type="button"
									onClick={remove}
								>
									Delete
								</button>
							</>
						)}
						{appleMapsUrl && (
							<p className={cn(ui.muted, 'mt-3 mb-0 max-w-[36ch] text-[0.92rem] basis-full')}>
								Opens a pin at the start. Tap it, then Create a Custom Route, and tap along the trail.
							</p>
						)}
					</>
				}
			/>

			{editing && (
				<form className={cn(ui.panel, ui.form, 'mb-4 max-sm:order-4')} onSubmit={save}>
					<label className={ui.field}>
						<span>Notes</span>
						<textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
					</label>
					<div className={ui.actions}>
						<button className={ui.btnPrimary} type="submit">
							Save
						</button>
					</div>
				</form>
			)}

			<div className={cn(ui.panel, 'mb-4 p-0 overflow-hidden max-sm:order-1')}>
				<div className="hidden sm:block p-[1.1rem_1.2rem_0.65rem]">
					<h3>Route</h3>
					<p className={cn(ui.muted, 'mt-1')}>Kilometres and available GPX waypoints are marked</p>
				</div>
				<PlannedRouteMap
					geojson={route.geojson}
					kmMarkers={route.kmMarkers}
					waypoints={route.waypoints}
				/>
			</div>

			<div className={cn(ui.metrics, 'mb-4 max-sm:order-2')}>
				<div className={cn(ui.metric, ui.metricEmph)}>
					<b>{route.distance_km ?? '—'}</b>
					<span>km</span>
				</div>
				{route.est_time && (
					<div className={cn(ui.metric, ui.metricEmph)}>
						<b>{route.est_time}</b>
						<span>estimated time</span>
					</div>
				)}
				{elevationLabel && (
					<div className={ui.metric}>
						<b>{elevationLabel}</b>
						<span>
							{route.elev_gain != null || route.elev_loss != null
								? elevationRange ?? 'elevation'
								: 'elevation'}
						</span>
					</div>
				)}
				{waypointCount > 0 && (
					<div className={ui.metric}>
						<b>{waypointCount}</b>
						<span>{waypointCount === 1 ? 'waypoint' : 'waypoints'}</span>
					</div>
				)}
			</div>

			<div className="max-sm:order-5">
			<RouteAttach
				slug={route.slug}
				planLinks={route.planLinks}
				activityLinks={route.activityLinks}
				planOptions={route.planOptions}
				activityOptions={route.activityOptions}
			/>
			</div>

			{route.waypoints.length > 0 && (
				<div className={cn(ui.panel, 'mb-4 max-sm:order-6')}>
					<h3>Waypoints</h3>
					<div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-0 mt-3 border-t border-line [&>div]:flex [&>div]:flex-col [&>div]:gap-[0.15rem] [&>div]:py-[0.7rem] [&>div]:pr-4 [&>div]:border-b [&>div]:border-line">
						{route.waypoints.map((waypoint, index) => (
							<div key={`${waypoint.name}-${index}`}>
								<strong>{waypoint.name}</strong>
								<span className={ui.muted}>
									{waypoint.lat.toFixed(5)}, {waypoint.lng.toFixed(5)}
								</span>
							</div>
						))}
					</div>
				</div>
			)}
			</div>
			<ConfirmDialog
				open={pendingDelete}
				title="Delete this route?"
				description={`“${route.name}” will be removed. This cannot be undone.`}
				onClose={() => setPendingDelete(false)}
				onConfirm={async () => {
					await deletePlannedRoute({ data: route.slug });
					await router.navigate({ to: '/routes' });
				}}
			/>
		</>
	);
}
