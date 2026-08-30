import { analyticsFromProperties, type RouteAnalytics, type TrackSample } from '$lib/splits';
import type { RunRecord } from '$lib/types';
import { getSql, parseJsonColumn } from './db';
import { polylineFromGeoJson, polylineJson } from './routes';

/** Resolve the stored route id from a run (`/routes/{id}.json` or strava_id). */
export function routeIdForRun(run: Pick<RunRecord, 'route' | 'strava_id'>): string | null {
	const fromRoute = String(run.route || '')
		.trim()
		.replace(/^.*\//, '')
		.replace(/\?.*$/, '')
		.replace(/\.json$/i, '');
	if (fromRoute) return fromRoute;
	const id = String(run.strava_id || '').trim();
	return id || null;
}

/** Upsert a route's GeoJSON track by id, plus a downsampled heatmap polyline. */
export async function saveRouteGeoJson(id: string, geojson: unknown): Promise<void> {
	const sql = getSql();
	const line = polylineJson(polylineFromGeoJson(geojson));
	await sql`
		INSERT INTO routes (id, geojson, polyline)
		VALUES (${id}, ${JSON.stringify(geojson)}, ${line})
		ON CONFLICT (id) DO UPDATE SET geojson = EXCLUDED.geojson, polyline = EXCLUDED.polyline
	`;
}

/** Fetch the raw GeoJSON object for a route id, or null. */
export async function getRouteGeoJson(id: string): Promise<unknown | null> {
	if (!id) return null;
	const sql = getSql();
	const rows = (await sql`SELECT geojson FROM routes WHERE id = ${id} LIMIT 1`) as {
		geojson: unknown;
	}[];
	return rows.length ? parseJsonColumn(rows[0]!.geojson) : null;
}

/** Load splits / HR zones / km markers stored on the route GeoJSON properties. */
export async function loadRouteAnalytics(
	run: Pick<RunRecord, 'route' | 'strava_id'>
): Promise<RouteAnalytics | null> {
	const id = routeIdForRun(run);
	if (!id) return null;
	const geo = (await getRouteGeoJson(id)) as { properties?: unknown } | null;
	if (!geo) return null;
	return analyticsFromProperties(geo.properties ?? null);
}

/** Rebuild GPS samples from a stored Feature (coordinates + optional properties.times). */
export function trackSamplesFromGeoJson(geo: unknown): TrackSample[] {
	if (!geo || typeof geo !== 'object') return [];
	const g = geo as { geometry?: { coordinates?: unknown }; properties?: { times?: unknown } };
	const coords = g.geometry?.coordinates;
	const times = g.properties?.times;
	if (!Array.isArray(coords) || coords.length < 2) return [];
	const hasTimes = Array.isArray(times) && times.length === coords.length;
	if (!hasTimes) return [];
	const out: TrackSample[] = [];
	for (let i = 0; i < coords.length; i++) {
		const c = coords[i];
		if (!Array.isArray(c) || c.length < 2) continue;
		const lng = Number(c[0]);
		const lat = Number(c[1]);
		const timeMs = Number(times[i]);
		if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(timeMs)) continue;
		out.push({ lat, lng, timeMs });
	}
	return out;
}

/** Load km splits + optional timed samples for every stored route (best-effort backfill). */
export async function listRouteEffortSources(): Promise<
	Map<string, { splits: RouteAnalytics['splits']; samples: TrackSample[] }>
> {
	const sql = getSql();
	const rows = (await sql`SELECT id, geojson FROM routes`) as { id: string; geojson: unknown }[];
	const out = new Map<string, { splits: RouteAnalytics['splits']; samples: TrackSample[] }>();
	for (const row of rows) {
		const geo = parseJsonColumn(row.geojson);
		const analytics = analyticsFromProperties(
			geo && typeof geo === 'object' ? (geo as { properties?: unknown }).properties ?? null : null
		);
		const splits = analytics?.splits ?? [];
		const samples = trackSamplesFromGeoJson(geo);
		if (splits.length || samples.length >= 2) out.set(String(row.id), { splits, samples });
	}
	return out;
}
