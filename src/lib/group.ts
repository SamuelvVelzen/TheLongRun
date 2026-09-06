import {
	activityLabel,
	headlineMetric,
	normalizeActivityType,
	type ActivityType
} from '$lib/activity';
import {
	highlightsForActivity,
	supportsBestEfforts,
	type BestEffort,
	type EffortHighlight,
	type EffortOwner
} from '$lib/best-efforts';
import { formatDuration, formatPace, parseDurationSeconds } from '$lib/format';
import type { ActivityGroupInfo, RunRecord, RunWithMap } from '$lib/types';

export const GROUP_OWNER_PREFIX = 'group:';

export function groupOwnerSlug(groupId: string): string {
	return `${GROUP_OWNER_PREFIX}${groupId}`;
}

export function isGroupOwnerSlug(slug: string): boolean {
	return slug.startsWith(GROUP_OWNER_PREFIX);
}

export function groupIdFromOwnerSlug(slug: string): string | null {
	return isGroupOwnerSlug(slug) ? slug.slice(GROUP_OWNER_PREFIX.length) : null;
}

export type CombinedRunStats = {
	date: string;
	day: string;
	start_time: string;
	activity_type: string;
	types: ActivityType[];
	mixed: boolean;
	distance_km: number | null;
	time: string;
	elapsed_time: string;
	avg_pace: string;
	avg_hr: number | null;
	max_hr: number | null;
	elev_gain: number | null;
	calories: number | null;
	max_speed: number | null;
	shoes: string;
};

export type TimelineItem =
	| { kind: 'run'; run: RunWithMap }
	| { kind: 'group'; group: ActivityGroupInfo; members: RunWithMap[]; stats: CombinedRunStats };

export function sortGroupMembers<T extends Pick<RunRecord, 'date' | 'start_time' | 'slug'>>(
	members: T[]
): T[] {
	return [...members].sort(
		(a, b) =>
			a.date.localeCompare(b.date) ||
			(a.start_time || '').localeCompare(b.start_time || '') ||
			a.slug.localeCompare(b.slug)
	);
}

function activityStartMs(run: Pick<RunRecord, 'date' | 'start_time'>): number | null {
	if (!run.date) return null;
	const clock = run.start_time || '00:00';
	const d = new Date(`${run.date}T${clock}:00`);
	return Number.isNaN(d.getTime()) ? null : d.getTime();
}

function activityEndMs(
	run: Pick<RunRecord, 'date' | 'start_time' | 'time' | 'elapsed_time'>
): number | null {
	const start = activityStartMs(run);
	if (start == null) return null;
	const elapsed = parseDurationSeconds(run.elapsed_time) ?? parseDurationSeconds(run.time) ?? 0;
	return start + elapsed * 1000;
}

export function combineRunStats(
	members: Array<
		Pick<
			RunRecord,
			| 'date'
			| 'day'
			| 'start_time'
			| 'activity_type'
			| 'distance_km'
			| 'time'
			| 'elapsed_time'
			| 'avg_pace'
			| 'avg_hr'
			| 'max_hr'
			| 'elev_gain'
			| 'calories'
			| 'max_speed'
			| 'shoes'
			| 'slug'
		>
	>
): CombinedRunStats {
	const ordered = sortGroupMembers(members);
	const first = ordered[0];
	const types = [
		...new Set(ordered.map((m) => normalizeActivityType(m.activity_type)))
	] as ActivityType[];
	const mixed = types.length > 1;
	const activity_type = mixed ? types[0]! : (types[0] ?? 'run');

	const dist = ordered.reduce((acc, m) => acc + (m.distance_km ?? 0), 0);
	const moving = ordered.reduce((acc, m) => acc + (parseDurationSeconds(m.time) ?? 0), 0);
	const starts = ordered.map(activityStartMs).filter((n): n is number => n != null);
	const ends = ordered.map(activityEndMs).filter((n): n is number => n != null);
	let elapsed = 0;
	if (starts.length && ends.length) {
		elapsed = Math.max(0, (Math.max(...ends) - Math.min(...starts)) / 1000);
	} else {
		elapsed = ordered.reduce(
			(acc, m) => acc + (parseDurationSeconds(m.elapsed_time) ?? parseDurationSeconds(m.time) ?? 0),
			0
		);
	}

	const hrWeight = ordered
		.map((m) => {
			const sec = parseDurationSeconds(m.time) ?? 0;
			return m.avg_hr != null && sec > 0 ? { hr: m.avg_hr, sec } : null;
		})
		.filter((x): x is { hr: number; sec: number } => x != null);
	const hrSum = hrWeight.reduce((acc, x) => acc + x.hr * x.sec, 0);
	const hrSec = hrWeight.reduce((acc, x) => acc + x.sec, 0);
	const maxHrs = ordered.map((m) => m.max_hr).filter((n): n is number => n != null);
	const elevs = ordered.map((m) => m.elev_gain).filter((n): n is number => n != null);
	const cals = ordered.map((m) => m.calories).filter((n): n is number => n != null);
	const speeds = ordered.map((m) => m.max_speed).filter((n): n is number => n != null);
	const shoeSet = new Set(ordered.map((m) => m.shoes.trim()).filter(Boolean));

	const distance_km = dist > 0 ? Math.round(dist * 100) / 100 : null;
	const time = moving > 0 ? formatDuration(moving) : '';
	const avg_pace =
		distance_km && moving ? formatPace(distance_km * 1000, moving) : first?.avg_pace || '';

	return {
		date: first?.date ?? '',
		day: first?.day ?? '',
		start_time: first?.start_time ?? '',
		activity_type,
		types,
		mixed,
		distance_km,
		time,
		elapsed_time: elapsed > 0 ? formatDuration(elapsed) : '',
		avg_pace,
		avg_hr: hrSec > 0 ? Math.round(hrSum / hrSec) : null,
		max_hr: maxHrs.length ? Math.max(...maxHrs) : null,
		elev_gain: elevs.length ? Math.round(elevs.reduce((a, b) => a + b, 0) * 10) / 10 : null,
		calories: cals.length ? cals.reduce((a, b) => a + b, 0) : null,
		max_speed: speeds.length ? Math.max(...speeds) : null,
		shoes: shoeSet.size === 1 ? [...shoeSet][0]! : ''
	};
}

export function groupedSessionTitle(
	group: Pick<ActivityGroupInfo, 'name'>,
	partCount: number,
	date: string
): string {
	const name = group.name.trim();
	if (name) return name;
	return `${date} · ${partCount} part${partCount === 1 ? '' : 's'}`;
}

export function groupTypeCaption(stats: CombinedRunStats): string {
	if (!stats.mixed) return activityLabel(stats.activity_type);
	return stats.types.map((t) => activityLabel(t)).join(' + ');
}

export function groupMembership(groups: ActivityGroupInfo[]): Map<string, ActivityGroupInfo> {
	const map = new Map<string, ActivityGroupInfo>();
	for (const g of groups) {
		for (const slug of g.member_slugs) map.set(slug, g);
	}
	return map;
}

/**
 * Collapse grouped members into one item. A group appears if any member is in `visible`;
 * stats use every member found in `all`.
 */
export function collapseRuns(
	visible: RunWithMap[],
	all: RunWithMap[],
	groups: ActivityGroupInfo[]
): TimelineItem[] {
	const allBySlug = new Map(all.map((r) => [r.slug, r] as const));
	const membership = groupMembership(groups);
	const emitted = new Set<string>();
	const items: TimelineItem[] = [];

	for (const run of visible) {
		const group = membership.get(run.slug);
		if (!group) {
			items.push({ kind: 'run', run });
			continue;
		}
		if (emitted.has(group.id)) continue;
		emitted.add(group.id);
		const members = group.member_slugs
			.map((slug) => allBySlug.get(slug))
			.filter((r): r is RunWithMap => r != null);
		if (members.length < 2) {
			items.push({ kind: 'run', run });
			continue;
		}
		items.push({
			kind: 'group',
			group,
			members: sortGroupMembers(members),
			stats: combineRunStats(members)
		});
	}
	return items;
}

export function effortOwnersForBoard(
	runs: EffortOwner[],
	groups: ActivityGroupInfo[],
	runBySlug: Map<string, EffortOwner>
): EffortOwner[] {
	const grouped = new Set(groups.flatMap((g) => g.member_slugs));
	const out: EffortOwner[] = runs.filter((r) => !grouped.has(r.slug));
	for (const g of groups) {
		const members = g.member_slugs
			.map((slug) => runBySlug.get(slug))
			.filter((r): r is EffortOwner => r != null);
		if (members.length < 2) {
			out.push(...members);
			continue;
		}
		const types = [...new Set(members.map((m) => normalizeActivityType(m.activity_type)))];
		if (types.length !== 1 || !supportsBestEfforts(types[0])) {
			out.push(...members);
			continue;
		}
		out.push({
			slug: groupOwnerSlug(g.id),
			date: members.slice().sort((a, b) => a.date.localeCompare(b.date) || a.slug.localeCompare(b.slug))[0]
				?.date ?? '',
			activity_type: types[0]!,
			best_efforts: g.best_efforts
		});
	}
	return out;
}

export function groupHighlights(
	group: ActivityGroupInfo,
	stats: CombinedRunStats,
	boardOwners: EffortOwner[]
): EffortHighlight[] {
	if (stats.mixed || !supportsBestEfforts(stats.activity_type) || !group.best_efforts.length) {
		return [];
	}
	return highlightsForActivity(groupOwnerSlug(group.id), stats.activity_type, boardOwners);
}

export function combinedHeadline(
	stats: Pick<CombinedRunStats, 'activity_type' | 'avg_pace' | 'distance_km' | 'time'>
) {
	return headlineMetric(stats);
}
