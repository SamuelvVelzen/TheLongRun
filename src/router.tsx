import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

export function getRouter() {
	return createRouter({
		routeTree,
		scrollRestoration: true,
		scrollRestorationBehavior: 'instant',
		// Keep list pages hydrated on back so restore isn't clamped by the loading spinner.
		defaultStaleTime: 5 * 60 * 1000,
		defaultPreload: 'intent'
	});
}
