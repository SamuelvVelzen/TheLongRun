import { useMemo, useState } from 'react';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { getPlannedRoutesData, importPlannedRoute } from '$lib/server/functions';
import { RoutesHeatmap, type RouteMeta } from '../components/RoutesHeatmap';

export const Route = createFileRoute('/routes')({
	loader: () => getPlannedRoutesData(),
	component: PlannedRoutes
});

function PlannedRoutes() {
	const data = Route.useLoaderData();
	const router = useRouter();
	const [dragOver, setDragOver] = useState(false);
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState('');

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
				<strong>{busy ? 'Saving route…' : 'Drop a GPX route here'}</strong>
				<span className="muted">or click to browse · waypoints are imported when available</span>
			</label>
			{message && <div className="flash">{message}</div>}

			<section className="map-section" aria-labelledby="planned-routes-map">
				<div className="section-title map-section-head">
					<div>
						<h2 id="planned-routes-map">Saved route map</h2>
						<p>
							{data.tracks.length
								? `${data.tracks.length} planned route${data.tracks.length === 1 ? '' : 's'} · click a line to open`
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
				/>
			</section>

			<div className="section-title">
				<div>
					<h2>Saved routes</h2>
					<p>{data.routes.length} total</p>
				</div>
			</div>
			<div className="grid">
				{data.routes.map((route) => (
					<Link
						key={route.slug}
						className="run-row planned-route-row"
						to="/routes/$slug"
						params={{ slug: route.slug }}
					>
						<div>
							<strong className="run-title">{route.name}</strong>
							<div className="muted">
								{[route.place, route.country].filter(Boolean).join(', ') ||
									`Saved ${route.saved_on}`}
							</div>
						</div>
						<div>{route.distance_km ?? '—'} km</div>
						<div>{route.elev_gain != null ? `↑ ${route.elev_gain} m` : 'Elevation —'}</div>
						<div>
							{route.waypoints.length} waypoint{route.waypoints.length === 1 ? '' : 's'}
						</div>
					</Link>
				))}
			</div>
		</>
	);
}
