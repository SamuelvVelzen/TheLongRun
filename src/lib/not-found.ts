import { notFound } from '@tanstack/react-router';

/** Passed as `data` on `notFound()` for copy on the root not-found screen. */
export type NotFoundEntity = 'activity' | 'route' | 'group' | 'page';

export type NotFoundPayload = { entity: NotFoundEntity };

export function entityNotFound(entity: NotFoundEntity) {
	return notFound({ data: { entity } satisfies NotFoundPayload });
}

const ROUTE_ENTITY: Record<string, NotFoundEntity> = {
	'/runs/$slug': 'activity',
	'/routes/$slug': 'route',
	'/groups/$id': 'group'
};

export function entityFromNotFound(routeId: string, data: unknown): NotFoundEntity {
	const payload = data as NotFoundPayload | undefined;
	if (payload?.entity) return payload.entity;
	return ROUTE_ENTITY[routeId] ?? 'page';
}

export const NOT_FOUND_COPY: Record<
	NotFoundEntity,
	{ title: string; lead: string; kicker: string }
> = {
	activity: {
		kicker: 'Timeline',
		title: 'Activity not found',
		lead: 'No log matches that link. It may have been removed or the URL is wrong.'
	},
	route: {
		kicker: 'Routes',
		title: 'Route not found',
		lead: 'That planned route is not in your library anymore.'
	},
	group: {
		kicker: 'Timeline',
		title: 'Grouped session not found',
		lead: 'That activity group does not exist or was ungrouped.'
	},
	page: {
		kicker: '404',
		title: 'Page not found',
		lead: 'This URL does not match anything in the app.'
	}
};
