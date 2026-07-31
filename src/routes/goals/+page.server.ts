import { fail } from '@sveltejs/kit';
import { loadGoals, saveGoals } from '$lib/server/context';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	return { goals: loadGoals() };
};

export const actions: Actions = {
	default: async ({ request }) => {
		const fd = await request.formData();
		const primary = String(fd.get('primary') ?? '')
			.split('\n')
			.map((s) => s.replace(/^- /, '').trim())
			.filter(Boolean);
		const goals = {
			race_name: String(fd.get('race_name') ?? '').trim() || '10K',
			race_date: String(fd.get('race_date') ?? '').trim() || '2026-09-27',
			race_distance_km: Number(fd.get('race_distance_km') || 10),
			time_goal: String(fd.get('time_goal') ?? '').trim(),
			primary,
			notes: String(fd.get('notes') ?? '')
		};
		if (!goals.race_date) return fail(400, { message: 'Race date required', goals });
		saveGoals(goals);
		return { saved: true, goals };
	}
};
