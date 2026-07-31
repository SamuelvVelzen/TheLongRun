import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { error } from '@sveltejs/kit';
import { ensureDataDirs, uploadsDir } from '$lib/server/paths';
import type { RequestHandler } from './$types';

const TYPES: Record<string, string> = {
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.png': 'image/png',
	'.webp': 'image/webp',
	'.heic': 'image/heic',
	'.heif': 'image/heif'
};

export const GET: RequestHandler = async ({ params }) => {
	ensureDataDirs();
	const name = params.path;
	if (!name || name.includes('..') || name.includes('/') || name.includes('\\')) {
		error(400, 'Invalid path');
	}
	const filepath = path.join(uploadsDir, name);
	if (!existsSync(filepath)) error(404, 'Not found');
	const ext = path.extname(name).toLowerCase();
	const body = readFileSync(filepath);
	return new Response(body, {
		headers: {
			'Content-Type': TYPES[ext] || 'application/octet-stream',
			'Cache-Control': 'public, max-age=31536000, immutable'
		}
	});
};
