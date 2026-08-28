import { createMiddleware } from '@tanstack/react-start';

export const requireAuth = createMiddleware({ type: 'function' }).server(async ({ next }) => {
	const { assertSignedIn } = await import('./auth.server');
	const session = await assertSignedIn();
	return next({ context: { email: session.email ?? '' } });
});
