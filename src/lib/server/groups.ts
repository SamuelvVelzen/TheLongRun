import { normalizeActivityType } from '$lib/activity';
import { combinedBestEfforts, sameTypeForEfforts, trackFromGeoJson } from '$lib/combine-track';
import { sortGroupMembers } from '$lib/group';
import type { TrackSample } from '$lib/splits';
import type { ActivityGroupInfo, RunRecord } from '$lib/types';
import { getSql } from './db';
import { getRouteGeoJson, routeIdForRun } from './route-analytics';
import { getRun } from './runs';

export type { ActivityGroupInfo };

function toStr(value: unknown): string {
	return value === null || value === undefined ? '' : String(value);
}

function toNum(value: unknown): number {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
}

export async function listActivityGroups(): Promise<ActivityGroupInfo[]> {
	const sql = getSql();
	const groups = (await sql`SELECT id, name, created_on FROM activity_groups`) as Record<
		string,
		unknown
	>[];
	if (!groups.length) return [];
	const members = (await sql`
		SELECT group_id, activity_slug, sort_order
		FROM activity_group_members
		ORDER BY sort_order ASC, activity_slug ASC
	`) as Record<string, unknown>[];
	const byId = new Map<string, ActivityGroupInfo>();
	for (const row of groups) {
		const id = toStr(row.id);
		byId.set(id, {
			id,
			name: toStr(row.name),
			created_on: toStr(row.created_on),
			member_slugs: [],
			best_efforts: []
		});
	}
	for (const row of members) {
		const g = byId.get(toStr(row.group_id));
		if (g) g.member_slugs.push(toStr(row.activity_slug));
	}
	return [...byId.values()].filter((g) => g.member_slugs.length >= 2);
}

export async function getActivityGroup(id: string): Promise<ActivityGroupInfo | null> {
	if (!id) return null;
	const sql = getSql();
	const rows = (await sql`SELECT id, name, created_on FROM activity_groups WHERE id = ${id} LIMIT 1`) as Record<
		string,
		unknown
	>[];
	if (!rows.length) return null;
	const members = (await sql`
		SELECT activity_slug FROM activity_group_members
		WHERE group_id = ${id}
		ORDER BY sort_order ASC, activity_slug ASC
	`) as { activity_slug: string }[];
	return {
		id: toStr(rows[0]!.id),
		name: toStr(rows[0]!.name),
		created_on: toStr(rows[0]!.created_on),
		member_slugs: members.map((m) => toStr(m.activity_slug)),
		best_efforts: []
	};
}

export async function membershipForSlug(slug: string): Promise<ActivityGroupInfo | null> {
	if (!slug) return null;
	const sql = getSql();
	const rows = (await sql`
		SELECT group_id FROM activity_group_members WHERE activity_slug = ${slug} LIMIT 1
	`) as { group_id: string }[];
	if (!rows.length) return null;
	return getActivityGroup(toStr(rows[0]!.group_id));
}

async function slugsAlreadyGrouped(slugs: string[]): Promise<string[]> {
	if (!slugs.length) return [];
	const sql = getSql();
	const rows = (await sql`SELECT activity_slug FROM activity_group_members`) as {
		activity_slug: string;
	}[];
	const have = new Set(rows.map((r) => toStr(r.activity_slug)));
	return slugs.filter((s) => have.has(s));
}

async function rewriteSortOrder(groupId: string, runs: RunRecord[]): Promise<void> {
	const sql = getSql();
	const ordered = sortGroupMembers(runs);
	for (let i = 0; i < ordered.length; i++) {
		const slug = ordered[i]!.slug;
		await sql`
			UPDATE activity_group_members SET sort_order = ${i}
			WHERE group_id = ${groupId} AND activity_slug = ${slug}
		`;
	}
}

async function pruneGroup(id: string): Promise<void> {
	const sql = getSql();
	const rows = (await sql`
		SELECT COUNT(*) AS n FROM activity_group_members WHERE group_id = ${id}
	`) as { n: number }[];
	if (toNum(rows[0]?.n) >= 2) return;
	await sql`DELETE FROM activity_group_members WHERE group_id = ${id}`;
	await sql`DELETE FROM activity_groups WHERE id = ${id}`;
}

export async function pruneGroupsForSlug(slug: string): Promise<void> {
	const sql = getSql();
	const rows = (await sql`
		SELECT group_id FROM activity_group_members WHERE activity_slug = ${slug}
	`) as { group_id: string }[];
	await sql`DELETE FROM activity_group_members WHERE activity_slug = ${slug}`;
	for (const row of rows) await pruneGroup(toStr(row.group_id));
}

export async function repointGroupMember(oldSlug: string, newSlug: string): Promise<void> {
	if (!oldSlug || !newSlug || oldSlug === newSlug) return;
	const sql = getSql();
	await sql`
		UPDATE activity_group_members SET activity_slug = ${newSlug}
		WHERE activity_slug = ${oldSlug}
	`;
}

export async function createActivityGroup(slugs: string[], name = ''): Promise<ActivityGroupInfo> {
	const unique = [...new Set(slugs.map((s) => s.trim()).filter(Boolean))];
	if (unique.length < 2) throw new Error('Pick at least two activities to group.');
	const taken = await slugsAlreadyGrouped(unique);
	if (taken.length) throw new Error('One of those activities is already in a group.');

	const runs: RunRecord[] = [];
	for (const slug of unique) {
		const run = await getRun(slug);
		if (!run) throw new Error('Activity not found.');
		runs.push(run);
	}
	const ordered = sortGroupMembers(runs);
	const id = crypto.randomUUID();
	const created_on = new Date().toISOString();
	const sql = getSql();
	await sql`
		INSERT INTO activity_groups (id, name, created_on)
		VALUES (${id}, ${name.trim()}, ${created_on})
	`;
	for (let i = 0; i < ordered.length; i++) {
		await sql`
			INSERT INTO activity_group_members (group_id, activity_slug, sort_order)
			VALUES (${id}, ${ordered[i]!.slug}, ${i})
		`;
	}
	return {
		id,
		name: name.trim(),
		created_on,
		member_slugs: ordered.map((r) => r.slug),
		best_efforts: []
	};
}

export async function addActivityToGroup(groupId: string, slug: string): Promise<ActivityGroupInfo> {
	const group = await getActivityGroup(groupId);
	if (!group) throw new Error('Group not found.');
	const run = await getRun(slug);
	if (!run) throw new Error('Activity not found.');
	const taken = await slugsAlreadyGrouped([slug]);
	if (taken.length) throw new Error('That activity is already in a group.');
	const sql = getSql();
	await sql`
		INSERT INTO activity_group_members (group_id, activity_slug, sort_order)
		VALUES (${groupId}, ${slug}, ${group.member_slugs.length})
	`;
	const next = await getActivityGroup(groupId);
	if (!next) throw new Error('Group not found.');
	const members: RunRecord[] = [];
	for (const s of next.member_slugs) {
		const r = await getRun(s);
		if (r) members.push(r);
	}
	await rewriteSortOrder(groupId, members);
	return (await getActivityGroup(groupId))!;
}

export async function removeActivityFromGroup(groupId: string, slug: string): Promise<void> {
	const sql = getSql();
	await sql`
		DELETE FROM activity_group_members WHERE group_id = ${groupId} AND activity_slug = ${slug}
	`;
	await pruneGroup(groupId);
}

export async function ungroupActivities(groupId: string): Promise<void> {
	const sql = getSql();
	await sql`DELETE FROM activity_group_members WHERE group_id = ${groupId}`;
	await sql`DELETE FROM activity_groups WHERE id = ${groupId}`;
}

export async function tracksForMembers(members: RunRecord[]): Promise<TrackSample[][]> {
	const parts: TrackSample[][] = [];
	for (const run of members) {
		const id = routeIdForRun(run);
		if (!id) {
			parts.push([]);
			continue;
		}
		const geo = await getRouteGeoJson(id);
		const { points } = trackFromGeoJson(geo);
		parts.push(points.length >= 2 ? points : []);
	}
	return parts;
}

export async function enrichGroupEfforts(
	group: ActivityGroupInfo,
	members: RunRecord[]
): Promise<ActivityGroupInfo> {
	if (!sameTypeForEfforts(members)) return { ...group, best_efforts: [] };
	const parts = await tracksForMembers(members);
	const memberEfforts = members.map((m) => m.best_efforts ?? []);
	return {
		...group,
		best_efforts: combinedBestEfforts(parts, memberEfforts)
	};
}

export async function enrichAllGroupEfforts(
	groups: ActivityGroupInfo[],
	runs: RunRecord[]
): Promise<ActivityGroupInfo[]> {
	const bySlug = new Map(runs.map((r) => [r.slug, r] as const));
	const out: ActivityGroupInfo[] = [];
	for (const g of groups) {
		const members = g.member_slugs.map((s) => bySlug.get(s)).filter((r): r is RunRecord => r != null);
		out.push(await enrichGroupEfforts(g, members));
	}
	return out;
}

export function groupPrimaryType(members: Pick<RunRecord, 'activity_type'>[]): string {
	const types = [...new Set(members.map((m) => normalizeActivityType(m.activity_type)))];
	return types[0] ?? 'run';
}
