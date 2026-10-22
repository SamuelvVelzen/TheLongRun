import { openBodyAreas } from '$lib/body-scores';
import { createServerFn } from '@tanstack/react-start';
import { loadBodyNotes } from '../profile';

export const getAuthState = createServerFn({ method: 'GET' }).handler(async () => {
	const { readAuthSession } = await import('../auth.server');
	const [auth, body] = await Promise.all([readAuthSession(), loadBodyNotes()]);
	return { ...auth, bodyAreas: openBodyAreas(body) };
});
