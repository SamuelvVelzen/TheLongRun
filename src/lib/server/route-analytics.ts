import { analyticsFromProperties, type RouteAnalytics } from '$lib/splits';
import type { RunRecord } from '$lib/types';
import { getSql } from './db';

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

/** Upsert a route's GeoJSON track by id. */
export async function saveRouteGeoJson(id: string, geojson: unknown): Promise<void> {
	const sql = getSql();
	await sql`
		INSERT INTO routes (id, geojson) VALUES (${id}, ${JSON.stringify(geojson)}::jsonb)
		ON CONFLICT (id) DO UPDATE SET geojson = EXCLUDED.geojson
	`;
}

/** Fetch the raw GeoJSON object for a route id, or null. */
export async function getRouteGeoJson(id: string): Promise<unknown | null> {
	if (!id) return null;
	const sql = getSql();
	const rows = (await sql`SELECT geojson FROM routes WHERE id = ${id} LIMIT 1`) as {
		geojson: unknown;
	}[];
	return rows.length ? rows[0]!.geojson : null;
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

/** Load km splits for every stored route (used to backfill best efforts). */
export async function listRouteSplitsById(): Promise<Map<string, RouteAnalytics['splits']>> {
	const sql = getSql();
	const rows = (await sql`SELECT id, geojson FROM routes`) as { id: string; geojson: unknown }[];
	const out = new Map<string, RouteAnalytics['splits']>();
	for (const row of rows) {
		const geo = row.geojson as { properties?: unknown } | null;
		const analytics = analyticsFromProperties(geo?.properties ?? null);
		if (analytics?.splits?.length) out.set(String(row.id), analytics.splits);
	}
	return out;
}
