export function routeIdFrom(route: string, stravaId: string): string {
	const fromRoute = route.trim().split(/[\\/]/).pop();
	const id = (fromRoute ?? '').replace(/\?.*$/, '').replace(/\.json$/i, '');
	return id || stravaId || '';
}
