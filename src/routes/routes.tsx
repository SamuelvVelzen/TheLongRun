import {
	downloadPlannedRouteGpx,
	plannedRouteBrouterUrl,
	plannedRouteBrouterUrlFromTrack
} from '$lib/planned-route-export';
import {
	deletePlannedRoute,
	getPlannedRouteDetail,
	getPlannedRoutesData,
	importPlannedRoute,
	updatePlannedRoute
} from '$lib/server/functions';
import type { PlannedRoute, RouteTrack } from '$lib/types';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { DeferredData } from '../components/DeferredData';
import { RoutesHeatmap, type RouteMeta } from '../components/RoutesHeatmap';

export const Route = createFileRoute('/routes')({
	loader: () => ({ page: getPlannedRoutesData() }),
	component: PlannedRoutes
});

function PlannedRoutes() {
	const { page } = Route.useLoaderData();
	const router = useRouter();
	const [dragOver, setDragOver] = useState(false);
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState('');

	async function importFile(file: File | undefined) {
		if (!file) return;
		if (!/\.(gpx|geojson|json)$/i.test(file.name)) {
			setMessage('Use GPX (recommended) or GeoJSON.');
			return;
		}
		setBusy(true);
		setMessage('');
		try {
			const result = await importPlannedRoute({
				data: { text: await file.text(), filename: file.name }
			});
			await router.invalidate();
			setMessage(`Saved ${result.name} · ${result.distance_km ?? '—'} km`);
		} catch (error) {
			setMessage(error instanceof Error ? error.message : 'Import failed');
		} finally {
			setBusy(false);
		}
	}

	return (
		<>
			<section className="hero">
				<div>
					<p className="muted">Keep planned routes separate from completed activities</p>
					<h1>Routes</h1>
					<p>
						Import a <strong>GPX route</strong> from any planner or device. Tracks, elevation, and
						available waypoints are preserved; GeoJSON is also accepted.
					</p>
				</div>
			</section>

			<label
				className={`dropzone route-import-dropzone${dragOver ? ' dragover' : ''}`}
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
				<strong>{busy ? 'Saving route…' : 'Choose a GPX'}</strong>
				<span className="muted">or tap to browse · waypoints are imported when available</span>
				<span className="muted dropzone-dnd">You can also drop a GPX or GeoJSON file here</span>
			</label>
			{message && <div className="flash">{message}</div>}
			<DeferredData promise={page}>
				{(data) => <PlannedRoutesList data={data} onMessage={setMessage} />}
			</DeferredData>
		</>
	);
}

function PlannedRoutesList({
	data,
	onMessage
}: {
	data: Awaited<ReturnType<typeof getPlannedRoutesData>>;
	onMessage: (msg: string) => void;
}) {
	const tracksBySlug = useMemo(() => {
		const out = new Map<string, RouteTrack>();
		for (const track of data.tracks) out.set(track.id, track);
		return out;
	}, [data.tracks]);
	const routesBySlug = useMemo(() => {
		const out = new Map<string, PlannedRoute>();
		for (const route of data.routes) out.set(route.slug, route);
		return out;
	}, [data.routes]);
	const meta = useMemo<RouteMeta>(() => {
		const out: RouteMeta = {};
		for (const route of data.routes) {
			const location = [route.place, route.country].filter(Boolean).join(', ');
			out[route.slug] = {
				slug: route.slug,
				title: route.name,
				sub: `${route.distance_km ?? '—'} km${location ? ` · ${location}` : ''}`
			};
		}
		return out;
	}, [data.routes]);

	function openRouteInBrouter(slug: string) {
		const route = routesBySlug.get(slug);
		if (!route) {
			onMessage('Route not found.');
			return;
		}
		void openPlannedRouteFromList(route, tracksBySlug.get(slug), onMessage);
	}

	return (
		<>
			<section className="map-section" aria-labelledby="planned-routes-map">
				<div className="section-title map-section-head">
					<div>
						<h2 id="planned-routes-map">Saved route map</h2>
						<p>
							{data.tracks.length
								? `${data.tracks.length} planned route${data.tracks.length === 1 ? '' : 's'} · click a line to open in BRouter`
								: 'Import a route to see it here'}
						</p>
					</div>
				</div>
				<RoutesHeatmap
					tracks={data.tracks}
					meta={meta}
					focusIds={[]}
					detailPath="/routes/$slug"
					emptyText="No planned routes yet — drop a GPX route above."
					onRouteClick={openRouteInBrouter}
				/>
			</section>

			<div className="section-title">
				<div>
					<h2>Saved routes</h2>
					<p>{data.routes.length} total · click a route to open in BRouter</p>
				</div>
			</div>
			<div className="grid">
				{data.routes.map((route) => (
					<PlannedRouteRow
						key={route.slug}
						route={route}
						track={tracksBySlug.get(route.slug)}
						onMessage={onMessage}
					/>
				))}
			</div>
		</>
	);
}

async function openPlannedRouteFromList(
	route: PlannedRoute,
	track: RouteTrack | undefined,
	onMessage: (msg: string) => void
) {
	const url = plannedRouteBrouterUrlFromTrack(route.waypoints, track?.coords ?? []);
	let pendingTab: Window | null = null;
	if (url) {
		window.open(url, '_blank', 'noopener,noreferrer');
	} else {
		pendingTab = window.open('about:blank', '_blank');
	}
	try {
		const detail = await getPlannedRouteDetail({ data: route.slug });
		if (!detail) {
			pendingTab?.close();
			onMessage('Route not found.');
			return;
		}
		downloadPlannedRouteGpx(detail.name, detail.geojson, detail.waypoints);
		if (url) return;
		const fetchedUrl = plannedRouteBrouterUrl(detail.geojson, detail.waypoints);
		if (fetchedUrl && pendingTab) pendingTab.location.href = fetchedUrl;
		else {
			pendingTab?.close();
			onMessage('The GPX was downloaded, but this route has too few points for BRouter.');
		}
	} catch (error) {
		pendingTab?.close();
		onMessage(error instanceof Error ? error.message : 'Could not open route');
	}
}

function PlannedRouteRow({
	route,
	track,
	onMessage
}: {
	route: PlannedRoute;
	track: RouteTrack | undefined;
	onMessage: (msg: string) => void;
}) {
	const router = useRouter();
	const [name, setName] = useState(route.name);

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
			onMessage(error instanceof Error ? error.message : 'Save failed');
		}
	}

	function onOpen() {
		void openPlannedRouteFromList(route, track, onMessage);
	}

	async function onDeleteRoute(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		if (!confirm(`Delete planned route “${route.name}”?`)) return;
		try {
			await deletePlannedRoute({ data: route.slug });
			await router.invalidate();
		} catch (error) {
			onMessage(error instanceof Error ? error.message : 'Delete failed');
		}
	}

	return (
		<div className="planned-route-card">
			<div
				className="run-row planned-route-row"
				title="Open in BRouter and download GPX"
				onClick={onOpen}
			>
				<div>
					<input
						className="route-name-input planned-route-name-input"
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
					<div className="muted">
						{[route.place, route.country].filter(Boolean).join(', ') || `Saved ${route.saved_on}`}
					</div>
				</div>
				<div>{route.distance_km ?? '—'} km</div>
				<div>{route.elev_gain != null ? `↑ ${route.elev_gain} m` : 'Elevation —'}</div>
				<div>
					{route.waypoints.length} waypoint{route.waypoints.length === 1 ? '' : 's'}
				</div>
			</div>
			<button
				className="btn btn-ghost btn-danger btn-icon planned-route-delete"
				type="button"
				aria-label={`Delete route ${route.name}`}
				title="Delete route"
				onClick={(event) => void onDeleteRoute(event)}
			>
				<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
					<path
						fill="currentColor"
						d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9zm-1 12h12l1-12H5l1 12z"
					/>
				</svg>
			</button>
		</div>
	);
}
