import { listRuns } from '$lib/server/runs';
import { currentPlanWeek, loadGoals, loadShoes } from '$lib/server/context';
import { avg, sumDistance } from '$lib/plan';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const runs = listRuns();
	const recent = runs.slice(0, 8);
	const week = currentPlanWeek();
	const goals = loadGoals();
	const shoes = loadShoes();
	const raceDate = new Date(`${goals.race_date}T00:00:00`);
	const daysToRace = Number.isNaN(raceDate.getTime())
		? null
		: Math.ceil((raceDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));

	return {
		runs: recent,
		stats: {
			totalKm: Math.round(sumDistance(runs) * 10) / 10,
			runCount: runs.length,
			avgEffort: avg(runs.map((r) => r.effort)),
			avgShins: avg(runs.map((r) => r.shins)),
			daysToRace
		},
		week,
		goals,
		shoes
	};
};
