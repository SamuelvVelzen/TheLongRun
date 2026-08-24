import { useState } from 'react';
import { createFileRoute, notFound, useRouter } from '@tanstack/react-router';
import {
	deletePlannedRoute,
	getPlannedRouteDetail,
	updatePlannedRoute
} from '$lib/server/functions';
import { openPlannedRouteInBrouter } from '$lib/planned-route-export';
import { PlannedRouteMap } from '../components/PlannedRouteMap';

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

	function openInBrouter() {
		const opened = openPlannedRouteInBrouter(route.name, route.geojson, route.waypoints);
		if (!opened) setMessage('The GPX was downloaded, but this route has too few points for BRouter.');
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
			<section className="hero hero-route">
				<div>
					<p className="muted">
						Planned route{location ? ` · ${location}` : ''} · saved {route.saved_on}
					</p>
					<h1>
						<input
							className="route-name-input"
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
				<div className="actions">
					<button className="btn btn-primary" type="button" onClick={openInBrouter}>
						Open in BRouter ↗
					</button>
					<button className="btn btn-ghost" type="button" onClick={() => setEditing(!editing)}>
						{editing ? 'Cancel' : 'Edit notes'}
					</button>
					<button className="btn btn-ghost btn-danger" type="button" onClick={() => void remove()}>
						Delete
					</button>
				</div>
			</section>

			{message && <div className="flash">{message}</div>}
			{editing && (
				<form className="panel form" onSubmit={save} style={{ marginBottom: '1rem' }}>
					<label className="field">
						<span>Notes</span>
						<textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
					</label>
					<div className="actions">
						<button className="btn btn-primary" type="submit">
							Save
						</button>
					</div>
				</form>
			)}

			<div className="metrics metrics-primary planned-route-metrics">
				<div className="metric metric-emph">
					<b>{route.distance_km ?? '—'}</b>
					<span>km</span>
				</div>
				{route.est_time && (
					<div className="metric metric-emph">
						<b>{route.est_time}</b>
						<span>estimated time</span>
					</div>
				)}
				<div className="metric">
					<b>{route.elev_gain ?? '—'}</b>
					<span>elev gain m</span>
				</div>
				<div className="metric">
					<b>{route.elev_loss ?? '—'}</b>
					<span>elev loss m</span>
				</div>
				<div className="metric">
					<b>{elevationRange}</b>
					<span>elevation range</span>
				</div>
				<div className="metric">
					<b>{route.waypoints.length}</b>
					<span>waypoints</span>
				</div>
			</div>

			<div className="panel planned-route-map-panel">
				<div className="planned-route-map-head">
					<h3>Route</h3>
					<p className="muted">Kilometres and available GPX waypoints are marked</p>
				</div>
				<PlannedRouteMap
					geojson={route.geojson}
					kmMarkers={route.kmMarkers}
					waypoints={route.waypoints}
				/>
			</div>

			{route.waypoints.length > 0 && (
				<div className="panel planned-waypoints">
					<h3>Waypoints</h3>
					<div className="planned-waypoint-list">
						{route.waypoints.map((waypoint, index) => (
							<div key={`${waypoint.name}-${index}`}>
								<strong>{waypoint.name}</strong>
								<span className="muted">
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
