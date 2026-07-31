import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseFitBuffer } from './fit';
import { saveRouteGeoJson } from './import-fit';
import { ensureDataDirs, routesDir } from './paths';
import { listRuns } from './runs';
import { analyticsFromProperties } from '$lib/splits';

export interface BackfillSplitsResult {
	updated: number;
	skipped: number;
	failed: number;
	items: {
		id: string;
		status: 'updated' | 'skipped' | 'failed';
		reason?: string;
		splits?: number;
		zones?: boolean;
	}[];
}

function fitCandidates(exportDir: string, id: string): string[] {
	const activities = path.join(exportDir, 'activities');
	const names = [`${id}.fit.gz`, `${id}.fit`, `${id}.FIT.gz`, `${id}.FIT`];
	const out: string[] = [];
	for (const n of names) {
		const p = path.join(activities, n);
		if (existsSync(p)) out.push(p);
		const root = path.join(exportDir, n);
		if (existsSync(root)) out.push(root);
	}
	return out;
}

/**
 * Re-parse FIT files for existing route GeoJSONs and write splits / HR zones / km markers.
 * Quietly skips when GPS+time are insufficient or FIT is missing.
 */
export async function backfillRouteSplits(opts: {
	exportDir: string;
	force?: boolean;
	onlyIds?: string[];
}): Promise<BackfillSplitsResult> {
	ensureDataDirs();
	const force = opts.force === true;
	const only = opts.onlyIds?.length ? new Set(opts.onlyIds.map(String)) : null;
	const items: BackfillSplitsResult['items'] = [];

	const routeIds = new Set<string>();
	if (existsSync(routesDir)) {
		for (const f of readdirSync(routesDir)) {
			if (f.endsWith('.json')) routeIds.add(f.replace(/\.json$/i, ''));
		}
	}
	for (const run of listRuns()) {
		if (run.strava_id) routeIds.add(String(run.strava_id));
		const m = String(run.route || '').match(/\/routes\/([^/]+)\.json$/i);
		if (m?.[1]) routeIds.add(m[1]);
	}

	let updated = 0;
	let skipped = 0;
	let failed = 0;

	for (const id of [...routeIds].sort()) {
		if (only && !only.has(id)) continue;

		const routePath = path.join(routesDir, `${id}.json`);
		if (existsSync(routePath) && !force) {
			try {
				const geo = JSON.parse(readFileSync(routePath, 'utf8'));
				const existing = analyticsFromProperties(geo?.properties ?? null);
				if (existing && (existing.splits.length > 0 || existing.hrZones)) {
					skipped++;
					items.push({ id, status: 'skipped', reason: 'Already has analytics' });
					continue;
				}
			} catch {
				// continue and try to rebuild
			}
		}

		const fits = fitCandidates(opts.exportDir, id);
		if (!fits.length) {
			skipped++;
			items.push({ id, status: 'skipped', reason: 'No FIT file' });
			continue;
		}

		try {
			const buf = readFileSync(fits[0]!);
			const activity = await parseFitBuffer(buf, path.basename(fits[0]!));
			if (activity.points.length < 2) {
				skipped++;
				items.push({ id, status: 'skipped', reason: 'Not enough GPS' });
				continue;
			}
			if (!activity.analytics || (!activity.analytics.splits.length && !activity.analytics.hrZones)) {
				// Still refresh GeoJSON + km markers if present
				if (!activity.analytics?.kmMarkers.length) {
					skipped++;
					items.push({ id, status: 'skipped', reason: 'Insufficient time/HR for analytics' });
					continue;
				}
			}
			saveRouteGeoJson(id, activity);
			updated++;
			items.push({
				id,
				status: 'updated',
				splits: activity.analytics?.splits.length ?? 0,
				zones: Boolean(activity.analytics?.hrZones)
			});
		} catch (e) {
			failed++;
			items.push({
				id,
				status: 'failed',
				reason: e instanceof Error ? e.message : String(e)
			});
		}
	}

	return { updated, skipped, failed, items };
}

/** Optional: patch only properties onto an existing GeoJSON without rewriting geometry. */
export function mergeAnalyticsIntoRoute(
	id: string,
	props: Record<string, unknown>
): boolean {
	const filepath = path.join(routesDir, `${id}.json`);
	if (!existsSync(filepath)) return false;
	try {
		const geo = JSON.parse(readFileSync(filepath, 'utf8'));
		geo.properties = { ...(geo.properties ?? {}), ...props };
		writeFileSync(filepath, JSON.stringify(geo), 'utf8');
		return true;
	} catch {
		return false;
	}
}
