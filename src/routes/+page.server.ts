import { listRuns, runHasMap } from '$lib/server/runs';
import { listRouteTracks } from '$lib/server/routes';
import { currentPlanWeek, loadGoals, loadShoes } from '$lib/server/context';
import { buildDashboardStats } from '$lib/plan';
import {
	dateRangeSearch,
	filterRunsByRange,
	parseDateRange,
	routeIdsForRuns
} from '$lib/date-range';
import { buildTrainingTrends } from '$lib/trends';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const range = parseDateRange(url.searchParams);
	const allRuns = listRuns();
	const runs = filterRunsByRange(allRuns, range);
	const allTracks = listRouteTracks();
	const trackIds = routeIdsForRuns(runs);
	const tracks =
		range.kind === 'all'
			? allTracks
			: allTracks.filter((t) => trackIds.has(t.id));

	const recent = runs.slice(0, 8).map((r) => ({ ...r, has_map: runHasMap(r) }));
	const week = currentPlanWeek();
	const goals = loadGoals();
	const shoes = loadShoes();
	const raceDate = new Date(`${goals.race_date}T00:00:00`);
	const daysToRace = Number.isNaN(raceDate.getTime())
		? null
		: Math.ceil((raceDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));

	const mappedRuns = runs.filter((r) => runHasMap(r)).length;
	const rangeQuery = dateRangeSearch(range);
	const trends = buildTrainingTrends(runs, { endDate: range.to, fromDate: range.from });

	return {
		runs: recent,
		tracks,
		stats: buildDashboardStats(runs, { daysToRace, mappedRuns }),
		trends,
		week,
		goals,
		shoes,
		range,
		totalAllTime: allRuns.length,
		timelineHref: rangeQuery ? `/timeline?${rangeQuery}` : '/timeline'
	};
};
