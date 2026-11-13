import { sortGroupRoutes } from '$lib/planned-route-group';
import type { PlannedRoute, PlannedRouteGroupInfo } from '$lib/types';
import { getSql } from './db.server';
import { getPlannedRoute, listPlannedRoutes } from './planned-routes';

export type { PlannedRouteGroupInfo };

function toStr(value: unknown): string {
	return value === null || value === undefined ? '' : String(value);
}

function toNum(value: unknown): number {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
}

export async function listPlannedRouteGroups(): Promise<PlannedRouteGroupInfo[]> {
	const sql = getSql();
	const groups = (await sql`SELECT id, name, created_on FROM planned_route_groups`) as Record<
		string,
		unknown
	>[];
	if (!groups.length) return [];
	const members = (await sql`
		SELECT group_id, route_slug, sort_order
		FROM planned_route_group_members
		ORDER BY sort_order ASC, route_slug ASC
	`) as Record<string, unknown>[];
	const byId = new Map<string, PlannedRouteGroupInfo>();
	for (const row of groups) {
		const id = toStr(row.id);
		byId.set(id, {
			id,
			name: toStr(row.name),
			created_on: toStr(row.created_on),
			member_slugs: []
		});
	}
	for (const row of members) {
		const g = byId.get(toStr(row.group_id));
		if (g) g.member_slugs.push(toStr(row.route_slug));
	}
	return [...byId.values()].filter((g) => g.member_slugs.length >= 2);
}

export async function getPlannedRouteGroup(id: string): Promise<PlannedRouteGroupInfo | null> {
	if (!id) return null;
	const sql = getSql();
	const rows =
		(await sql`SELECT id, name, created_on FROM planned_route_groups WHERE id = ${id} LIMIT 1`) as Record<
			string,
			unknown
		>[];
	if (!rows.length) return null;
	const members = (await sql`
		SELECT route_slug FROM planned_route_group_members
		WHERE group_id = ${id}
		ORDER BY sort_order ASC, route_slug ASC
	`) as { route_slug: string }[];
	return {
		id: toStr(rows[0]!.id),
		name: toStr(rows[0]!.name),
		created_on: toStr(rows[0]!.created_on),
		member_slugs: members.map((m) => toStr(m.route_slug))
	};
}

async function slugsAlreadyGrouped(slugs: string[]): Promise<string[]> {
	if (!slugs.length) return [];
	const sql = getSql();
	const rows = (await sql`SELECT route_slug FROM planned_route_group_members`) as {
		route_slug: string;
	}[];
	const have = new Set(rows.map((r) => toStr(r.route_slug)));
	return slugs.filter((s) => have.has(s));
}

async function pruneRouteGroup(id: string): Promise<void> {
	const sql = getSql();
	const rows = (await sql`
		SELECT COUNT(*) AS n FROM planned_route_group_members WHERE group_id = ${id}
	`) as { n: number }[];
	if (toNum(rows[0]?.n) >= 2) return;
	await sql`DELETE FROM planned_route_group_members WHERE group_id = ${id}`;
	await sql`DELETE FROM planned_route_groups WHERE id = ${id}`;
}

export async function pruneRouteGroupsForSlug(slug: string): Promise<void> {
	if (!slug) return;
	const sql = getSql();
	const rows = (await sql`
		SELECT group_id FROM planned_route_group_members WHERE route_slug = ${slug}
	`) as { group_id: string }[];
	await sql`DELETE FROM planned_route_group_members WHERE route_slug = ${slug}`;
	for (const row of rows) await pruneRouteGroup(toStr(row.group_id));
}

async function rewriteSortOrder(groupId: string, routes: PlannedRoute[]): Promise<void> {
	const sql = getSql();
	const ordered = sortGroupRoutes(routes);
	for (let i = 0; i < ordered.length; i++) {
		await sql`
			UPDATE planned_route_group_members SET sort_order = ${i}
			WHERE group_id = ${groupId} AND route_slug = ${ordered[i]!.slug}
		`;
	}
}

export async function createPlannedRouteGroup(
	slugs: string[],
	name = ''
): Promise<PlannedRouteGroupInfo> {
	const unique = [...new Set(slugs.map((s) => s.trim()).filter(Boolean))];
	if (unique.length < 2) throw new Error('Pick at least two routes to group.');
	const taken = await slugsAlreadyGrouped(unique);
	if (taken.length) throw new Error('One of those routes is already in a group.');

	const routes: PlannedRoute[] = [];
	for (const slug of unique) {
		const route = await getPlannedRoute(slug);
		if (!route) throw new Error('Route not found.');
		routes.push(route);
	}
	const ordered = sortGroupRoutes(routes);
	const id = crypto.randomUUID();
	const created_on = new Date().toISOString();
	const sql = getSql();
	await sql`
		INSERT INTO planned_route_groups (id, name, created_on)
		VALUES (${id}, ${name.trim()}, ${created_on})
	`;
	for (let i = 0; i < ordered.length; i++) {
		await sql`
			INSERT INTO planned_route_group_members (group_id, route_slug, sort_order)
			VALUES (${id}, ${ordered[i]!.slug}, ${i})
		`;
	}
	return {
		id,
		name: name.trim(),
		created_on,
		member_slugs: ordered.map((r) => r.slug)
	};
}

export async function addRouteToGroup(
	groupId: string,
	slug: string
): Promise<PlannedRouteGroupInfo> {
	const group = await getPlannedRouteGroup(groupId);
	if (!group) throw new Error('Group not found.');
	const route = await getPlannedRoute(slug);
	if (!route) throw new Error('Route not found.');
	const taken = await slugsAlreadyGrouped([slug]);
	if (taken.length) throw new Error('That route is already in a group.');
	const sql = getSql();
	await sql`
		INSERT INTO planned_route_group_members (group_id, route_slug, sort_order)
		VALUES (${groupId}, ${slug}, ${group.member_slugs.length})
	`;
	const next = await getPlannedRouteGroup(groupId);
	if (!next) throw new Error('Group not found.');
	const routes: PlannedRoute[] = [];
	for (const s of next.member_slugs) {
		const r = await getPlannedRoute(s);
		if (r) routes.push(r);
	}
	await rewriteSortOrder(groupId, routes);
	return (await getPlannedRouteGroup(groupId))!;
}

export async function removeRouteFromGroup(groupId: string, slug: string): Promise<void> {
	const sql = getSql();
	await sql`
		DELETE FROM planned_route_group_members WHERE group_id = ${groupId} AND route_slug = ${slug}
	`;
	await pruneRouteGroup(groupId);
}

export async function ungroupPlannedRoutes(groupId: string): Promise<void> {
	const sql = getSql();
	await sql`DELETE FROM planned_route_group_members WHERE group_id = ${groupId}`;
	await sql`DELETE FROM planned_route_groups WHERE id = ${groupId}`;
}

export async function tracksForRouteGroup(id: string) {
	const group = await getPlannedRouteGroup(id);
	if (!group) return [];
	const all = await listPlannedRoutes();
	const bySlug = new Map(all.map((r) => [r.slug, r]));
	const members = sortGroupRoutes(
		group.member_slugs.map((s) => bySlug.get(s)).filter((r): r is PlannedRoute => r != null)
	);
	const { listPlannedRouteTracks } = await import('./planned-routes');
	const tracks = await listPlannedRouteTracks();
	const trackById = new Map(tracks.map((t) => [t.id, t]));
	return members
		.map((m) => trackById.get(m.slug))
		.filter((t): t is NonNullable<typeof t> => t != null);
}
