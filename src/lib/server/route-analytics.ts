import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { analyticsFromProperties, type RouteAnalytics } from '$lib/splits';
import { ensureDataDirs, routesDir } from './paths';
import type { RunRecord } from '$lib/types';

/** Resolve on-disk route id from a run (`/routes/{id}.json` or strava_id). */
export function routeIdForRun(run: Pick<RunRecord, 'route' | 'strava_id'>): string | null {
	const fromRoute = String(run.route || '')
		.trim()
		.replace(/^\/routes\//, '')
		.replace(/\.json$/i, '');
	if (fromRoute) return fromRoute;
	const id = String(run.strava_id || '').trim();
	return id || null;
}

export function routeFilePath(id: string): string {
	return path.join(routesDir, `${id}.json`);
}

/** Load splits / HR zones / km markers stored on the route GeoJSON sidecar. */
export function loadRouteAnalytics(run: Pick<RunRecord, 'route' | 'strava_id'>): RouteAnalytics | null {
	ensureDataDirs();
	const id = routeIdForRun(run);
	if (!id) return null;
	const filepath = routeFilePath(id);
	if (!existsSync(filepath)) return null;
	try {
		const geo = JSON.parse(readFileSync(filepath, 'utf8'));
		return analyticsFromProperties(geo?.properties ?? null);
	} catch {
		return null;
	}
}
