import { error } from '@sveltejs/kit';
import { getRun } from '$lib/server/runs';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const run = getRun(params.slug);
	if (!run) error(404, 'Run not found');
	return { run };
};
