import { fail, redirect } from '@sveltejs/kit';
import { currentPlanWeek, loadShoes } from '$lib/server/context';
import { saveRun, runSlug } from '$lib/server/runs';
import { saveUpload } from '$lib/server/uploads';
import { weekNumberForDate } from '$lib/plan';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const week = currentPlanWeek();
	const shoes = loadShoes();
	const today = new Date();
	const iso = today.toISOString().slice(0, 10);
	const dow = today.getDay(); // 0 Sun ... 2 Tue ... 5 Fri
	const day = dow === 2 ? 'Tuesday' : dow === 5 ? 'Friday' : dow === 0 ? 'Sunday' : 'Tuesday';
	return {
		week,
		shoes,
		defaults: {
			date: iso,
			day,
			week: weekNumberForDate(iso),
			session:
				week?.sessions.find((s) => s.day === day)?.label.toLowerCase().includes('long')
					? 'long'
					: week?.sessions.find((s) => s.day === day)?.label.toLowerCase().includes('easy')
						? 'easy'
						: week?.sessions.find((s) => s.day === day)
							? 'quality'
							: 'easy'
		}
	};
};

function num(fd: FormData, key: string) {
	const v = String(fd.get(key) ?? '').trim();
	if (!v) return null;
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
}

export const actions: Actions = {
	default: async ({ request }) => {
		const fd = await request.formData();
		const date = String(fd.get('date') ?? '').trim();
		const day = String(fd.get('day') ?? '').trim();
		const session = String(fd.get('session') ?? '').trim();
		if (!date || !day || !session) {
			return fail(400, { message: 'Date, day and session are required.' });
		}

		const slug = runSlug(date, day);
		let summary_image = '';
		let splits_image = '';
		try {
			const summary = fd.get('summary_image');
			const splits = fd.get('splits_image');
			if (summary instanceof File && summary.size) {
				summary_image = await saveUpload(summary, 'summary', slug);
			}
			if (splits instanceof File && splits.size) {
				splits_image = await saveUpload(splits, 'splits', slug);
			}
		} catch (e) {
			return fail(400, { message: e instanceof Error ? e.message : 'Upload failed' });
		}

		const wanted = String(fd.get('wanted_faster') ?? '');
		const run = saveRun({
			date,
			week: num(fd, 'week'),
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
			time: String(fd.get('time') ?? '').trim(),
			avg_pace: String(fd.get('avg_pace') ?? '').trim(),
			avg_hr: num(fd, 'avg_hr'),
			cadence: num(fd, 'cadence'),
			shoes: String(fd.get('shoes') ?? '').trim(),
			summary_image,
			splits_image,
			strava_id: '',
			notes: String(fd.get('notes') ?? '')
		});

		redirect(303, `/runs/${run.slug}`);
	}
};
