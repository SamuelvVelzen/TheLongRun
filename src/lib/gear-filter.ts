import {
	GEAR_KINDS,
	gearKey,
	gearKindForActivity,
	gearMeta,
	gearPickerOptions,
	type GearChipOption,
	type GearContext,
	type GearKind
} from '$lib/gear';
import { gearFilterApplies } from '$lib/activity-filter-scope';
import type { RunRecord } from '$lib/types';

/** URL token: `shoes:normalized-name-key` */
export function gearFilterToken(kind: GearKind, name: string): string {
	return `${kind}:${gearKey(name)}`;
}

export function parseGearFilterToken(token: string): { kind: GearKind; key: string } | null {
	const i = token.indexOf(':');
	if (i <= 0) return null;
	const kind = token.slice(0, i) as GearKind;
	if (!GEAR_KINDS.includes(kind)) return null;
	const key = token.slice(i + 1).trim();
	if (!key) return null;
	return { kind, key };
}

export function selectedGearTokens(gear: string): string[] {
	if (!gear || gear === 'all') return [];
	return gear
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean)
		.filter((t) => parseGearFilterToken(t) != null);
}

export function gearFilterIsAll(gear: string): boolean {
	return !gear || gear === 'all' || (selectedGearTokens(gear).length === 0 && !gearFilterIsNone(gear));
}

export const GEAR_FILTER_NONE = 'none';

export function gearFilterIsNone(gear: string): boolean {
	return gear === GEAR_FILTER_NONE;
}

export function parseGearSearch(raw: unknown): string | undefined {
	if (raw === GEAR_FILTER_NONE) return GEAR_FILTER_NONE;
	if (typeof raw !== 'string' || !raw.trim()) return undefined;
	const tokens = raw
		.split(',')
		.map((s) => s.trim())
		.filter((t) => parseGearFilterToken(t) != null);
	if (!tokens.length) return undefined;
	return tokens.join(',');
}

export function matchesGearFilter(
	run: Pick<RunRecord, 'activity_type' | 'gear'>,
	gear: string,
	sport: string
): boolean {
	if (!gearFilterApplies(sport)) return true;
	if (gearFilterIsNone(gear)) {
		const kind = gearKindForActivity(run.activity_type);
		const name = String(run.gear ?? '').trim();
		return !kind || !name;
	}
	const selected = selectedGearTokens(gear);
	if (!selected.length) return true;
	const kind = gearKindForActivity(run.activity_type);
	const name = String(run.gear ?? '').trim();
	if (!kind || !name) return false;
	const token = gearFilterToken(kind, name);
	return selected.includes(token);
}

export type GearFilterOption = {
	token: string;
	kind: GearKind;
	name: string;
	role: GearChipOption['role'];
	section: string;
};

/** Gear names that appear on logged activities, with inventory role labels when known. */
export function gearFilterOptions(
	runs: { activity_type: string; gear?: string }[],
	gearCtx: GearContext,
	allowedKinds: Set<GearKind> | null = null
): GearFilterOption[] {
	const namesByKind: Record<GearKind, string[]> = {
		shoes: [],
		walk_shoes: [],
		bike: []
	};
	const seen: Record<GearKind, Set<string>> = {
		shoes: new Set(),
		walk_shoes: new Set(),
		bike: new Set()
	};

	for (const r of runs) {
		const kind = gearKindForActivity(r.activity_type);
		const name = String(r.gear ?? '').trim().replace(/\s+/g, ' ');
		if (!kind || !name) continue;
		const k = gearKey(name);
		if (!k || seen[kind].has(k)) continue;
		seen[kind].add(k);
		namesByKind[kind].push(name);
	}

	const out: GearFilterOption[] = [];
	for (const kind of GEAR_KINDS) {
		if (allowedKinds && !allowedKinds.has(kind)) continue;
		const names = namesByKind[kind];
		if (!names.length) continue;
		const picker = gearPickerOptions(gearCtx[kind], names);
		const meta = gearMeta(kind);
		for (const name of names) {
			const opt =
				picker.find((p) => gearKey(p.name) === gearKey(name)) ?? ({ name, role: 'logged' } as GearChipOption);
			out.push({
				token: gearFilterToken(kind, name),
				kind,
				name: opt.name,
				role: opt.role,
				section: meta.section
			});
		}
	}
	return out;
}

export function gearOptionsByKind(options: GearFilterOption[]): Map<GearKind, GearFilterOption[]> {
	const map = new Map<GearKind, GearFilterOption[]>();
	for (const o of options) {
		const list = map.get(o.kind) ?? [];
		list.push(o);
		map.set(o.kind, list);
	}
	for (const list of map.values()) {
		list.sort((a, b) => a.name.localeCompare(b.name));
	}
	return map;
}

/** Max distinct gear names before the filter falls back to a select. */
export const GEAR_FILTER_CHIP_MAX = 5;

export function gearOptionLabel(opt: GearFilterOption): string {
	const hint = gearChipHint(opt);
	return hint ? `${opt.name} (${hint})` : opt.name;
}

export function gearChipHint(opt: GearFilterOption): string {
	const meta = gearMeta(opt.kind);
	if (opt.role === 'active') return meta.activeLabel.toLowerCase();
	if (opt.role === 'retired') return 'retired';
	return '';
}

function gearTokenFallbackLabel(token: string): string {
	const parsed = parseGearFilterToken(token);
	if (!parsed) return token;
	return parsed.key.replace(/-/g, ' ');
}

export function gearSummaryLabel(gear: string, options: GearFilterOption[]): string {
	if (gearFilterIsNone(gear)) return 'No gear';
	const selected = selectedGearTokens(gear);
	if (!selected.length) return 'All gear';
	const labels = selected.map((token) => {
		const hit = options.find((o) => o.token === token);
		if (!hit) return gearTokenFallbackLabel(token);
		return gearOptionLabel(hit);
	});
	if (labels.length === 1) return labels[0];
	return labels.join(' + ');
}
