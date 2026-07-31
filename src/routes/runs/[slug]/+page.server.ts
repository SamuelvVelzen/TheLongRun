import { error, fail, redirect } from '@sveltejs/kit';
import { dayFromIsoDate, normalizeStartTime } from '$lib/format';
import { weekNumberForDate } from '$lib/plan';
import { loadRouteAnalytics } from '$lib/server/route-analytics';
import { deleteRun, getRun, runHasMap, updateRun } from '$lib/server/runs';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const run = getRun(params.slug);
	if (!run) error(404, 'Run not found');
	const analytics = loadRouteAnalytics(run);
	return { run: { ...run, has_map: runHasMap(run) }, analytics };
};

function num(fd: FormData, key: string) {
	const v = String(fd.get(key) ?? '').trim();
	if (!v) return null;
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
}

export const actions: Actions = {
	update: async ({ params, request }) => {
		const existing = getRun(params.slug);
		if (!existing) error(404, 'Run not found');

		const fd = await request.formData();
		const date = String(fd.get('date') ?? '').trim();
		const session = String(fd.get('session') ?? '').trim();
		if (!date || !session) {
			return fail(400, { message: 'Date and session are required.' });
		}
		const day = dayFromIsoDate(date);
		const week = weekNumberForDate(date);

		const wanted = String(fd.get('wanted_faster') ?? '');
		let run;
		try {
			run = updateRun(params.slug, {
				date,
				week,
				day,
				session,
				effort: num(fd, 'effort'),
				shins: num(fd, 'shins'),
				legs: num(fd, 'legs'),
				energy: num(fd, 'energy'),
				weather: String(fd.get('weather') ?? '').trim(),
				surface: String(fd.get('surface') ?? '').trim(),
				wanted_faster: wanted === 'Y' ? true : wanted === 'N' ? false : null,
				distance_km: num(fd, 'distance_km'),
				start_time: normalizeStartTime(String(fd.get('start_time') ?? '').trim()),
				time: String(fd.get('time') ?? '').trim(),
				avg_pace: String(fd.get('avg_pace') ?? '').trim(),
				avg_hr: num(fd, 'avg_hr'),
				max_hr: num(fd, 'max_hr'),
				elev_gain: num(fd, 'elev_gain'),
				cadence: num(fd, 'cadence'),
				shoes: String(fd.get('shoes') ?? '').trim(),
				notes: String(fd.get('notes') ?? '')
			});
		} catch (e) {
			return fail(400, { message: e instanceof Error ? e.message : 'Update failed' });
		}
		redirect(303, `/runs/${run.slug}`);
	},
	delete: async ({ params }) => {
		const ok = deleteRun(params.slug);
		if (!ok) error(404, 'Run not found');
		redirect(303, '/timeline');
	}
};
