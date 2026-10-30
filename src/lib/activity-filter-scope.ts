import { ACTIVITY_TYPES, normalizeActivityType, type ActivityType } from '$lib/activity';
import { gearKindForActivity, type GearKind } from '$lib/gear';

const GEAR_SPORTS = new Set<ActivityType>(['run', 'walk', 'bike']);
const MAP_SPORTS = new Set<ActivityType>(['run', 'walk', 'bike']);

export function selectedSports(sport: string): ActivityType[] {
	if (!sport || sport === 'all') return [];
	return ACTIVITY_TYPES.filter((t) => sport.split(',').includes(t));
}

export function sportIsAll(sport: string): boolean {
	return !sport || sport === 'all';
}

export function matchesSportFilter(activityType: string, sport: string): boolean {
	const selected = selectedSports(sport);
	if (selected.length === 0) return true;
	return selected.includes(normalizeActivityType(activityType));
}

export function runsMatchingSport<T extends { activity_type: string }>(runs: T[], sport: string): T[] {
	return runs.filter((r) => matchesSportFilter(r.activity_type, sport));
}

/** Run session kinds — not meaningful for strength-only views. */
export function sessionFilterApplies(sport: string): boolean {
	if (sportIsAll(sport)) return true;
	return selectedSports(sport).includes('run');
}

/** Shoes / walk shoes / bikes — not strength. */
export function gearFilterApplies(sport: string): boolean {
	if (sportIsAll(sport)) return true;
	return selectedSports(sport).some((s) => GEAR_SPORTS.has(s));
}

/** GPS routes — run, walk, bike; not strength. */
export function mapFilterApplies(sport: string): boolean {
	if (sportIsAll(sport)) return true;
	return selectedSports(sport).some((s) => MAP_SPORTS.has(s));
}

/** When sport is narrowed, only gear kinds for those sports appear in the picker. */
export function gearKindsForSport(sport: string): Set<GearKind> | null {
	if (sportIsAll(sport)) return null;
	const kinds = new Set<GearKind>();
	for (const s of selectedSports(sport)) {
		const k = gearKindForActivity(s);
		if (k) kinds.add(k);
	}
	return kinds.size ? kinds : null;
}

export function clearActivityFilterSearch(): Record<string, undefined> {
	return {
		sport: undefined,
		session: undefined,
		map: undefined,
		feel: undefined,
		gear: undefined,
		country: undefined,
		province: undefined,
		place: undefined,
		range: undefined,
		from: undefined,
		to: undefined
	};
}

export function activityFiltersActive(args: {
	sport: string;
	rangeKind: string;
	session: string;
	map: string;
	feel: string;
	gear: string;
	country: string;
	province: string;
	place: string;
}): boolean {
	return (
		!sportIsAll(args.sport) ||
		(args.rangeKind !== 'all' && args.rangeKind !== '') ||
		(args.session !== 'all' && args.session !== '') ||
		args.map === 'mapped' ||
		args.map === 'unmapped' ||
		args.feel === 'yes' ||
		args.feel === 'no' ||
		(args.gear !== 'all' && args.gear !== '') ||
		args.country !== 'all' ||
		args.province !== 'all' ||
		args.place !== 'all'
	);
}
