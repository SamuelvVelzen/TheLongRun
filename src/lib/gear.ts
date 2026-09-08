import {
	activityCount,
	normalizeActivityType,
	type ActivityType
} from './activity';
import type { RunRecord } from './types';

export type GearKind = 'shoes' | 'bike' | 'swim';
export type GearRole = 'active' | 'rotation' | 'retired' | 'logged';

export const GEAR_KINDS: GearKind[] = ['shoes', 'bike', 'swim'];

export type GearCatalog = {
	active: string;
	rotation: string[];
	retired: string[];
	notes: string;
};

export type GearContext = Record<GearKind, GearCatalog>;

export type GearWear = {
	name: string;
	km: number;
	count: number;
};

export type GearChipOption = {
	name: string;
	role: GearRole;
};

export type GearKindMeta = {
	kind: GearKind;
	/** Activity types that use this catalog. */
	activityTypes: ActivityType[];
	/** Short heading next to the activity, e.g. "Shoes". */
	label: string;
	/** Context section, e.g. "Run & walk". */
	section: string;
	itemSingular: string;
	itemPlural: string;
	activeLabel: string;
	setActiveLabel: string;
	addLabel: string;
	addPlaceholder: string;
	customPlaceholder: string;
	emptyLabel: string;
	notesPlaceholder: string;
	/** Sport used for wear count copy ("3 rides"). Shoes mix run+walk → activities. */
	wearSport: ActivityType | null;
};

export const GEAR_KIND_META: Record<GearKind, GearKindMeta> = {
	shoes: {
		kind: 'shoes',
		activityTypes: ['run', 'walk'],
		label: 'Shoes',
		section: 'Run & walk',
		itemSingular: 'pair',
		itemPlural: 'pairs',
		activeLabel: 'Daily',
		setActiveLabel: 'Set daily',
		addLabel: 'Add a pair',
		addPlaceholder: 'e.g. Saucony Endorphin Speed 4',
		customPlaceholder: 'Pair name',
		emptyLabel: 'No pairs in the inventory yet.',
		notesPlaceholder: 'When to use which pair, replacement notes…',
		wearSport: null
	},
	bike: {
		kind: 'bike',
		activityTypes: ['ride'],
		label: 'Bicycle',
		section: 'Ride',
		itemSingular: 'bike',
		itemPlural: 'bikes',
		activeLabel: 'Primary',
		setActiveLabel: 'Set primary',
		addLabel: 'Add a bike',
		addPlaceholder: 'e.g. Canyon Endurace',
		customPlaceholder: 'Bike name',
		emptyLabel: 'No bikes in the inventory yet.',
		notesPlaceholder: 'Which bike for what, service notes…',
		wearSport: 'ride'
	},
	swim: {
		kind: 'swim',
		activityTypes: ['swim'],
		label: 'Swim kit',
		section: 'Swim',
		itemSingular: 'kit',
		itemPlural: 'kits',
		activeLabel: 'Primary',
		setActiveLabel: 'Set primary',
		addLabel: 'Add kit',
		addPlaceholder: 'e.g. Orca wetsuit / Arena goggles',
		customPlaceholder: 'Kit name',
		emptyLabel: 'No swim kit in the inventory yet.',
		notesPlaceholder: 'Wetsuit, goggles, pool vs open water…',
		wearSport: 'swim'
	}
};

export function gearKindForActivity(activity: string | null | undefined): GearKind | null {
	const t = normalizeActivityType(activity);
	if (t === 'run' || t === 'walk') return 'shoes';
	if (t === 'ride') return 'bike';
	if (t === 'swim') return 'swim';
	return null;
}

export function gearMeta(kind: GearKind): GearKindMeta {
	return GEAR_KIND_META[kind];
}

export function gearMetaForActivity(activity: string | null | undefined): GearKindMeta | null {
	const kind = gearKindForActivity(activity);
	return kind ? GEAR_KIND_META[kind] : null;
}

export function emptyCatalog(): GearCatalog {
	return { active: '', rotation: [], retired: [], notes: '' };
}

export function emptyGear(): GearContext {
	return { shoes: emptyCatalog(), bike: emptyCatalog(), swim: emptyCatalog() };
}

export function gearKey(name: string | null | undefined): string {
	return String(name ?? '')
		.trim()
		.replace(/\s+/g, ' ')
		.toLowerCase();
}

export function uniqueGearNames(names: Iterable<string>): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const raw of names) {
		const name = String(raw ?? '')
			.trim()
			.replace(/\s+/g, ' ');
		const k = gearKey(name);
		if (!name || !k || seen.has(k)) continue;
		seen.add(k);
		out.push(name);
	}
	return out;
}

export function asGearNameList(value: unknown): string[] {
	if (Array.isArray(value)) return uniqueGearNames(value.map(String));
	const raw = String(value ?? '').trim();
	if (!raw) return [];
	return uniqueGearNames(
		raw
			.split(/\n/)
			.map((s) => s.replace(/^- /, '').trim())
			.filter(Boolean)
	);
}

export function normalizeGearCatalog(input: {
	active?: string;
	rotation?: string[];
	retired?: string[];
	notes?: string;
}): GearCatalog {
	const active = String(input.active ?? '')
		.trim()
		.replace(/\s+/g, ' ');
	const rotation = uniqueGearNames(input.rotation ?? []);
	const retired = uniqueGearNames(input.retired ?? []).filter((n) => gearKey(n) !== gearKey(active));
	const retiredKeys = new Set(retired.map(gearKey));
	const inRotation = rotation.filter((n) => !retiredKeys.has(gearKey(n)));
	const rotationWithActive =
		active && !inRotation.some((n) => gearKey(n) === gearKey(active))
			? [active, ...inRotation]
			: inRotation;
	return {
		active,
		rotation: rotationWithActive,
		retired,
		notes: String(input.notes ?? '').trim()
	};
}

function catalogFromUnknown(value: unknown): GearCatalog {
	if (!value || typeof value !== 'object') return emptyCatalog();
	const o = value as Record<string, unknown>;
	return normalizeGearCatalog({
		active: String(o.active ?? ''),
		rotation: asGearNameList(o.rotation),
		retired: asGearNameList(o.retired),
		notes: String(o.notes ?? '')
	});
}

/** Accepts the new per-kind shape or the legacy single-catalog shoes.md YAML. */
export function normalizeGearContext(input: unknown): GearContext {
	if (!input || typeof input !== 'object') return emptyGear();
	const o = input as Record<string, unknown>;
	if (o.shoes != null || o.bike != null || o.swim != null) {
		return {
			shoes: catalogFromUnknown(o.shoes),
			bike: catalogFromUnknown(o.bike),
			swim: catalogFromUnknown(o.swim)
		};
	}
	if ('active' in o || 'rotation' in o || 'retired' in o) {
		return { ...emptyGear(), shoes: catalogFromUnknown(o) };
	}
	return emptyGear();
}

function wearFromRuns(
	runs: Pick<RunRecord, 'gear' | 'distance_km'>[]
): Record<string, GearWear> {
	const map: Record<string, GearWear> = {};
	for (const run of runs) {
		const name = String(run.gear ?? '')
			.trim()
			.replace(/\s+/g, ' ');
		if (!name) continue;
		const k = gearKey(name);
		const prev = map[k];
		if (prev) {
			prev.km += run.distance_km ?? 0;
			prev.count += 1;
		} else {
			map[k] = { name, km: run.distance_km ?? 0, count: 1 };
		}
	}
	for (const v of Object.values(map)) v.km = Math.round(v.km * 10) / 10;
	return map;
}

export function wearByGearKind(
	runs: Pick<RunRecord, 'gear' | 'distance_km' | 'activity_type'>[],
	kind: GearKind
): Record<string, GearWear> {
	const types = new Set(GEAR_KIND_META[kind].activityTypes);
	return wearFromRuns(runs.filter((r) => types.has(normalizeActivityType(r.activity_type))));
}

export function wearByAllGear(
	runs: Pick<RunRecord, 'gear' | 'distance_km' | 'activity_type'>[]
): Record<GearKind, Record<string, GearWear>> {
	return {
		shoes: wearByGearKind(runs, 'shoes'),
		bike: wearByGearKind(runs, 'bike'),
		swim: wearByGearKind(runs, 'swim')
	};
}

export function wearFor(name: string, wear: Record<string, GearWear> | undefined): GearWear | null {
	if (!wear) return null;
	return wear[gearKey(name)] ?? null;
}

export function formatGearKm(km: number): string {
	if (!Number.isFinite(km) || km <= 0) return '0 km';
	return `${km >= 100 ? km.toFixed(0) : km.toFixed(1)} km`;
}

export function gearWearLabel(wear: GearWear | null | undefined, kind: GearKind): string {
	if (!wear || wear.count <= 0) return '';
	const sport = GEAR_KIND_META[kind].wearSport;
	const count = activityCount(wear.count, sport);
	return `${formatGearKm(wear.km)} · ${count}`;
}

/** Daily/primary + rotation for the picker; `extra` (e.g. this activity's item) is appended if unknown. */
export function gearPickerOptions(ctx: GearCatalog, extra: string[] = []): GearChipOption[] {
	const seen = new Set<string>();
	const out: GearChipOption[] = [];
	const push = (name: string, role: GearRole) => {
		const n = name.trim().replace(/\s+/g, ' ');
		const k = gearKey(n);
		if (!n || !k || seen.has(k)) return;
		seen.add(k);
		out.push({ name: n, role });
	};
	push(ctx.active, 'active');
	for (const n of ctx.rotation) {
		push(n, gearKey(n) === gearKey(ctx.active) ? 'active' : 'rotation');
	}
	for (const n of extra) push(n, 'logged');
	return out;
}

/** Names logged on matching activities that are not in the inventory. */
export function unknownLoggedGear(ctx: GearCatalog, wear: Record<string, GearWear>): GearWear[] {
	const known = new Set(
		[ctx.active, ...ctx.rotation, ...ctx.retired].map(gearKey).filter(Boolean)
	);
	return Object.entries(wear)
		.filter(([k, w]) => !known.has(k) && w.count > 0)
		.map(([, w]) => w)
		.sort((a, b) => b.km - a.km);
}

export function setActiveGear(ctx: GearCatalog, name: string): GearCatalog {
	const n = name.trim().replace(/\s+/g, ' ');
	if (!n) return ctx;
	return normalizeGearCatalog({
		...ctx,
		active: n,
		rotation: uniqueGearNames([n, ...ctx.rotation]),
		retired: ctx.retired.filter((s) => gearKey(s) !== gearKey(n))
	});
}

export function addGear(ctx: GearCatalog, name: string): GearCatalog {
	const n = name.trim().replace(/\s+/g, ' ');
	if (!n) return ctx;
	if (!ctx.active) return setActiveGear(ctx, n);
	return normalizeGearCatalog({
		...ctx,
		rotation: uniqueGearNames([...ctx.rotation, n]),
		retired: ctx.retired.filter((s) => gearKey(s) !== gearKey(n))
	});
}

export function retireGear(ctx: GearCatalog, name: string): GearCatalog {
	const k = gearKey(name);
	if (!k) return ctx;
	const remaining = ctx.rotation.filter((s) => gearKey(s) !== k);
	const active = gearKey(ctx.active) === k ? (remaining[0] ?? '') : ctx.active;
	const display = name.trim().replace(/\s+/g, ' ') || name;
	return normalizeGearCatalog({
		...ctx,
		active,
		rotation: remaining,
		retired: uniqueGearNames([...ctx.retired, display])
	});
}

export function restoreGear(ctx: GearCatalog, name: string): GearCatalog {
	return addGear(ctx, name);
}

export function removeGear(ctx: GearCatalog, name: string): GearCatalog {
	const k = gearKey(name);
	if (!k) return ctx;
	const remaining = ctx.rotation.filter((s) => gearKey(s) !== k);
	const active = gearKey(ctx.active) === k ? (remaining[0] ?? '') : ctx.active;
	return normalizeGearCatalog({
		...ctx,
		active,
		rotation: remaining,
		retired: ctx.retired.filter((s) => gearKey(s) !== k)
	});
}

export function catalogHasItems(ctx: GearCatalog): boolean {
	return Boolean(ctx.active || ctx.rotation.length || ctx.retired.length);
}
