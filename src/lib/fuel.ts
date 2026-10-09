export const FUEL_PHASES = ['before', 'during', 'after'] as const;
export type FuelPhase = (typeof FUEL_PHASES)[number];

export const FUEL_OUTCOMES = ['good', 'mixed', 'bad'] as const;
export type FuelOutcome = (typeof FUEL_OUTCOMES)[number];

export type FuelEntry = {
	id: string;
	phase: FuelPhase;
	item: string;
	timing: string;
	outcome: FuelOutcome;
	notes: string;
	date: string;
	slug: string;
};

export type FuelLog = { entries: FuelEntry[]; guidance: string };

export type FuelRunRef = { date: string; distance_km: number | null; activity_type?: string | null };

export const MAX_FUEL_ITEM = 80;
export const MAX_FUEL_TIMING = 120;
export const MAX_FUEL_NOTES = 400;
export const MAX_FUEL_GUIDANCE = 2000;

export const FUEL_PHASE_META: Record<FuelPhase, { label: string; title: string }> = {
	before: { label: 'Before', title: 'Before the run' },
	during: { label: 'During', title: 'During the run' },
	after: { label: 'After', title: 'After the run' }
};

export const FUEL_OUTCOME_META: Record<FuelOutcome, { label: string; symbol: string }> = {
	good: { label: 'Worked', symbol: '✓' },
	mixed: { label: 'Mixed', symbol: '~' },
	bad: { label: 'Trouble', symbol: '✗' }
};

export const FUEL_PHASE_OPTIONS = FUEL_PHASES.map((value) => ({
	value,
	label: FUEL_PHASE_META[value].label
}));

export const FUEL_OUTCOME_OPTIONS = FUEL_OUTCOMES.map((value) => ({
	value,
	label: FUEL_OUTCOME_META[value].label
}));

export const FUEL_PLACEHOLDERS: Record<FuelPhase, { item: string; timing: string; notes: string }> = {
	before: { item: 'Coffee', timing: '20 min before', notes: 'Fine — 10 min before gave me cramps' },
	during: { item: 'Lidl pigs sweets', timing: 'every 5 km', notes: 'No stomach issues on the long run' },
	after: { item: 'Chocolate milk', timing: 'within 30 min', notes: 'Easy to get down, legs felt better next day' }
};

export const FUEL_PROMPT_RULE =
	'Default to what worked; never suggest a timing that caused trouble. Tries are grouped per item: ✓ worked, ~ mixed, ✗ trouble, with counts.';

export function emptyFuelLog(): FuelLog {
	return { entries: [], guidance: '' };
}

export function newFuelId(): string {
	return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function compactFuelText(value: unknown, max: number): string {
	return String(value ?? '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, max);
}

export function isFuelPhase(v: unknown): v is FuelPhase {
	return typeof v === 'string' && (FUEL_PHASES as readonly string[]).includes(v);
}

export function isFuelOutcome(v: unknown): v is FuelOutcome {
	return typeof v === 'string' && (FUEL_OUTCOMES as readonly string[]).includes(v);
}

/** Stored-data normalizer — lenient, never throws. AI input goes through `fuel-schema.ts`. */
export function normalizeFuelEntry(raw: unknown): FuelEntry | null {
	if (!raw || typeof raw !== 'object') return null;
	const o = raw as Record<string, unknown>;
	const item = compactFuelText(o.item, MAX_FUEL_ITEM);
	if (!item) return null;
	const date = String(o.date ?? '').trim();
	return {
		id: String(o.id ?? '').trim() || newFuelId(),
		phase: isFuelPhase(o.phase) ? o.phase : 'before',
		item,
		timing: compactFuelText(o.timing, MAX_FUEL_TIMING),
		outcome: isFuelOutcome(o.outcome) ? o.outcome : 'good',
		notes: compactFuelText(o.notes, MAX_FUEL_NOTES),
		date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '',
		slug: String(o.slug ?? '').trim()
	};
}

export function normalizeFuelLog(raw: unknown): FuelLog {
	const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
	const entries = Array.isArray(o.entries)
		? o.entries.map(normalizeFuelEntry).filter((e): e is FuelEntry => e != null)
		: [];
	const guidance = String(o.guidance ?? '')
		.trim()
		.slice(0, MAX_FUEL_GUIDANCE);
	return { entries, guidance };
}

/** "Coffee", " coffee. " and "COFFEE" group together. */
export function fuelItemKey(item: string): string {
	return item
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();
}

function timingKey(timing: string): string {
	return timing.toLowerCase().replace(/\s+/g, ' ').trim();
}

export type FuelTally = Record<FuelOutcome, number> & { total: number };

export type FuelGroup = {
	key: string;
	phase: FuelPhase;
	item: string;
	/** Newest first. */
	entries: FuelEntry[];
	tally: FuelTally;
	/** Higher = more recent; dated tries sort by date, undated by log order. */
	recency: string;
};

export function fuelTally(entries: FuelEntry[]): FuelTally {
	const t: FuelTally = { good: 0, mixed: 0, bad: 0, total: entries.length };
	for (const e of entries) t[e.outcome] += 1;
	return t;
}

function recencyOf(e: FuelEntry, index: number): string {
	return `${e.date || '0000-00-00'}|${String(index).padStart(6, '0')}`;
}

export function groupFuelLog(log: FuelLog): Record<FuelPhase, FuelGroup[]> {
	const out: Record<FuelPhase, FuelGroup[]> = { before: [], during: [], after: [] };
	const byKey = new Map<string, { group: FuelGroup; ranked: { e: FuelEntry; r: string }[] }>();
	log.entries.forEach((e, index) => {
		const key = `${e.phase}:${fuelItemKey(e.item)}`;
		const r = recencyOf(e, index);
		let slot = byKey.get(key);
		if (!slot) {
			slot = {
				group: { key, phase: e.phase, item: e.item, entries: [], tally: fuelTally([]), recency: r },
				ranked: []
			};
			byKey.set(key, slot);
			out[e.phase].push(slot.group);
		}
		slot.ranked.push({ e, r });
	});
	for (const { group, ranked } of byKey.values()) {
		ranked.sort((a, b) => (a.r < b.r ? 1 : a.r > b.r ? -1 : 0));
		group.entries = ranked.map((x) => x.e);
		group.item = group.entries[0]!.item;
		group.recency = ranked[0]!.r;
		group.tally = fuelTally(group.entries);
	}
	for (const phase of FUEL_PHASES) {
		out[phase].sort((a, b) => (a.recency < b.recency ? 1 : a.recency > b.recency ? -1 : 0));
	}
	return out;
}

/** Distinct item names, most recent spelling per group. */
export function fuelItemNames(log: FuelLog): string[] {
	const groups = groupFuelLog(log);
	const seen = new Set<string>();
	const names: string[] = [];
	for (const phase of FUEL_PHASES) {
		for (const g of groups[phase]) {
			const k = fuelItemKey(g.item);
			if (seen.has(k)) continue;
			seen.add(k);
			names.push(g.item);
		}
	}
	return names;
}

export function fuelTallyLabel(t: FuelTally): string {
	return `${t.good}/${t.total} worked`;
}

export function fuelHasEntries(log: FuelLog): boolean {
	return log.entries.length > 0;
}

function clip(text: string, max: number): string {
	if (text.length <= max) return text;
	return `${text.slice(0, max - 1).trimEnd()}…`;
}

const MAX_PROMPT_GROUPS_PER_PHASE = 8;
const MAX_PROMPT_NOTE = 60;

function formatGroupLine(group: FuelGroup, runsBySlug: Record<string, FuelRunRef>): string {
	const variants = new Map<string, FuelEntry[]>();
	for (const e of group.entries) {
		const k = timingKey(e.timing);
		const list = variants.get(k) ?? [];
		list.push(e);
		variants.set(k, list);
	}
	const parts = [...variants.values()].map((tries) => {
		const timing = tries[0]!.timing || 'timing not noted';
		const t = fuelTally(tries);
		const counts = FUEL_OUTCOMES.filter((o) => t[o] > 0)
			.map((o) => `${FUEL_OUTCOME_META[o].symbol}${t[o]}`)
			.join(' ');
		const issue = tries.find((e) => e.outcome !== 'good' && e.notes);
		const km = tries
			.map((e) => (e.slug ? runsBySlug[e.slug]?.distance_km : null))
			.filter((n): n is number => typeof n === 'number' && n > 0);
		const extra = [
			km.length ? `up to ${Math.round(Math.max(...km) * 10) / 10} km` : null,
			issue ? clip(issue.notes, MAX_PROMPT_NOTE) : null
		].filter(Boolean);
		return `${timing} ${counts}${extra.length ? ` (${extra.join('; ')})` : ''}`;
	});
	return `${group.item} — ${parts.join('; ')}`;
}

function promptOrder(groups: FuelGroup[]): FuelGroup[] {
	return [...groups].sort((a, b) => {
		const ab = a.tally.bad > 0 ? 1 : 0;
		const bb = b.tally.bad > 0 ? 1 : 0;
		if (ab !== bb) return bb - ab;
		return a.recency < b.recency ? 1 : a.recency > b.recency ? -1 : 0;
	});
}

/** Compact grouped summary for coach prompts — one line per item, capped per phase. */
export function formatFuelSection(log: FuelLog, runsBySlug: Record<string, FuelRunRef> = {}): string {
	const groups = groupFuelLog(log);
	const lines: string[] = [];
	for (const phase of FUEL_PHASES) {
		const ordered = promptOrder(groups[phase]);
		if (!ordered.length) continue;
		const shown = ordered.slice(0, MAX_PROMPT_GROUPS_PER_PHASE);
		const rest = ordered.length - shown.length;
		lines.push(`${FUEL_PHASE_META[phase].label}:`);
		for (const g of shown) lines.push(`- ${formatGroupLine(g, runsBySlug)}`);
		if (rest > 0) lines.push(`- +${rest} more item${rest === 1 ? '' : 's'}`);
	}
	const guidance = log.guidance.trim();
	if (!lines.length && !guidance) {
		return '## Fuel log\n(nothing logged yet)';
	}
	return [
		'## Fuel log — what I eat/drink before, during, after',
		FUEL_PROMPT_RULE,
		guidance ? `Guidance:\n${guidance}` : null,
		lines.length ? lines.join('\n') : '(no tries logged yet)'
	]
		.filter(Boolean)
		.join('\n');
}

export function renameFuelItemIn(log: FuelLog, phase: FuelPhase, from: string, to: string): FuelLog {
	const fromKey = fuelItemKey(from);
	const name = compactFuelText(to, MAX_FUEL_ITEM);
	if (!fromKey || !name) return log;
	return {
		...log,
		entries: log.entries.map((e) =>
			e.phase === phase && fuelItemKey(e.item) === fromKey ? { ...e, item: name } : e
		)
	};
}
