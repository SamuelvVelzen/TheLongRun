import { listRuns } from '$lib/server/runs';
import type { PageServerLoad } from './$types';
import type { RunRecord } from '$lib/types';

function monthKey(date: string) {
	return date.slice(0, 7) || 'unknown';
}

function monthLabel(key: string) {
	if (!/^\d{4}-\d{2}$/.test(key)) return key;
	const d = new Date(`${key}-01T00:00:00`);
	return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

export const load: PageServerLoad = async () => {
	const runs = listRuns();
	const groupsMap = new Map<string, RunRecord[]>();
	for (const run of runs) {
		const key = monthKey(run.date);
		const list = groupsMap.get(key) ?? [];
		list.push(run);
		groupsMap.set(key, list);
	}

	const groups = [...groupsMap.entries()].map(([key, items]) => ({
		key,
		label: monthLabel(key),
		runs: items,
		totalKm: Math.round(items.reduce((acc, r) => acc + (r.distance_km ?? 0), 0) * 10) / 10
	}));

	return {
		groups,
		runCount: runs.length,
		totalKm: Math.round(runs.reduce((acc, r) => acc + (r.distance_km ?? 0), 0) * 10) / 10
	};
};
