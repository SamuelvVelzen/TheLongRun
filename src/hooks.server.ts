import { ensureDataDirs } from '$lib/server/paths';
import type { Handle } from '@sveltejs/kit';

ensureDataDirs();

export const handle: Handle = async ({ event, resolve }) => resolve(event);
