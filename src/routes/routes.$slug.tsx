import { useEffect, useState } from 'react';
import { createFileRoute, Link, notFound, useRouter } from '@tanstack/react-router';
import { cn, ui } from '$lib/ui';
import {
	deletePlannedRoute,
	getPlannedRouteDetail,
	updatePlannedRoute
} from '$lib/server/functions';
import {
	downloadPlannedRouteGpx,
	openPlannedRouteInBrouter,
	plannedRouteAppleMapsStartUrl,
	preferredMapsApp,
	type MapsPref
} from '$lib/planned-route-export';
import { PlannedRouteMap } from '../components/PlannedRouteMap';
import { RouteAttach } from '../components/RouteAttach';

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
	const [editing, setEditing] = useState(false);
	const [name, setName] = useState(route.name);
	const [notes, setNotes] = useState(route.notes);
	const [message, setMessage] = useState('');

	async function save(event: React.FormEvent) {
		event.preventDefault();
		try {
			await updatePlannedRoute({ data: { slug: route.slug, name, notes } });
			setEditing(false);
			await router.invalidate();
		} catch (error) {
			setMessage(error instanceof Error ? error.message : 'Save failed');
		}
	}

	async function remove() {
		if (!confirm(`Delete planned route “${route.name}”?`)) return;
		await deletePlannedRoute({ data: route.slug });
		await router.navigate({ to: '/routes' });
	}

	const [mapsPref, setMapsPref] = useState<MapsPref>('desktop');
	const appleMapsUrl = plannedRouteAppleMapsStartUrl(route.geojson, route.name);

	useEffect(() => {
		setMapsPref(preferredMapsApp());
	}, []);

	function openAppleMaps() {
		if (!appleMapsUrl) {
			setMessage('This route has no start point for Apple Maps.');
			return;
		}
		if (mapsPref === 'apple') window.location.assign(appleMapsUrl);
		else window.open(appleMapsUrl, '_blank', 'noopener,noreferrer');
	}

	function openInBrouter() {
		const opened = openPlannedRouteInBrouter(route.geojson, route.waypoints);
		if (!opened) setMessage('This route has too few points for BRouter.');
	}

	const location = [route.place, route.province, route.country].filter(Boolean).join(', ');
	const elevationRange =
		route.elev_min != null && route.elev_max != null
			? `${route.elev_min}–${route.elev_max} m`
			: '—';

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
			setMessage(error instanceof Error ? error.message : 'Save failed');
		}
	}

	return (
		<>
			<section className={cn(ui.hero, ui.heroRoute)}>
				<div>
					<p className={ui.muted}>
						<Link to="/routes">Routes</Link>
						{location ? ` · ${location}` : ''} · saved {route.saved_on}
					</p>
					<h1>
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
					</h1>
					<p>{route.notes || 'Imported from GPX.'}</p>
				</div>
				<div>
					<div className={ui.actions}>
						<button
							className={mapsPref === 'apple' ? ui.btnPrimary : ui.btnGhost}
							type="button"
							onClick={openAppleMaps}
						>
							Apple Maps ↗
						</button>
						<button
							className={mapsPref === 'desktop' ? ui.btnPrimary : ui.btnGhost}
							type="button"
							onClick={openInBrouter}
						>
							Open in BRouter ↗
						</button>
						<button
							className={ui.btnGhost}
							type="button"
							onClick={() => downloadPlannedRouteGpx(route.name, route.geojson, route.waypoints)}
						>
							Download GPX
						</button>
						<button className={ui.btnGhost} type="button" onClick={() => setEditing(!editing)}>
							{editing ? 'Cancel' : 'Edit notes'}
						</button>
						<button
							className={cn(ui.btnGhost, ui.btnDanger)}
							type="button"
							onClick={() => void remove()}
						>
							Delete
						</button>
					</div>
					{appleMapsUrl && (
						<p className={cn(ui.muted, 'mt-3 mb-0 max-w-[36ch] text-[0.92rem]')}>
							Opens a pin at the start. Tap it, then Create a Custom Route, and tap along the trail.
						</p>
					)}
				</div>
			</section>

			{message && <div className={ui.flash}>{message}</div>}
			{editing && (
				<form className={cn(ui.panel, ui.form, 'mb-4')} onSubmit={save}>
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

			<div className={cn(ui.metrics, 'mb-4')}>
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
				<div className={ui.metric}>
					<b>{route.elev_gain ?? '—'}</b>
					<span>elev gain m</span>
				</div>
				<div className={ui.metric}>
					<b>{route.elev_loss ?? '—'}</b>
					<span>elev loss m</span>
				</div>
				<div className={ui.metric}>
					<b>{elevationRange}</b>
					<span>elevation range</span>
				</div>
				<div className={ui.metric}>
					<b>{route.waypoints.length}</b>
					<span>waypoints</span>
				</div>
			</div>

			<div className={cn(ui.panel, 'mb-4 p-0 overflow-hidden')}>
				<div className="p-[1.1rem_1.2rem_0.65rem]">
					<h3>Route</h3>
					<p className={cn(ui.muted, 'mt-1')}>Kilometres and available GPX waypoints are marked</p>
				</div>
				<PlannedRouteMap
					geojson={route.geojson}
					kmMarkers={route.kmMarkers}
					waypoints={route.waypoints}
				/>
			</div>

			<RouteAttach
				slug={route.slug}
				planLinks={route.planLinks}
				activityLinks={route.activityLinks}
				planOptions={route.planOptions}
				activityOptions={route.activityOptions}
			/>

			{route.waypoints.length > 0 && (
				<div className={cn(ui.panel, 'mb-4')}>
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
		</>
	);
}
