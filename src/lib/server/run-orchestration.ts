import {
	computeBestEffortsFromSplits,
	computeBestEffortsFromTrack,
	effortsEqual,
	highlightsForActivity,
	mergeMissingBestEfforts,
	missingEffortKeys,
	supportsBestEfforts,
	type EffortHighlight
} from '$lib/best-efforts';
import { planSessionRouteKey, withSessionRoutes, type WeekView } from '$lib/plan';
import type { RunRecord, RunWithMap, SessionRouteRef } from '$lib/types';
import { listPlanRouteRefs } from './planned-routes';
import { listRouteEffortSources, routeIdForRun } from './route-analytics';
import { listRuns, runHasMap, setRunBestEfforts } from './runs';

export const withMap = (runs: RunRecord[], routeIds: Set<string>): RunWithMap[] =>
	runs.map((r) => ({ ...r, has_map: runHasMap(r, routeIds) }));

export function attachPlanRoutes(
	weekView: WeekView | null,
	planRefs: Awaited<ReturnType<typeof listPlanRouteRefs>>
): WeekView | null {
	if (!weekView) return null;
	const bySession = new Map<string, SessionRouteRef>();
	const legacyByDay = new Map<string, SessionRouteRef>();
	for (const ref of planRefs) {
		if (ref.week !== weekView.week.week) continue;
		const routeRef: SessionRouteRef = {
			slug: ref.slug,
			name: ref.name,
			distance_km: ref.distance_km,
			link_id: ref.id
		};
		if (ref.label && ref.activity_type) {
			bySession.set(planSessionRouteKey(ref.day, ref.label, ref.activity_type), routeRef);
		} else {
			legacyByDay.set(ref.day.trim().toLowerCase(), routeRef);
		}
	}
	return withSessionRoutes(weekView, bySession, legacyByDay);
}

export async function hydrateBestEfforts(runs: RunRecord[]): Promise<RunRecord[]> {
	const incomplete = runs.filter(
		(r) =>
			supportsBestEfforts(r.activity_type) &&
			(r.route || r.strava_id) &&
			missingEffortKeys(r.distance_km, r.best_efforts ?? []).length > 0
	);
	if (!incomplete.length) return runs;
	const sources = await listRouteEffortSources();
	for (const run of incomplete) {
		const id = routeIdForRun(run);
		const src = id ? sources.get(id) : undefined;
		if (!src) continue;
		const fromTrack = src.samples.length >= 2 ? computeBestEffortsFromTrack(src.samples) : [];
		const fromSplits = src.splits.length ? computeBestEffortsFromSplits(src.splits) : [];
		const merged = mergeMissingBestEfforts(
			fromTrack.length ? fromTrack : (run.best_efforts ?? []),
			fromSplits
		);
		if (!merged.length || effortsEqual(merged, run.best_efforts ?? [])) continue;
		await setRunBestEfforts(run.id, merged);
		run.best_efforts = merged;
	}
	return runs;
}

export async function highlightsAfterSave(
	id: number,
	slug: string,
	activityType: string,
	efforts: import('$lib/best-efforts').BestEffort[]
): Promise<EffortHighlight[]> {
	if (!supportsBestEfforts(activityType) || !efforts.length) return [];
	const all = await listRuns();
	await hydrateBestEfforts(all);
	const row = all.find((r) => r.id === id);
	if (row) row.best_efforts = mergeMissingBestEfforts(efforts, row.best_efforts ?? []);
	return highlightsForActivity(slug, activityType, all);
}
