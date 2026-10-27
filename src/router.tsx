import { createRouter } from '@tanstack/react-router';
import { RouteError } from './components/ui/RouteError';
import { RouteNotFound } from './components/ui/RouteNotFound';
import { routeTree } from './routeTree.gen';

export function getRouter() {
	return createRouter({
		routeTree,
		defaultErrorComponent: RouteError,
		defaultNotFoundComponent: RouteNotFound,
		scrollRestoration: true,
		scrollRestorationBehavior: 'instant',
		// Activity data barely changes — reuse loaders until a mutation calls router.invalidate().
		defaultStaleTime: Infinity,
		defaultPreloadStaleTime: Infinity,
		defaultGcTime: Infinity,
		defaultPreload: 'intent'
	});
}
