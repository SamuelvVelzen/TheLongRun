/**
 * zod schemas for AI-returned plan weeks: sessions, strength `exercises`, run `workout` blocks.
 * Pasted JSON is normalized lightly (units, numeric strings, compact sets) then checked strictly.
 */
import { z } from 'zod';
import { normalizeActivityType } from '$lib/activity';
import { formatDuration, parseDurationSeconds } from '$lib/format';
import { workoutTotalKm } from '$lib/run-workout';

export const RUN_EFFORTS = [
	'recovery',
	'easy',
	'steady',
	'tempo',
	'threshold',
	'interval',
	'race'
] as const;
export type RunEffort = (typeof RUN_EFFORTS)[number];

export const RUN_WORKOUT_TYPES = [
	'easy',
	'recovery',
	'long',
	'tempo',
	'interval',
	'fartlek',
	'progression',
	'hills',
	'race'
] as const;
export type RunWorkoutType = (typeof RUN_WORKOUT_TYPES)[number];

export const RUN_STEP_KINDS = ['warmup', 'run', 'recovery', 'cooldown'] as const;
export type RunStepKind = (typeof RUN_STEP_KINDS)[number];

const WEEKDAYS = [
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday',
	'Sunday'
] as const;

const MAX_STRENGTH_SETS = 8;
const PACE_RE = /^\d{1,2}:[0-5]\d(?:-\d{1,2}:[0-5]\d)?$/;
const TIME_RE = /^(?:\d+:)?\d{1,2}:[0-5]\d$/;
const NUMBER_RE = /^\d+(?:\.\d+)?$/;

function blankToUndefined(v: unknown): unknown {
	if (v == null) return undefined;
	if (typeof v === 'string' && !v.trim()) return undefined;
	return v;
}

/** Missing, `null` and `""` all mean "not set". */
function opt<T extends z.ZodType>(schema: T) {
	return z.preprocess(blankToUndefined, schema.optional());
}

function toNumber(v: unknown): unknown {
	if (typeof v !== 'string') return v;
	const s = v.trim();
	return NUMBER_RE.test(s) ? Number(s) : v;
}

function lower(v: unknown): unknown {
	return typeof v === 'string' ? v.trim().toLowerCase() : v;
}

function minutesToClock(min: number): string {
	const total = Math.round(min * 60);
	return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** `"0.8"`, `"0.8 km"`, `"800m"` → km. */
function toKm(v: unknown): unknown {
	if (typeof v !== 'string') return v;
	const s = v.trim().toLowerCase();
	const km = s.match(/^(\d+(?:\.\d+)?)\s*(?:km)?$/);
	if (km) return Number(km[1]);
	const m = s.match(/^(\d+(?:\.\d+)?)\s*m$/);
	if (m) return Number(m[1]) / 1000;
	return v;
}

/** Pace is always min/km: `"6:30/km"`, `"6:30 min/km"`, `6`, `6.5` → `"6:30"`. Ranges keep both ends. */
function normalizePace(v: unknown): unknown {
	if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? minutesToClock(v) : v;
	if (typeof v !== 'string') return v;
	const s = v
		.trim()
		.replace(/\s*(?:min(?:utes?)?\s*)?(?:\/|per)\s*km$/i, '')
		.trim();
	const parts = s.split(/\s*[-–]\s*/);
	if (parts.length > 2) return v;
	return parts.map((p) => (NUMBER_RE.test(p) ? minutesToClock(Number(p)) : p)).join('-');
}

/** `"6:00"`, `"06:00"`, `6` (minutes), `"6 min"`, `"90s"` → canonical `M:SS` / `H:MM:SS`. */
function normalizeTime(v: unknown): unknown {
	if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? minutesToClock(v) : v;
	if (typeof v !== 'string') return v;
	const s = v.trim().toLowerCase();
	const min = s.match(/^(\d+(?:\.\d+)?)\s*(?:min(?:ute)?s?)?$/);
	if (min) return minutesToClock(Number(min[1]));
	const sec = s.match(/^(\d+)\s*(?:s|secs?|seconds?)$/);
	if (sec) return formatDuration(Number(sec[1]));
	if (TIME_RE.test(s)) {
		const total = parseDurationSeconds(s);
		return total ? formatDuration(total) : v;
	}
	return v;
}

function normalizeWeekday(v: unknown): unknown {
	if (typeof v !== 'string') return v;
	const s = v.trim().toLowerCase();
	return (
		WEEKDAYS.find((d) => d.toLowerCase() === s || d.slice(0, 3).toLowerCase() === s) ?? v
	);
}

function isSkipped(v: unknown): boolean {
	return typeof v === 'string' && v.trim().toLowerCase() === 'skipped';
}

export const runStepSchema = z
	.object({
		kind: z.preprocess(lower, z.enum(RUN_STEP_KINDS)),
		mode: opt(z.preprocess(lower, z.enum(['run', 'walk']))),
		distance_km: opt(z.preprocess(toKm, z.number().positive().max(100))),
		time: opt(
			z.preprocess(
				normalizeTime,
				z.string().regex(TIME_RE, 'time must be "MM:SS" or "H:MM:SS"')
			)
		),
		pace: opt(
			z.preprocess(
				normalizePace,
				z.string().regex(PACE_RE, 'pace must be "M:SS" min/km or a "M:SS-M:SS" range')
			)
		),
		effort: opt(z.preprocess(lower, z.enum(RUN_EFFORTS))),
		note: opt(z.string().trim().max(200))
	})
	.superRefine((s, ctx) => {
		if ((s.distance_km == null) === (s.time == null)) {
			ctx.addIssue({
				code: 'custom',
				message: 'needs exactly one of "distance_km" or "time"',
				path: ['distance_km']
			});
		}
		if (s.pace == null && s.effort == null) {
			ctx.addIssue({
				code: 'custom',
				message: 'needs "pace" and/or "effort"',
				path: ['pace']
			});
		}
	});

export const runRepeatSchema = z.object({
	repeat: z.preprocess(toNumber, z.number().int().min(2).max(30)),
	steps: z.array(runStepSchema).min(1).max(6)
});

export type RunStep = z.output<typeof runStepSchema>;
export type RunRepeat = z.output<typeof runRepeatSchema>;
export type RunBlock = RunStep | RunRepeat;

/** Dispatch on `repeat` so errors point at the right fields instead of a vague union miss. */
const runBlockSchema = z.unknown().transform((v, ctx): RunBlock => {
	const isRepeat = Boolean(v) && typeof v === 'object' && 'repeat' in (v as object);
	const parsed = (isRepeat ? runRepeatSchema : runStepSchema).safeParse(v);
	if (parsed.success) return parsed.data;
	for (const issue of parsed.error.issues) {
		ctx.addIssue({ code: 'custom', message: issue.message, path: issue.path as PropertyKey[] });
	}
	return z.NEVER;
});

export const runWorkoutSchema = z.object({
	type: z.preprocess(lower, z.enum(RUN_WORKOUT_TYPES)),
	blocks: z.array(runBlockSchema).min(1).max(12)
});

export type RunWorkout = z.output<typeof runWorkoutSchema>;

/** Accepts `{sets:3,reps:30}`, compact `"3x30"` / `"3x90s"`, and `weight` / `seconds` aliases. */
function normalizeStrengthInput(v: unknown): unknown {
	if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
	const o = { ...(v as Record<string, unknown>) };
	if (o.kg == null && o.weight != null) o.kg = o.weight;
	if (o.sec == null && o.seconds != null) o.sec = o.seconds;
	delete o.weight;
	delete o.seconds;
	if (typeof o.sets === 'string') {
		const s = o.sets.trim();
		const timed = s.match(/^(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*s(?:ecs?|econds?)?$/i);
		const reps = s.match(/^(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)$/i);
		if (timed) {
			o.sets = Number(timed[1]);
			o.sec ??= Number(timed[2]);
		} else if (reps) {
			o.sets = Number(reps[1]);
			o.reps ??= Number(reps[2]);
		}
	}
	return o;
}

export const planStrengthExerciseSchema = z
	.preprocess(
		normalizeStrengthInput,
		z.object({
			name: z.string().trim().min(1, 'needs a "name"'),
			sets: z.preprocess(
				toNumber,
				z
					.number()
					.positive()
					.transform((n) => Math.min(MAX_STRENGTH_SETS, Math.max(1, Math.round(n))))
			),
			reps: opt(z.preprocess(toNumber, z.number().positive())),
			sec: opt(z.preprocess(toNumber, z.number().positive())),
			kg: opt(z.preprocess(toNumber, z.number().positive())),
			note: opt(z.string().trim())
		})
	)
	.superRefine((e, ctx) => {
		if (e.reps == null && e.sec == null) {
			ctx.addIssue({ code: 'custom', message: 'needs "reps" or "sec"', path: ['reps'] });
		}
	})
	.transform((e) => ({
		name: e.name,
		sets: e.sets,
		...(e.sec != null ? { sec: e.sec } : { reps: e.reps! }),
		...(e.kg != null ? { kg: e.kg } : {}),
		...(e.note ? { note: e.note } : {})
	}));

export type PlanStrengthExercise = {
	name: string;
	sets: number;
	reps?: number;
	kg?: number | null;
	sec?: number;
	note?: string;
};

export const planSessionSchema = z
	.object({
		day: z.preprocess(
			normalizeWeekday,
			z.enum(WEEKDAYS, { message: 'day must be a weekday (Monday … Sunday)' })
		),
		label: z.string().trim().min(1, 'needs a "label"'),
		activity_type: opt(z.string()),
		distance_km: z.preprocess(
			(v) => blankToUndefined(toKm(v)) ?? null,
			z.number().nonnegative().nullable()
		),
		detail: z.preprocess((v) => v ?? '', z.string()),
		exercises: opt(z.array(planStrengthExerciseSchema)),
		workout: opt(runWorkoutSchema),
		status: z.unknown().optional()
	})
	.superRefine((s, ctx) => {
		if (s.workout && normalizeActivityType(s.activity_type ?? 'run') !== 'run') {
			ctx.addIssue({
				code: 'custom',
				message: '"workout" is only for run sessions',
				path: ['workout']
			});
		}
	})
	.transform((s) => {
		const activity_type = normalizeActivityType(s.activity_type ?? 'run');
		const totalKm = s.workout ? workoutTotalKm(s.workout) : null;
		return {
			day: s.day,
			label: s.label,
			activity_type,
			distance_km: totalKm ?? s.distance_km,
			detail: s.detail.trim(),
			...(s.exercises?.length ? { exercises: s.exercises } : {}),
			...(s.workout ? { workout: s.workout } : {}),
			...(isSkipped(s.status) ? { status: 'skipped' as const } : {})
		};
	});

export const planWeekSchema = z.object({
	week: z.preprocess(toNumber, z.number().int().min(1)),
	dates: z.preprocess((v) => v ?? '', z.string()),
	phase: z.preprocess((v) => v ?? '', z.string()),
	focus: z.preprocess((v) => v ?? '', z.string()),
	sessions: z.array(planSessionSchema)
});

export type ParsedPlanWeek = z.output<typeof planWeekSchema>;

/** Cheap shape check to tell a week object apart from other JSON (debrief replies). */
export function looksLikePlanWeek(v: unknown): boolean {
	return (
		Boolean(v) &&
		typeof v === 'object' &&
		!Array.isArray(v) &&
		'week' in (v as object) &&
		Array.isArray((v as { sessions?: unknown }).sessions)
	);
}

function describeSession(raw: unknown): string {
	if (!raw || typeof raw !== 'object') return '';
	const s = raw as Record<string, unknown>;
	const day = typeof s.day === 'string' ? s.day : '';
	const type = typeof s.activity_type === 'string' ? s.activity_type : 'run';
	const label = typeof s.label === 'string' && s.label.trim() ? ` (${s.label.trim()})` : '';
	return `${day} ${type}${label}`.trim();
}

function formatFieldPath(path: PropertyKey[]): string {
	let out = '';
	for (const p of path) {
		if (typeof p === 'number') out += `[${p}]`;
		else out += out ? `.${String(p)}` : String(p);
	}
	return out;
}

/** Readable zod issues, e.g. `Week 3 · Tuesday run (Intervals) · workout.blocks[1].steps[0].pace: …`. */
export function formatPlanIssues(error: z.ZodError, input: unknown[], max = 8): string {
	const lines = error.issues.slice(0, max).map((issue) => {
		const path = [...issue.path];
		const where: string[] = [];
		const weekIdx = path[0];
		if (typeof weekIdx === 'number') {
			path.shift();
			const week = input[weekIdx] as { week?: unknown; sessions?: unknown[] } | undefined;
			where.push(week?.week != null ? `Week ${String(week.week)}` : `Week #${weekIdx + 1}`);
			if (path[0] === 'sessions' && typeof path[1] === 'number') {
				const raw = Array.isArray(week?.sessions) ? week.sessions[path[1]] : undefined;
				where.push(describeSession(raw) || `session #${path[1] + 1}`);
				path.splice(0, 2);
			}
		}
		const field = formatFieldPath(path);
		return `- ${[...where, field].filter(Boolean).join(' · ')}: ${issue.message}`;
	});
	const more = error.issues.length > max ? `\n- …and ${error.issues.length - max} more` : '';
	return `That plan JSON has problems:\n${lines.join('\n')}${more}`;
}

/** Validate pasted week(s). Throws an Error listing every problem with its location. */
export function parsePlanWeeks(input: unknown): ParsedPlanWeek[] {
	const list = Array.isArray(input) ? input : [input];
	if (!list.length) throw new Error('No plan week found in that JSON.');
	const parsed = z.array(planWeekSchema).safeParse(list);
	if (!parsed.success) throw new Error(formatPlanIssues(parsed.error, list));
	return parsed.data;
}
