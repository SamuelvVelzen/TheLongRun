import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/logout')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const { clearAuthSession, redirectWithSession } = await import('$lib/server/auth.server');
				await clearAuthSession();
				return redirectWithSession(new URL('/', new URL(request.url).origin).toString());
			}
		}
	},
	component: () => null
});
