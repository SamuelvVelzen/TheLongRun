import {
	activityCount,
	normalizeActivityType,
	type ActivityType
} from './activity';
import type { GearImportChange } from './gear-schema';
import { tidyPrompt } from './prompt';
import type { RunRecord } from './types';

export type GearKind = 'shoes' | 'walk_shoes' | 'bike';
export type GearRole = 'active' | 'rotation' | 'retired' | 'logged';

export const GEAR_KINDS: GearKind[] = ['shoes', 'walk_shoes', 'bike'];

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
	/** Context section, e.g. "Run". */
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
	/** Sport used for wear count copy ("3 runs", "2 walks"). */
	wearSport: ActivityType | null;
};

export const GEAR_KIND_META: Record<GearKind, GearKindMeta> = {
	shoes: {
		kind: 'shoes',
		activityTypes: ['run'],
		label: 'Shoes',
		section: 'Run',
		itemSingular: 'pair',
		itemPlural: 'pairs',
		activeLabel: 'Daily',
		setActiveLabel: 'Set daily',
		addLabel: 'Add a pair',
		addPlaceholder: 'e.g. Saucony Endorphin Speed 4',
		customPlaceholder: 'Pair name',
		emptyLabel: 'No pairs in the inventory yet.',
		notesPlaceholder: 'When to use which pair, replacement notes…',
		wearSport: 'run'
	},
	walk_shoes: {
		kind: 'walk_shoes',
		activityTypes: ['walk'],
		label: 'Shoes',
		section: 'Walk',
		itemSingular: 'pair',
		itemPlural: 'pairs',
		activeLabel: 'Daily',
		setActiveLabel: 'Set daily',
		addLabel: 'Add a pair',
		addPlaceholder: 'e.g. Hoka Bondi 8',
		customPlaceholder: 'Pair name',
		emptyLabel: 'No pairs in the inventory yet.',
		notesPlaceholder: 'When to use which pair, replacement notes…',
		wearSport: 'walk'
	},
	bike: {
		kind: 'bike',
		activityTypes: ['bike'],
		label: 'Bicycle',
		section: 'Bike',
		itemSingular: 'bike',
		itemPlural: 'bikes',
		activeLabel: 'Primary',
		setActiveLabel: 'Set primary',
		addLabel: 'Add a bike',
		addPlaceholder: 'e.g. Canyon Endurace',
		customPlaceholder: 'Bike name',
		emptyLabel: 'No bikes in the inventory yet.',
		notesPlaceholder: 'Which bike for what, service notes…',
		wearSport: 'bike'
	}
};

export function gearKindForActivity(activity: string | null | undefined): GearKind | null {
	const t = normalizeActivityType(activity);
	if (t === 'run') return 'shoes';
	if (t === 'walk') return 'walk_shoes';
	if (t === 'bike') return 'bike';
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
	return { shoes: emptyCatalog(), walk_shoes: emptyCatalog(), bike: emptyCatalog() };
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
	if (o.shoes != null || o.walk_shoes != null || o.bike != null) {
		const base = emptyGear();
		return {
			shoes: o.shoes != null ? catalogFromUnknown(o.shoes) : base.shoes,
			walk_shoes: o.walk_shoes != null ? catalogFromUnknown(o.walk_shoes) : base.walk_shoes,
			bike: o.bike != null ? catalogFromUnknown(o.bike) : base.bike
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
		walk_shoes: wearByGearKind(runs, 'walk_shoes'),
		bike: wearByGearKind(runs, 'bike')
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

/** Marker in the gear prompt; the dialog fills this as you type. */
export const GEAR_EXTRA_TOKEN = '<<<GEAR_EXTRA>>>';

export function injectGearExtra(template: string, extra: string): string {
	return template.split(GEAR_EXTRA_TOKEN).join(extra.trim() || '(nothing extra.)');
}

export function gearInventoryLines(gear: GearContext): string[] {
	return GEAR_KINDS.map((kind) => {
		const c = gear[kind];
		if (!catalogHasItems(c)) return null;
		const meta = gearMeta(kind);
		const rot = c.rotation.filter((n) => gearKey(n) !== gearKey(c.active));
		const parts: string[] = [];
		if (c.active) parts.push(`${meta.activeLabel}: ${c.active}`);
		if (rot.length) parts.push(`Rotation: ${rot.join(', ')}`);
		if (c.retired.length) parts.push(`Retired: ${c.retired.join(', ')}`);
		if (c.notes.trim()) parts.push(`Notes: ${c.notes.trim()}`);
		return `${meta.section} — ${parts.join('; ')}`;
	}).filter((line): line is string => Boolean(line));
}

export function buildGearPrompt(gear: GearContext, todayIso: string): string {
	const owned = gearInventoryLines(gear).join('\n') || 'Nothing in the inventory yet.';
	const example = JSON.stringify({
		items: [
			{ kind: 'shoes', name: 'Saucony Endorphin Speed 4', role: 'rotation' },
			{ kind: 'shoes', name: 'Nike Vaporfly 3', role: 'active' }
		]
	});
	return tidyPrompt(`# The Long Run — my kit inventory

Help me keep run/walk shoes and bikes in my app. Today is ${todayIso}.

## What I own now
${owned}

## What I wrote
If this lists kit I own, turn it into items. If it asks what I should buy or retire, suggest changes and say so briefly in prose before the JSON.

${GEAR_EXTRA_TOKEN}

## Reply
A short note is fine, then ONE JSON block in exactly this shape:

\`\`\`json
${example}
\`\`\`

Rules:
- \`kind\`: \`shoes\` (running), \`walk_shoes\`, or \`bike\`.
- \`name\`: exact product name as I would log it on an activity.
- \`role\`: \`active\` (daily/primary pair), \`rotation\` (backup), or \`retired\`.
- Only include items that are new or changed. Reuse an exact name I already have to update its role.
- Do not invent kit I did not mention.
`);
}

export function applyGearImport(ctx: GearContext, changes: GearImportChange[]): GearContext {
	let next = ctx;
	for (const c of changes) {
		let cat = next[c.kind];
		const k = gearKey(c.name);
		const known = [cat.active, ...cat.rotation, ...cat.retired].some((n) => gearKey(n) === k);
		if (!known && c.role !== 'retired') cat = addGear(cat, c.name);
		if (c.role === 'active') cat = setActiveGear(cat, c.name);
		else if (c.role === 'retired') cat = known ? retireGear(cat, c.name) : cat;
		else if (c.role === 'rotation' && known && gearKey(cat.active) === k) {
			/* already active */
		} else if (c.role === 'rotation' && !known) {
			cat = addGear(cat, c.name);
		}
		next = { ...next, [c.kind]: cat };
	}
	return next;
}

/** Compact kit lines for pasting into an AI chat. */
export function formatGearCompact(gear: GearContext): string {
	const lines: string[] = [];
	for (const kind of GEAR_KINDS) {
		const c = gear[kind];
		if (!catalogHasItems(c)) continue;
		const tag = kind === 'shoes' ? 'run' : kind === 'walk_shoes' ? 'walk' : 'bike';
		const parts: string[] = [];
		if (c.active) parts.push(`daily=${c.active}`);
		const rot = c.rotation.filter((n) => gearKey(n) !== gearKey(c.active));
		if (rot.length) parts.push(`rot=${rot.join('|')}`);
		if (c.notes.trim()) parts.push(`note=${c.notes.trim().replace(/\s+/g, ' ')}`);
		if (!parts.length) continue;
		lines.push(`${tag}:${parts.join(';')}`);
	}
	return lines.length ? `gear\n${lines.join('\n')}` : '';
}

export function catalogHasItems(ctx: GearCatalog): boolean {
	return Boolean(ctx.active || ctx.rotation.length || ctx.retired.length);
}
