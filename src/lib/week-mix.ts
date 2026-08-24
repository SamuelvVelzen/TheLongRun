import {
    ACTIVITY_TYPES,
    activityLabel,
    normalizeActivityType,
    type ActivityType
} from './activity';

export type WeekMix = Record<ActivityType, number>;

export const WEEKDAYS = [
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday',
	'Sunday'
] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** Day + sport only. Session kind (Easy / Long / …) is the coach’s job, not stored here. */
export type WeekSlot = {
	day: Weekday;
	activity_type: ActivityType;
};

export type WeekPattern = WeekSlot[];

export const ZERO_WEEK_MIX: WeekMix = {
	run: 0,
	walk: 0,
	ride: 0,
	swim: 0,
	strength: 0
};

const MAX_SLOTS = 14;

/** Usual week until the user saves their own skeleton. */
export const DEFAULT_WEEK_PATTERN: WeekPattern = [
	{ day: 'Tuesday', activity_type: 'run' },
	{ day: 'Wednesday', activity_type: 'ride' },
	{ day: 'Thursday', activity_type: 'strength' },
	{ day: 'Friday', activity_type: 'run' },
	{ day: 'Sunday', activity_type: 'run' }
];

export function clonePattern(pattern: WeekPattern): WeekPattern {
	return pattern.map((s) => ({
		day: s.day,
		activity_type: s.activity_type
	}));
}

export function weekdayIndex(day: string): number {
	const i = WEEKDAYS.indexOf(day as Weekday);
	return i >= 0 ? i : 99;
}

export function sortPattern(pattern: WeekPattern): WeekPattern {
	return clonePattern(pattern).sort((a, b) => {
		const d = weekdayIndex(a.day) - weekdayIndex(b.day);
		if (d !== 0) return d;
		return ACTIVITY_TYPES.indexOf(a.activity_type) - ACTIVITY_TYPES.indexOf(b.activity_type);
	});
}

export function mixFromPattern(pattern: WeekPattern): WeekMix {
	const out: WeekMix = { ...ZERO_WEEK_MIX };
	for (const s of pattern) out[s.activity_type]++;
	return out;
}

export const DEFAULT_WEEK_MIX: WeekMix = mixFromPattern(DEFAULT_WEEK_PATTERN);

export function mixesEqual(a: WeekMix, b: WeekMix): boolean {
	return ACTIVITY_TYPES.every((t) => a[t] === b[t]);
}

export function patternsEqual(a: WeekPattern, b: WeekPattern): boolean {
	const aa = sortPattern(a);
	const bb = sortPattern(b);
	if (aa.length !== bb.length) return false;
	return aa.every((s, i) => s.day === bb[i]!.day && s.activity_type === bb[i]!.activity_type);
}

const PREFERRED_DAYS: Record<ActivityType, Weekday[]> = {
	run: ['Tuesday', 'Friday', 'Sunday', 'Thursday', 'Monday', 'Saturday', 'Wednesday'],
	ride: ['Wednesday', 'Saturday', 'Monday', 'Thursday', 'Tuesday', 'Friday', 'Sunday'],
	strength: ['Thursday', 'Monday', 'Wednesday', 'Tuesday', 'Friday', 'Saturday', 'Sunday'],
	walk: ['Saturday', 'Monday', 'Wednesday', 'Thursday', 'Friday', 'Sunday', 'Tuesday'],
	swim: ['Monday', 'Wednesday', 'Friday', 'Saturday', 'Tuesday', 'Thursday', 'Sunday']
};

function pickDay(type: ActivityType, used: Set<Weekday>, index: number): Weekday {
	const preferred = PREFERRED_DAYS[type];
	return (
		preferred.find((d) => !used.has(d)) ??
		WEEKDAYS.find((d) => !used.has(d)) ??
		preferred[index % preferred.length]!
	);
}

/** Turn old count-only mixes into a weekday skeleton (no session kinds). */
export function patternFromMix(mix: WeekMix): WeekPattern {
	if (mixesEqual(mix, DEFAULT_WEEK_MIX)) return clonePattern(DEFAULT_WEEK_PATTERN);
	const used = new Set<Weekday>();
	const out: WeekPattern = [];
	for (const type of ACTIVITY_TYPES) {
		const n = Math.max(0, Math.min(MAX_SLOTS, mix[type] ?? 0));
		for (let i = 0; i < n; i++) {
			const day = pickDay(type, used, i);
			used.add(day);
			out.push({ day, activity_type: type });
		}
	}
	return sortPattern(out).slice(0, MAX_SLOTS);
}

function normalizeWeekday(raw: unknown): Weekday | null {
	const s = String(raw ?? '').trim();
	const exact = WEEKDAYS.find((d) => d === s);
	if (exact) return exact;
	const lower = s.toLowerCase();
	return WEEKDAYS.find((d) => d.toLowerCase() === lower || d.slice(0, 3).toLowerCase() === lower) ?? null;
}

function normalizeSlot(raw: unknown): WeekSlot | null {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
	const o = raw as Record<string, unknown>;
	const day = normalizeWeekday(o.day);
	if (!day) return null;
	return {
		day,
		activity_type: normalizeActivityType(
			typeof o.activity_type === 'string' ? o.activity_type : 'run'
		)
	};
}

const MAX_COUNT = 10;

export function normalizeWeekMix(raw: unknown): WeekMix {
	const out: WeekMix = { ...ZERO_WEEK_MIX };
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_WEEK_MIX };
	const o = raw as Record<string, unknown>;
	let any = false;
	for (const t of ACTIVITY_TYPES) {
		const n = Number(o[t]);
		if (Number.isFinite(n)) {
			any = true;
			out[t] = Math.max(0, Math.min(MAX_COUNT, Math.round(n)));
		}
	}
	return any ? out : { ...DEFAULT_WEEK_MIX };
}

export function normalizeWeekPattern(raw: unknown): WeekPattern {
	if (Array.isArray(raw)) {
		const slots = raw.map(normalizeSlot).filter((s): s is WeekSlot => s != null);
		return slots.length ? sortPattern(slots).slice(0, MAX_SLOTS) : [];
	}
	if (raw && typeof raw === 'object') {
		const o = raw as Record<string, unknown>;
		if (ACTIVITY_TYPES.some((t) => t in o)) return patternFromMix(normalizeWeekMix(raw));
	}
	return clonePattern(DEFAULT_WEEK_PATTERN);
}

export function formatPatternProse(pattern: WeekPattern): string {
	if (!pattern.length) return 'no pinned sessions';
	return sortPattern(pattern)
		.map((s) => {
			const sport =
				s.activity_type === 'strength' ? 'gym' : activityLabel(s.activity_type).toLowerCase();
			return `${s.day} ${sport}`;
		})
		.join(', ');
}

export function formatPatternLines(pattern: WeekPattern): string {
	if (!pattern.length) return '- (none pinned)';
	return sortPattern(pattern)
		.map((s) => `- ${s.day} — ${activityLabel(s.activity_type)}`)
		.join('\n');
}

function exampleDistance(type: ActivityType, index: number, total: number): number | null {
	if (type === 'strength') return null;
	if (type === 'run') {
		if (total >= 2 && index === total - 1) return 12;
		if (index === 1) return 8;
		return 6;
	}
	if (type === 'ride') return 25;
	if (type === 'walk') return 5;
	if (type === 'swim') return 1;
	return 6;
}

/**
 * Illustrative JSON: keep the user’s days/sports; `label` / distance / detail are
 * examples of what the model should invent, not values copied from the skeleton.
 */
export function exampleSessionsForPattern(pattern: WeekPattern): Record<string, unknown>[] {
	const slots = sortPattern(pattern.length ? pattern : DEFAULT_WEEK_PATTERN);
	const seen: Partial<Record<ActivityType, number>> = {};
	const totals: Partial<Record<ActivityType, number>> = {};
	for (const s of slots) totals[s.activity_type] = (totals[s.activity_type] ?? 0) + 1;
	return slots.map((s) => {
		const i = seen[s.activity_type] ?? 0;
		seen[s.activity_type] = i + 1;
		const total = totals[s.activity_type] ?? 1;
		return {
			day: s.day,
			activity_type: s.activity_type,
			label: 'YOU CHOOSE',
			distance_km: exampleDistance(s.activity_type, i, total),
			detail: 'YOU CHOOSE — intent; keep this weekday unless you explain a shift'
		};
	});
}

export function formatPatternPromptSection(opts: {
	defaultPattern: WeekPattern;
	thisWeek: WeekPattern;
	weekPhrase: string;
	note?: string;
}): string {
	const usual = formatPatternLines(opts.defaultPattern);
	const now = formatPatternLines(opts.thisWeek);
	const same = patternsEqual(opts.defaultPattern, opts.thisWeek);
	const count = opts.thisWeek.length;
	const lines = [
		`## Usual weekdays for ${opts.weekPhrase}`,
		'My usual week is **day + sport only** — not session kinds, not a count of runs to reshuffle:',
		usual,
		same
			? `For **${opts.weekPhrase}** use **those same days and sports**.`
			: `For **${opts.weekPhrase}** use this skeleton instead:\n${now}`,
		count
			? `**Keep these days and sports.** You choose the session kind (\`label\`: Easy, Quality, Long, tempo, easy spin, endurance ride, Gym, …), plus distance or duration and intent. The skeleton has no kinds — do not copy placeholder labels. Do not invent a different weekday pattern (do not move a Tuesday run to Wednesday just because a template prefers other days). Only shift a session if recovery, heat, life, or the notes below require it — and if you move a day, say why in prose.`
			: `I did not pin a usual week — plan whatever the week needs across the sports I do (run, ride, walk, swim, strength). Do not default to a 3-run template.`
	];
	if (opts.note?.trim()) {
		lines.push(`Extra for ${opts.weekPhrase}: ${opts.note.trim()}`);
	}
	return lines.join('\n');
}

export function sessionActivityType(session: {
	activity_type?: string | null;
	label?: string;
}): ActivityType {
	return normalizeActivityType(session.activity_type ?? 'run');
}

export const MAX_WEEK_SLOTS = MAX_SLOTS;
