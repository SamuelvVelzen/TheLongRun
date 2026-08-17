import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/log')({
	beforeLoad: () => {
		throw redirect({ to: '/import', search: { mode: 'manual' } });
	},
	component: () => null
});
