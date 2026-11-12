import type { PlannedRoute, PlannedRouteGroupInfo } from '$lib/types';

export const ROUTE_GROUP_LIVE_PREFIX = 'route-group:';

export type PlannedRouteListItem =
	| { kind: 'route'; route: PlannedRoute }
	| {
			kind: 'group';
			group: PlannedRouteGroupInfo;
			members: PlannedRoute[];
			stats: CombinedRouteGroupStats;
	  };

export type CombinedRouteGroupStats = {
	route_count: number;
	distance_km: number | null;
	plan_link_count: number;
	activity_link_count: number;
	saved_on: string;
};

export function routeGroupLiveSlug(groupId: string): string {
	return `${ROUTE_GROUP_LIVE_PREFIX}${groupId}`;
}

export function parseRouteGroupLiveSlug(raw: string | null | undefined): string | null {
	if (!raw?.startsWith(ROUTE_GROUP_LIVE_PREFIX)) return null;
	const id = raw.slice(ROUTE_GROUP_LIVE_PREFIX.length).trim();
	return id || null;
}

export function isRouteGroupLiveSlug(raw: string | null | undefined): boolean {
	return Boolean(parseRouteGroupLiveSlug(raw ?? ''));
}

export function sortGroupRoutes<T extends Pick<PlannedRoute, 'saved_on' | 'name' | 'slug'>>(members: T[]): T[] {
	return [...members].sort(
		(a, b) =>
			b.saved_on.localeCompare(a.saved_on) ||
			a.name.localeCompare(b.name) ||
			a.slug.localeCompare(b.slug)
	);
}

export function combineRouteGroupStats(members: PlannedRoute[]): CombinedRouteGroupStats {
	const ordered = sortGroupRoutes(members);
	const dist = ordered.reduce((acc, m) => acc + (m.distance_km ?? 0), 0);
	return {
		route_count: ordered.length,
		distance_km: dist > 0 ? Math.round(dist * 100) / 100 : null,
		plan_link_count: ordered.reduce((acc, m) => acc + m.plan_link_count, 0),
		activity_link_count: ordered.reduce((acc, m) => acc + m.activity_link_count, 0),
		saved_on: ordered[0]?.saved_on ?? ''
	};
}

export function groupedRouteTitle(
	group: Pick<PlannedRouteGroupInfo, 'name'>,
	memberCount: number
): string {
	const named = group.name.trim();
	if (named) return named;
	return memberCount === 1 ? '1 route' : `${memberCount} route options`;
}

function groupMembership(groups: PlannedRouteGroupInfo[]): Map<string, PlannedRouteGroupInfo> {
	const out = new Map<string, PlannedRouteGroupInfo>();
	for (const g of groups) {
		for (const slug of g.member_slugs) out.set(slug, g);
	}
	return out;
}

/** Collapse grouped members into one list item when any member is in `routes`. */
export function collapsePlannedRoutes(
	routes: PlannedRoute[],
	groups: PlannedRouteGroupInfo[]
): PlannedRouteListItem[] {
	const bySlug = new Map(routes.map((r) => [r.slug, r] as const));
	const membership = groupMembership(groups);
	const emitted = new Set<string>();
	const items: PlannedRouteListItem[] = [];

	for (const route of routes) {
		const group = membership.get(route.slug);
		if (!group) {
			items.push({ kind: 'route', route });
			continue;
		}
		if (emitted.has(group.id)) continue;
		emitted.add(group.id);
		const members = group.member_slugs
			.map((slug) => bySlug.get(slug))
			.filter((r): r is PlannedRoute => r != null);
		if (members.length < 2) {
			items.push({ kind: 'route', route });
			continue;
		}
		items.push({
			kind: 'group',
			group,
			members: sortGroupRoutes(members),
			stats: combineRouteGroupStats(members)
		});
	}
	return items;
}
