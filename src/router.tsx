import { createRouter } from '@tanstack/react-router';
import { RoutePending } from './components/RoutePending';
import { routeTree } from './routeTree.gen';

export function getRouter() {
	return createRouter({
		routeTree,
		scrollRestoration: true,
		defaultPreload: 'intent',
		defaultPendingMs: 0,
		defaultPendingComponent: RoutePending
	});
}
