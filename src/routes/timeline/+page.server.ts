import { fail } from '@sveltejs/kit';
import { deleteRun, listRuns, runHasMap } from '$lib/server/runs';
import {
	buildRangeStats,
	filterRunsByRange,
	parseDateRange,
	type DateRange
} from '$lib/date-range';
import { buildTrainingTrends } from '$lib/trends';
import type { Actions, PageServerLoad } from './$types';
import type { RunRecord } from '$lib/types';

function monthKey(date: string) {
	return date.slice(0, 7) || 'unknown';
}

function monthLabel(key: string) {
	if (!/^\d{4}-\d{2}$/.test(key)) return key;
	const d = new Date(`${key}-01T00:00:00`);
	return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

type RunListItem = RunRecord & { has_map: boolean };

function groupRuns(runs: RunListItem[]) {
	const groupsMap = new Map<string, RunListItem[]>();
	for (const run of runs) {
		const key = monthKey(run.date);
		const list = groupsMap.get(key) ?? [];
		list.push(run);
		groupsMap.set(key, list);
	}

	return [...groupsMap.entries()].map(([key, items]) => ({
		key,
		label: monthLabel(key),
		runs: items,
		totalKm: Math.round(items.reduce((acc, r) => acc + (r.distance_km ?? 0), 0) * 10) / 10
	}));
}

export const load: PageServerLoad = async ({ url }) => {
	const range: DateRange = parseDateRange(url.searchParams);
	const allRuns = listRuns().map((r) => ({ ...r, has_map: runHasMap(r) }));
	const runs = filterRunsByRange(allRuns, range);
	const stats = buildRangeStats(runs);
	const trends =
		range.kind !== 'all' ? buildTrainingTrends(runs, { endDate: range.to, fromDate: range.from }) : null;

	return {
		groups: groupRuns(runs),
		runCount: stats.runCount,
		totalKm: stats.totalKm,
		avgPace: stats.avgPace,
		avgHr: stats.avgHr,
		trends,
		range,
		totalAllTime: allRuns.length
	};
};

export const actions: Actions = {
	delete: async ({ request }) => {
		const fd = await request.formData();
		const slug = String(fd.get('slug') ?? '').trim();
		if (!slug) return fail(400, { message: 'Missing slug' });
		const ok = deleteRun(slug);
		if (!ok) return fail(404, { message: 'Run not found' });
		return { deleted: slug };
	}
};
