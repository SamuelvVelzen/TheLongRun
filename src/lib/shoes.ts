import type { RunRecord } from './types';

export type ShoeRole = 'active' | 'rotation' | 'retired' | 'logged';

export type ShoeContext = {
	active: string;
	rotation: string[];
	retired: string[];
	notes: string;
};

export type ShoeWear = {
	name: string;
	km: number;
	count: number;
};

export type ShoeChipOption = {
	name: string;
	role: ShoeRole;
};

export function emptyShoes(): ShoeContext {
	return { active: '', rotation: [], retired: [], notes: '' };
}

export function shoeKey(name: string | null | undefined): string {
	return String(name ?? '')
		.trim()
		.replace(/\s+/g, ' ')
		.toLowerCase();
}

export function uniqueShoeNames(names: Iterable<string>): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const raw of names) {
		const name = String(raw ?? '')
			.trim()
			.replace(/\s+/g, ' ');
		const k = shoeKey(name);
		if (!name || !k || seen.has(k)) continue;
		seen.add(k);
		out.push(name);
	}
	return out;
}

export function asShoeNameList(value: unknown): string[] {
	if (Array.isArray(value)) return uniqueShoeNames(value.map(String));
	const raw = String(value ?? '').trim();
	if (!raw) return [];
	return uniqueShoeNames(
		raw
			.split(/\n/)
			.map((s) => s.replace(/^- /, '').trim())
			.filter(Boolean)
	);
}

export function normalizeShoeContext(input: {
	active?: string;
	rotation?: string[];
	retired?: string[];
	notes?: string;
}): ShoeContext {
	const active = String(input.active ?? '')
		.trim()
		.replace(/\s+/g, ' ');
	const rotation = uniqueShoeNames(input.rotation ?? []);
	const retired = uniqueShoeNames(input.retired ?? []).filter((n) => shoeKey(n) !== shoeKey(active));
	const retiredKeys = new Set(retired.map(shoeKey));
	const inRotation = rotation.filter((n) => !retiredKeys.has(shoeKey(n)));
	const rotationWithActive =
		active && !inRotation.some((n) => shoeKey(n) === shoeKey(active))
			? [active, ...inRotation]
			: inRotation;
	return {
		active,
		rotation: rotationWithActive,
		retired,
		notes: String(input.notes ?? '').trim()
	};
}

export function wearByShoe(
	runs: Pick<RunRecord, 'shoes' | 'distance_km'>[]
): Record<string, ShoeWear> {
	const map: Record<string, ShoeWear> = {};
	for (const run of runs) {
		const name = String(run.shoes ?? '')
			.trim()
			.replace(/\s+/g, ' ');
		if (!name) continue;
		const k = shoeKey(name);
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

export function wearFor(name: string, wear: Record<string, ShoeWear> | undefined): ShoeWear | null {
	if (!wear) return null;
	return wear[shoeKey(name)] ?? null;
}

export function formatShoeKm(km: number): string {
	if (!Number.isFinite(km) || km <= 0) return '0 km';
	return `${km >= 100 ? km.toFixed(0) : km.toFixed(1)} km`;
}

export function shoeWearLabel(wear: ShoeWear | null | undefined): string {
	if (!wear || wear.count <= 0) return '';
	const runs = wear.count === 1 ? '1 run' : `${wear.count} runs`;
	return `${formatShoeKm(wear.km)} · ${runs}`;
}

/** Daily + rotation for the picker; `extra` (e.g. this run's pair) is appended if unknown. */
export function shoePickerOptions(ctx: ShoeContext, extra: string[] = []): ShoeChipOption[] {
	const seen = new Set<string>();
	const out: ShoeChipOption[] = [];
	const push = (name: string, role: ShoeRole) => {
		const n = name.trim().replace(/\s+/g, ' ');
		const k = shoeKey(n);
		if (!n || !k || seen.has(k)) return;
		seen.add(k);
		out.push({ name: n, role });
	};
	push(ctx.active, 'active');
	for (const n of ctx.rotation) {
		push(n, shoeKey(n) === shoeKey(ctx.active) ? 'active' : 'rotation');
	}
	for (const n of extra) push(n, 'logged');
	return out;
}

/** Names logged on activities that are not in the inventory. */
export function unknownLoggedShoes(
	ctx: ShoeContext,
	wear: Record<string, ShoeWear>
): ShoeWear[] {
	const known = new Set(
		[ctx.active, ...ctx.rotation, ...ctx.retired].map(shoeKey).filter(Boolean)
	);
	return Object.entries(wear)
		.filter(([k, w]) => !known.has(k) && w.count > 0)
		.map(([, w]) => w)
		.sort((a, b) => b.km - a.km);
}

export function setActiveShoe(ctx: ShoeContext, name: string): ShoeContext {
	const n = name.trim().replace(/\s+/g, ' ');
	if (!n) return ctx;
	return normalizeShoeContext({
		...ctx,
		active: n,
		rotation: uniqueShoeNames([n, ...ctx.rotation]),
		retired: ctx.retired.filter((s) => shoeKey(s) !== shoeKey(n))
	});
}

export function addShoe(ctx: ShoeContext, name: string): ShoeContext {
	const n = name.trim().replace(/\s+/g, ' ');
	if (!n) return ctx;
	if (!ctx.active) return setActiveShoe(ctx, n);
	return normalizeShoeContext({
		...ctx,
		rotation: uniqueShoeNames([...ctx.rotation, n]),
		retired: ctx.retired.filter((s) => shoeKey(s) !== shoeKey(n))
	});
}

export function retireShoe(ctx: ShoeContext, name: string): ShoeContext {
	const k = shoeKey(name);
	if (!k) return ctx;
	const remaining = ctx.rotation.filter((s) => shoeKey(s) !== k);
	const active = shoeKey(ctx.active) === k ? (remaining[0] ?? '') : ctx.active;
	const display = name.trim().replace(/\s+/g, ' ') || name;
	return normalizeShoeContext({
		...ctx,
		active,
		rotation: remaining,
		retired: uniqueShoeNames([...ctx.retired, display])
	});
}

export function restoreShoe(ctx: ShoeContext, name: string): ShoeContext {
	return addShoe(ctx, name);
}

export function removeShoe(ctx: ShoeContext, name: string): ShoeContext {
	const k = shoeKey(name);
	if (!k) return ctx;
	const remaining = ctx.rotation.filter((s) => shoeKey(s) !== k);
	const active = shoeKey(ctx.active) === k ? (remaining[0] ?? '') : ctx.active;
	return normalizeShoeContext({
		...ctx,
		active,
		rotation: remaining,
		retired: ctx.retired.filter((s) => shoeKey(s) !== k)
	});
}
