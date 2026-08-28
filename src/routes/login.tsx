import { createFileRoute, Link } from '@tanstack/react-router';
import { SignInLink } from '$lib/auth';
import { ui } from '$lib/ui';

export const Route = createFileRoute('/login')({
	validateSearch: (s: Record<string, unknown>): { next?: string } => ({
		next: typeof s.next === 'string' ? s.next : undefined
	}),
	server: {
		handlers: {
			GET: async ({ request, next }) => {
				const { completeAccessLogin, redirectWithSession, safeNextPath } =
					await import('$lib/server/auth.server');
				const result = await completeAccessLogin();
				if (!result.ok) return next();
				const url = new URL(request.url);
				const dest = safeNextPath(url.searchParams.get('next'));
				return redirectWithSession(new URL(dest, url.origin).toString());
			}
		}
	},
	component: LoginFailed
});

function LoginFailed() {
	return (
		<section className={ui.hero}>
			<div>
				<p className={ui.muted}>Editor sign-in</p>
				<h1>Couldn’t sign in</h1>
				<p>
					Viewing is open. Editing needs a Cloudflare Access sign-in; after that this page sets a
					30-day session so you are not asked every day.
				</p>
			</div>
			<div className={ui.actions}>
				<SignInLink className={ui.btnPrimary}>Try again</SignInLink>
				<Link className={ui.btnGhost} to="/">
					Back to dashboard
				</Link>
			</div>
		</section>
	);
}
