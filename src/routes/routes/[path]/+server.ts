import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { error } from '@sveltejs/kit';
import { ensureDataDirs, routesDir } from '$lib/server/paths';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	ensureDataDirs();
	const name = params.path;
	if (!name || name.includes('..') || name.includes('/') || name.includes('\\')) {
		error(400, 'Invalid path');
	}
	if (!name.endsWith('.json')) error(400, 'Invalid path');
	const filepath = path.join(routesDir, name);
	if (!existsSync(filepath)) error(404, 'Not found');
	const body = readFileSync(filepath);
	return new Response(body, {
		headers: {
			'Content-Type': 'application/geo+json; charset=utf-8',
			'Cache-Control': 'public, max-age=3600'
		}
	});
};
