import {
	combineRunStats,
	groupMembership,
	groupOwnerSlug,
	sortGroupMembers,
	type CombinedRunStats
} from '$lib/group';
import type { ActivityGroupInfo, RunRecord } from '$lib/types';

export type DebriefSessionUnit =
	| { kind: 'single'; members: RunRecord[] }
	| {
			kind: 'group';
			group: ActivityGroupInfo;
			members: RunRecord[];
			stats: CombinedRunStats;
	  };

export function debriefUnitSlug(unit: DebriefSessionUnit): string {
	if (unit.kind === 'group') return groupOwnerSlug(unit.group.id);
	return unit.members[0]!.slug;
}

export function debriefUnitLead(unit: DebriefSessionUnit): RunRecord {
	return sortGroupMembers(unit.members)[0]!;
}

export function debriefUnitMemberIds(unit: DebriefSessionUnit): number[] {
	return sortGroupMembers(unit.members).map((m) => m.id);
}

/** One timeline group per featured row; full member list comes from `allRuns`. */
export function collapseDebriefSessions(
	featured: RunRecord[],
	groups: ActivityGroupInfo[],
	allRuns: RunRecord[]
): DebriefSessionUnit[] {
	const membership = groupMembership(groups);
	const allById = new Map(allRuns.map((r) => [r.id, r] as const));
	const emittedGroups = new Set<string>();
	const emittedSingles = new Set<number>();
	const units: DebriefSessionUnit[] = [];

	for (const run of featured) {
		const group = membership.get(run.id);
		if (!group) {
			if (emittedSingles.has(run.id)) continue;
			emittedSingles.add(run.id);
			units.push({ kind: 'single', members: [run] });
			continue;
		}
		if (emittedGroups.has(group.id)) continue;
		emittedGroups.add(group.id);
		for (const id of group.member_ids) emittedSingles.add(id);

		const members = group.member_ids
			.map((id) => allById.get(id))
			.filter((r): r is RunRecord => r != null);
		const ordered = sortGroupMembers(members);
		if (ordered.length < 2) {
			units.push({ kind: 'single', members: [run] });
			continue;
		}
		units.push({
			kind: 'group',
			group,
			members: ordered,
			stats: combineRunStats(ordered)
		});
	}
	return units;
}

export type DebriefComposeUnit = {
	slug: string;
	members: RunRecord[];
};

export function debriefComposeUnits(units: DebriefSessionUnit[]): DebriefComposeUnit[] {
	return units.map((u) => ({ slug: debriefUnitSlug(u), members: sortGroupMembers(u.members) }));
}
