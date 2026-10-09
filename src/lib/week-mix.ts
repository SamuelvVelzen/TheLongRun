import {
    ACTIVITY_TYPES,
    activityCount,
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

/**
 * `fixed` = pinned (commute — never moved or dropped), `optional` = pinned but skippable,
 * `preference` = soft wish the coach may move or drop. Omitted (legacy data) = preference.
 */
export type WeekSlotConstraint = 'fixed' | 'optional' | 'preference';

/** Day + sport only. Session kind (Easy / Long / …) is the coach’s job, not stored here. */
export type WeekSlot = {
	day: Weekday;
	activity_type: ActivityType;
	constraint?: WeekSlotConstraint;
	/** Free text copied into the generate / debrief prompt for this slot. */
	notes?: string;
};

export type WeekPattern = WeekSlot[];

/** `off` = no sessions that day; `limited` = sessions only within the note (time window, max duration). */
export type DayLimitKind = 'off' | 'limited';

export type DayLimit = {
	day: Weekday;
	kind: DayLimitKind;
	notes?: string;
};

/** Pinned activities, day limits, and which sports the coach schedules around them. */
export type WeekSetup = {
	pattern: WeekPattern;
	dayLimits: DayLimit[];
	plannedSports: ActivityType[];
};

const MAX_SLOT_NOTES = 400;

export const ZERO_WEEK_MIX: WeekMix = {
	run: 0,
	walk: 0,
	bike: 0,
	strength: 0
};

const MAX_SLOTS = 14;

/** Usual week until the user saves their own skeleton. */
export const DEFAULT_WEEK_PATTERN: WeekPattern = [
	{ day: 'Tuesday', activity_type: 'run', constraint: 'preference' },
	{ day: 'Wednesday', activity_type: 'bike', constraint: 'preference' },
	{ day: 'Thursday', activity_type: 'strength', constraint: 'preference' },
	{ day: 'Friday', activity_type: 'run', constraint: 'preference' },
	{ day: 'Sunday', activity_type: 'run', constraint: 'preference' }
];

function compactNotes(raw: string | undefined): string | undefined {
	const notes = raw?.replace(/\s+/g, ' ').trim().slice(0, MAX_SLOT_NOTES);
	return notes || undefined;
}

export function compactSlot(slot: WeekSlot): WeekSlot {
	const notes = compactNotes(slot.notes);
	return {
		day: slot.day,
		activity_type: slot.activity_type,
		constraint: slot.constraint ?? 'preference',
		...(notes ? { notes } : {})
	};
}

/** Pinned = fixed or optional; both keep their day in the week JSON. */
export function isPinnedSlot(slot: WeekSlot): boolean {
	return slot.constraint === 'fixed' || slot.constraint === 'optional';
}

export function clonePattern(pattern: WeekPattern): WeekPattern {
	return pattern.map(compactSlot);
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
	return aa.every((s, i) => {
		const t = bb[i]!;
		return (
			s.day === t.day &&
			s.activity_type === t.activity_type &&
			(s.constraint ?? 'preference') === (t.constraint ?? 'preference') &&
			(s.notes ?? '') === (t.notes ?? '')
		);
	});
}

const PREFERRED_DAYS: Record<ActivityType, Weekday[]> = {
	run: ['Tuesday', 'Friday', 'Sunday', 'Thursday', 'Monday', 'Saturday', 'Wednesday'],
	bike: ['Wednesday', 'Saturday', 'Monday', 'Thursday', 'Tuesday', 'Friday', 'Sunday'],
	strength: ['Thursday', 'Monday', 'Wednesday', 'Tuesday', 'Friday', 'Saturday', 'Sunday'],
	walk: ['Saturday', 'Monday', 'Wednesday', 'Thursday', 'Friday', 'Sunday', 'Tuesday']
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
	const rawType = typeof o.activity_type === 'string' ? o.activity_type : 'run';
	const compact = rawType.trim().toLowerCase().replace(/[\s_-]/g, '');
	if (['swim', 'swimming', 'openwaterswim', 'lapswimming'].includes(compact)) return null;
	return compactSlot({
		day,
		activity_type: normalizeActivityType(rawType),
		constraint: normalizeConstraint(o),
		notes: typeof o.notes === 'string' ? o.notes : undefined
	});
}

function normalizeConstraint(o: Record<string, unknown>): WeekSlotConstraint {
	const raw = o.constraint ?? o.flag;
	const compact = String(raw ?? '')
		.trim()
		.toLowerCase()
		.replace(/[\s_-]/g, '');
	if (['fixed', 'pinned', 'locked', 'cantchange', 'cannotchange', 'unchangeable'].includes(compact)) {
		return 'fixed';
	}
	if (['optional', 'opt', 'skipok'].includes(compact)) return 'optional';
	if (o.optional === true || o.optional === 'true') return 'optional';
	if (o.fixed === true || o.locked === true || o.fixed === 'true' || o.locked === 'true') {
		return 'fixed';
	}
	return 'preference';
}

export function slotConstraintLabel(constraint?: WeekSlotConstraint | null): string {
	if (constraint === 'fixed') return 'Pinned';
	if (constraint === 'optional') return 'Optional';
	return 'Preference';
}

function slotConstraintPhrase(constraint?: WeekSlotConstraint | null): string {
	if (constraint === 'fixed') return 'pinned';
	if (constraint === 'optional') return 'pinned, optional';
	return 'preference';
}

function formatSlotFlags(s: WeekSlot): string {
	const flag = slotConstraintPhrase(s.constraint);
	const notes = s.notes?.trim();
	return notes ? ` — ${flag}: ${notes}` : ` — ${flag}`;
}

function normalizeDayLimitKind(raw: unknown): DayLimitKind | null {
	const compact = String(raw ?? '')
		.trim()
		.toLowerCase()
		.replace(/[\s_-]/g, '');
	if (['off', 'unavailable', 'blocked', 'none', 'rest'].includes(compact)) return 'off';
	if (['limited', 'partial', 'limit'].includes(compact)) return 'limited';
	return null;
}

/** One limit per weekday (first wins). A `limited` day without a note says nothing, so it is dropped. */
export function normalizeDayLimits(raw: unknown): DayLimit[] {
	if (!Array.isArray(raw)) return [];
	const seen = new Set<Weekday>();
	const out: DayLimit[] = [];
	for (const item of raw) {
		if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
		const o = item as Record<string, unknown>;
		const day = normalizeWeekday(o.day);
		const kind = normalizeDayLimitKind(o.kind);
		if (!day || !kind || seen.has(day)) continue;
		const notes = compactNotes(typeof o.notes === 'string' ? o.notes : undefined);
		if (kind === 'limited' && !notes) continue;
		seen.add(day);
		out.push({ day, kind, ...(notes ? { notes } : {}) });
	}
	return out.sort((a, b) => weekdayIndex(a.day) - weekdayIndex(b.day));
}

export function dayLimitsEqual(a: DayLimit[], b: DayLimit[]): boolean {
	const aa = normalizeDayLimits(a);
	const bb = normalizeDayLimits(b);
	if (aa.length !== bb.length) return false;
	return aa.every((l, i) => {
		const m = bb[i]!;
		return l.day === m.day && l.kind === m.kind && (l.notes ?? '') === (m.notes ?? '');
	});
}

/** Sports in the pattern plus run, in canonical order — used when nothing was saved yet. */
export function defaultPlannedSports(pattern: WeekPattern): ActivityType[] {
	const set = new Set<ActivityType>(['run', ...pattern.map((s) => s.activity_type)]);
	return ACTIVITY_TYPES.filter((t) => set.has(t));
}

export function normalizePlannedSports(raw: unknown, fallback: ActivityType[]): ActivityType[] {
	if (!Array.isArray(raw)) return [...fallback];
	const set = new Set(
		raw
			.filter((v): v is string => typeof v === 'string')
			.map((v) => v.trim().toLowerCase())
			.filter((v): v is ActivityType => (ACTIVITY_TYPES as string[]).includes(v))
	);
	return ACTIVITY_TYPES.filter((t) => set.has(t));
}

export function normalizeWeekSetup(raw: unknown): WeekSetup {
	const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
	const pattern = normalizeWeekPattern(o.pattern);
	return {
		pattern,
		dayLimits: normalizeDayLimits(o.dayLimits),
		plannedSports: normalizePlannedSports(o.plannedSports, defaultPlannedSports(pattern))
	};
}

export function weekSetupsEqual(a: WeekSetup, b: WeekSetup): boolean {
	return (
		patternsEqual(a.pattern, b.pattern) &&
		dayLimitsEqual(a.dayLimits, b.dayLimits) &&
		a.plannedSports.length === b.plannedSports.length &&
		a.plannedSports.every((t) => b.plannedSports.includes(t))
	);
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

function listJoin(items: string[]): string {
	if (items.length <= 1) return items.join('');
	return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function sportWord(t: ActivityType): string {
	return activityLabel(t).toLowerCase();
}

/** One-line summary, e.g. "Coach plans run and strength around 2 pinned bikes; Monday off". */
export function formatWeekSetupProse(setup: WeekSetup): string {
	const planned = setup.plannedSports.map(sportWord);
	const head = planned.length ? `Coach plans ${listJoin(planned)}` : 'Coach plans no extra sports';
	const pinned = setup.pattern.filter(isPinnedSlot);
	const pinnedBits = ACTIVITY_TYPES.map((t) => {
		const n = pinned.filter((s) => s.activity_type === t).length;
		return n ? activityCount(n, t).replace(/^(\d+) /, '$1 pinned ') : '';
	}).filter(Boolean);
	const parts = [pinnedBits.length ? `${head} around ${listJoin(pinnedBits)}` : head];
	const off = setup.dayLimits.filter((l) => l.kind === 'off').map((l) => l.day);
	const limited = setup.dayLimits.filter((l) => l.kind === 'limited').map((l) => l.day);
	if (off.length) parts.push(`${listJoin(off)} off`);
	if (limited.length) parts.push(`${listJoin(limited)} limited`);
	const prefs = setup.pattern.length - pinned.length;
	if (prefs) parts.push(`${prefs} preference${prefs === 1 ? '' : 's'}`);
	return parts.join('; ');
}

export function formatPatternLines(pattern: WeekPattern): string {
	if (!pattern.length) return '- (none)';
	return sortPattern(pattern)
		.map((s) => `- ${s.day} — ${activityLabel(s.activity_type)}${formatSlotFlags(s)}`)
		.join('\n');
}

export function formatDayLimitLines(limits: DayLimit[]): string {
	if (!limits.length) return '- (none — every day is available)';
	return normalizeDayLimits(limits)
		.map((l) => {
			const notes = l.notes?.trim();
			if (l.kind === 'off') return `- ${l.day}: off — no sessions${notes ? ` (${notes})` : ''}`;
			return `- ${l.day}: limited — ${notes}`;
		})
		.join('\n');
}

function exampleDistance(type: ActivityType, index: number, total: number): number | null {
	if (type === 'strength') return null;
	if (type === 'run') {
		if (total >= 2 && index === total - 1) return 12;
		if (index === 1) return 8;
		return 6;
	}
	if (type === 'bike') return 25;
	if (type === 'walk') return 5;
	return 6;
}

function exampleRunWorkout(index: number, total: number): Record<string, unknown> {
	if (total >= 2 && index === total - 1) {
		return {
			type: 'long',
			blocks: [{ kind: 'run', distance_km: 12, pace: '6:40', effort: 'easy' }]
		};
	}
	if (index === 1) {
		return {
			type: 'interval',
			blocks: [
				{ kind: 'warmup', distance_km: 2, effort: 'easy' },
				{
					repeat: 5,
					steps: [
						{ kind: 'run', distance_km: 0.8, pace: '4:50', effort: 'interval' },
						{ kind: 'recovery', mode: 'walk', time: '2:00', effort: 'recovery' }
					]
				},
				{ kind: 'cooldown', distance_km: 1.5, effort: 'easy' }
			]
		};
	}
	return {
		type: 'easy',
		blocks: [{ kind: 'run', distance_km: 6, pace: '6:30', effort: 'easy' }]
	};
}

function exampleDetail(type: ActivityType, s: WeekSlot | null): string {
	const notes = s?.notes?.trim();
	const lock =
		s == null
			? 'how many sessions and which days are up to you — add or remove rows like this'
			: s.constraint === 'fixed'
				? 'pinned — keep this day; fit the session to the note'
				: s.constraint === 'optional'
					? 'pinned, optional — keep it; skip only if the note or conditions require it'
					: 'preference — keep it if it fits; move, swap, or drop it if that serves the goal, and say why';
	const base =
		type === 'strength'
			? `YOU CHOOSE — start with minutes, then RPE/rest/tempo. Put the lift list in \`exercises\`, not here; ${lock}`
			: type === 'run'
				? `YOU CHOOSE — short intent only; the steps go in \`workout\`; ${lock}`
				: `YOU CHOOSE — intent; ${lock}`;
	return notes ? `${base}. Note: ${notes}` : base;
}

const PLACEHOLDER_DAY = 'YOU CHOOSE — a weekday';

/**
 * Illustrative JSON: pinned rows keep their real day; each planned sport gets its preference
 * rows or placeholder rows, so a commute-only setup does not read as a bikes-only week.
 */
export function exampleSessionsForSetup(setup: WeekSetup): Record<string, unknown>[] {
	const rows: { day: string; type: ActivityType; slot: WeekSlot | null }[] = [];
	for (const s of sortPattern(setup.pattern.filter(isPinnedSlot))) {
		rows.push({ day: s.day, type: s.activity_type, slot: s });
	}
	const prefs = sortPattern(setup.pattern.filter((s) => !isPinnedSlot(s)));
	for (const t of setup.plannedSports) {
		const own = prefs.filter((s) => s.activity_type === t);
		if (own.length) {
			for (const s of own) rows.push({ day: s.day, type: t, slot: s });
		} else {
			const n = t === 'run' ? 2 : 1;
			for (let i = 0; i < n; i++) rows.push({ day: PLACEHOLDER_DAY, type: t, slot: null });
		}
	}
	const seen: Partial<Record<ActivityType, number>> = {};
	const totals: Partial<Record<ActivityType, number>> = {};
	for (const r of rows) totals[r.type] = (totals[r.type] ?? 0) + 1;
	return rows.map(({ day, type, slot }) => {
		const i = seen[type] ?? 0;
		seen[type] = i + 1;
		const total = totals[type] ?? 1;
		return {
			day,
			activity_type: type,
			label: 'YOU CHOOSE',
			distance_km: exampleDistance(type, i, total),
			detail: exampleDetail(type, slot),
			...(type === 'run' ? { workout: exampleRunWorkout(i, total) } : {}),
			...(type === 'strength'
				? {
						exercises: [
							{ name: 'YOU CHOOSE — usual lift from Recent strength', sets: 3, reps: 8 }
						]
					}
				: {})
		};
	});
}

/** How to fill strength rows in the week JSON — duration lives in `detail`, lifts in `exercises`. */
export const STRENGTH_SESSION_PROMPT =
	'For every **strength** session: `"distance_km"` is null. `"label"` is the gym kind (Full body, Lower, Upper, Push, Pull, Posterior, Hypertrophy, Strength, Circuit, Core — never a bare "Gym"). `"detail"` is what I read on the board: start with **how long** (`20 min.`), then **how heavy** (RPE and/or kg from Recent strength), then **how fast** (rest, tempo, straight sets vs circuit). Do **not** hide the lift list in `detail`. Upcoming gym work **must** include `"exercises"`: `{"name","sets"}` plus `"reps"` (per set) or `"sec"` (timed hold). Optional `"kg"` only when Recent strength has a number — omit rather than invent. Optional `"note"` for cues (single-leg, slow eccentric). Example: `{"day":"Thursday","activity_type":"strength","label":"Full body","distance_km":null,"detail":"50 min. RPE 6–7, 90s rest, straight sets, controlled tempo.","exercises":[{"name":"Goblet squat","sets":3,"reps":8},{"name":"seated row","sets":3,"reps":10,"kg":45},{"name":"plank","sets":2,"sec":45}]}`';

/** How to fill run rows — one `workout` shape for every run type, built from blocks. */
export const RUN_SESSION_PROMPT =
	'For every upcoming **run** session add `"workout"`: `{"type","blocks"}`. One shape for every kind of run — only `type` changes: easy, recovery, long, tempo, interval, fartlek, progression, hills, race. `blocks` is a list where each block is a **step** or a **repeat**. A step is `{"kind","distance_km" | "time","pace" and/or "effort"}`: `kind` is warmup / run / recovery / cooldown; exactly one of `"distance_km"` (number) or `"time"` (`"MM:SS"`); `"pace"` is always min/km as `"M:SS"` or a range `"M:SS-M:SS"` (no unit text); `"effort"` is one of recovery / easy / steady / tempo / threshold / interval / race — give pace, effort, or both. Optional `"mode": "walk"` for a walked recovery or cooldown, optional `"note"` for a cue. A repeat is `{"repeat": N, "steps": [step, …]}` — the steps are done N times in order (e.g. rep + recovery). Leave out any pre-run walk or bike warmup — the workout starts at the first running step. Keep `"detail"` to a short intent line; do not repeat the steps there. `"distance_km"` on the session is the total when every step has a distance. Examples: easy `{"type":"easy","blocks":[{"kind":"run","distance_km":10,"pace":"6:30","effort":"easy"}]}`; intervals `{"type":"interval","blocks":[{"kind":"warmup","distance_km":2,"effort":"easy"},{"repeat":6,"steps":[{"kind":"run","distance_km":0.8,"pace":"4:50","effort":"interval"},{"kind":"recovery","mode":"walk","time":"2:00","effort":"recovery"}]},{"kind":"cooldown","distance_km":1.5,"pace":"6:45","effort":"easy"}]}`; tempo `{"type":"tempo","blocks":[{"kind":"warmup","distance_km":2,"effort":"easy"},{"kind":"run","time":"20:00","pace":"5:15-5:25","effort":"tempo"},{"kind":"cooldown","distance_km":2,"effort":"easy"}]}`. Long runs and races are usually one `run` step (or a few for a progression / race segments).';

export const SLOT_CONSTRAINT_PROMPT =
	'A **pinned** activity is a life constraint (commute, appointment). Keep its day and sport. Do not skip, move, shorten, or slow it in a way that would break the note — for example a commute that makes me late if I go slower. Still invent `label`, distance, and `detail` that fit (and `exercises` for strength). A **pinned, optional** activity stays in the JSON; prefer keeping it, and only set `"status": "skipped"` if weather, recovery, or the note make it a bad idea — say why in prose. Writing "skipped" in `detail` does not skip the session. A **preference** is a soft wish: keep it when it fits, but you may move, swap, or drop it if that serves the goal — say why. Per-activity notes are ground truth for that session; fold them into `detail` when they affect how it is done.';

export const DAY_LIMIT_PROMPT =
	'**Day limits** are hard: put no sessions on an **off** day (pinned activities are the only exception). On a **limited** day, any session you place must fit the note (time window, max duration). Move a session to another day rather than break a limit.';

export const PLANNING_GUARDRAILS_PROMPT =
	'Build load gradually: add at most one session per sport compared with my recent weeks, and grow long sessions step by step. Follow the injury rules. No back-to-back hard days. In prose, explain how many sessions of each sport you chose and why, and any change from my preferences.';

function sportLine(t: ActivityType): string {
	return t === 'strength' ? 'Strength' : activityLabel(t);
}

/** The "build around my pinned activities" block for the generate prompt. */
export function formatWeekSetupPromptSection(opts: {
	setup: WeekSetup;
	defaultSetup: WeekSetup;
	weekPhrase: string;
	/** Sports seen in the history window — the ones I do but did not ask to plan count as load only. */
	recentSports: ActivityType[];
	note?: string;
}): string {
	const { setup, weekPhrase } = opts;
	const pinned = setup.pattern.filter(isPinnedSlot);
	const prefs = setup.pattern.filter((s) => !isPinnedSlot(s));
	const planned = setup.plannedSports;
	const pinnedSports = new Set(pinned.map((s) => s.activity_type));
	const notPlanned = ACTIVITY_TYPES.filter(
		(t) => !planned.includes(t) && (opts.recentSports.includes(t) || pinnedSports.has(t))
	);

	const lines = [
		`## Build ${weekPhrase} around my pinned activities`,
		`Build my week around my pinned activities and day limits. Plan only the sports listed under **Sports to plan**.${
			weekSetupsEqual(setup, opts.defaultSetup) ? '' : ` (I changed my usual setup for ${weekPhrase}.)`
		}`,
		'',
		'### Pinned activities',
		formatPatternLines(pinned),
		'',
		'### Day limits',
		formatDayLimitLines(setup.dayLimits),
		'',
		'### Sports to plan',
		planned.length
			? `${listJoin(planned.map(sportLine))}. You choose **how many** sessions of each, **which days**, the session kind (\`label\`: Easy, Quality, Long, tempo, easy spin, endurance ride; for strength: Full body, Lower, Upper, Push, Pull, Hypertrophy, Strength, Circuit, Core — never a bare "Gym"), distance (null for strength), and intent — from my goal, the training phase, recovery, and how often I actually did each sport in the history below. Do not default to a fixed template. Runs get their warmup / reps / cooldown in \`workout\`. Strength has no duration field — put time, load, and rest in \`detail\`, and the lift list in \`exercises\`.`
			: '(none) — only fill in my pinned activities; do not add sessions.'
	];
	if (notPlanned.length) {
		lines.push(
			'',
			'### Not planned — count the load only',
			...notPlanned.map((t) =>
				pinnedSports.has(t)
					? `- ${sportLine(t)}: only my pinned sessions — do not add more. Count any extra ${sportWord(t)} load from the history.`
					: `- ${sportLine(t)}: I do these on my own. Do not schedule them, but count their load from the history.`
			)
		);
	}
	if (prefs.length) {
		lines.push('', '### Preferences', formatPatternLines(prefs));
	}
	lines.push(
		'',
		'### Rules',
		SLOT_CONSTRAINT_PROMPT,
		DAY_LIMIT_PROMPT,
		PLANNING_GUARDRAILS_PROMPT,
		RUN_SESSION_PROMPT,
		STRENGTH_SESSION_PROMPT,
		'Logged extras that did not match a plan session appear under **Unplanned activities** when there are any. They are already done — extra load, not rows to tidy into the JSON. Notes below are for extras that have not happened yet (or that I am considering). You may add sessions for those proposed extras if you recommend them — say why.'
	);
	if (opts.note?.trim()) {
		lines.push(`Extra for ${weekPhrase}: ${opts.note.trim()}`);
	}
	return lines.join('\n');
}

/** Compact setup block for the debrief prompt — what may and may not move. */
export function formatWeekSetupDebriefSection(setup: WeekSetup, opts: { includeSlots: boolean }): string {
	const pinned = setup.pattern.filter(isPinnedSlot);
	const lines = [
		'## Pinned activities and day limits',
		'Pinned:',
		formatPatternLines(pinned),
		'Day limits:',
		formatDayLimitLines(setup.dayLimits)
	];
	if (opts.includeSlots) {
		const prefs = setup.pattern.filter((s) => !isPinnedSlot(s));
		lines.push(
			`Sports the coach plans: ${setup.plannedSports.length ? listJoin(setup.plannedSports.map(sportWord)) : '(none)'}.`
		);
		if (prefs.length) lines.push('Preferences:', formatPatternLines(prefs));
	}
	lines.push(SLOT_CONSTRAINT_PROMPT, DAY_LIMIT_PROMPT);
	return lines.join('\n');
}

export function sessionActivityType(session: {
	activity_type?: string | null;
	label?: string;
}): ActivityType {
	return normalizeActivityType(session.activity_type ?? 'run');
}

export const MAX_WEEK_SLOTS = MAX_SLOTS;
