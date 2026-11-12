import {
	addRouteToGroup,
	createPlannedRouteGroup,
	getPlannedRouteGroup,
	listPlannedRouteGroups,
	removeRouteFromGroup,
	tracksForRouteGroup,
	ungroupPlannedRoutes
} from '../planned-route-groups';
import { deletePlannedRoutes, listPlannedRouteTracks, listPlannedRoutes } from '../planned-routes';
import { combineRouteGroupStats, groupedRouteTitle, sortGroupRoutes } from '$lib/planned-route-group';
import { createServerFn } from '@tanstack/react-start';
import { requireAuth } from '../auth';

export const getPlannedRouteGroupDetail = createServerFn({ method: 'GET' })
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		const groupRaw = await getPlannedRouteGroup(id);
		if (!groupRaw) return null;
		const routes = await listPlannedRoutes();
		const bySlug = new Map(routes.map((r) => [r.slug, r]));
		const members = groupRaw.member_slugs
			.map((s) => bySlug.get(s))
			.filter((r): r is NonNullable<typeof r> => r != null);
		if (members.length < 2) return null;
		const [tracks, groups] = await Promise.all([listPlannedRouteTracks(), listPlannedRouteGroups()]);
		const trackIds = new Set(members.map((m) => m.slug));
		return {
			group: groupRaw,
			members: sortGroupRoutes(members),
			stats: combineRouteGroupStats(members),
			title: groupedRouteTitle(groupRaw, members.length),
			tracks: tracks.filter((t) => trackIds.has(t.id)),
			allRoutes: routes,
			groups
		};
	});

export const createPlannedRouteGroupFn = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((data: { slugs: string[]; name?: string }) => ({
		slugs: Array.isArray(data?.slugs) ? data.slugs.map((s) => String(s)) : [],
		name: data?.name != null ? String(data.name) : ''
	}))
	.handler(async ({ data }) => createPlannedRouteGroup(data.slugs, data.name ?? ''));

export const ungroupPlannedRoutesFn = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		await ungroupPlannedRoutes(id);
		return { ok: true as const };
	});

export const addToPlannedRouteGroupFn = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((data: { groupId: string; slug: string }) => ({
		groupId: String(data.groupId),
		slug: String(data.slug)
	}))
	.handler(async ({ data }) => addRouteToGroup(data.groupId, data.slug));

export const removeFromPlannedRouteGroupFn = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((data: { groupId: string; slug: string }) => ({
		groupId: String(data.groupId),
		slug: String(data.slug)
	}))
	.handler(async ({ data }) => {
		await removeRouteFromGroup(data.groupId, data.slug);
		return { ok: true as const };
	});

export const deletePlannedRoutesFn = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((slugs: string[]) => (Array.isArray(slugs) ? slugs.map((s) => String(s)) : []))
	.handler(async ({ data: slugs }) => ({ deleted: await deletePlannedRoutes(slugs) }));

export { tracksForRouteGroup, listPlannedRouteGroups };
