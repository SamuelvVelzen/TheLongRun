import { formatDuration } from '$lib/format';

export type StrengthKind = 'weighted' | 'reps' | 'time';
export type StrengthSet = { reps: number; kg: number | null; sec: number | null };
export type StrengthExercise = { name: string; sets: StrengthSet[]; kind?: StrengthKind };

// "10x40kg" / "10x40" / "10×40" → reps×kg;
// "15" / "15 reps" → bodyweight reps;
// "45s" / "45 sec" / "45 seconds" → timed hold.
const SET_RE = /^(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(?:kgs?)?$/i;
const TIME_RE = /^(\d+(?:\.\d+)?)\s*(?:s|secs?|seconds?)$/i;
const REPS_RE = /^(\d+(?:\.\d+)?)\s*(?:reps?)?$/i;

export function emptyStrengthSet(): StrengthSet {
	return { reps: 0, kg: null, sec: null };
}

export function inferSetKind(s: StrengthSet): StrengthKind {
	if (s.sec != null) return 'time';
	if (s.kg != null) return 'weighted';
	return 'reps';
}

export function inferExerciseKind(ex: StrengthExercise): StrengthKind {
	if (ex.kind) return ex.kind;
	if (ex.sets.some((s) => s.sec != null)) return 'time';
	if (ex.sets.some((s) => s.kg != null)) return 'weighted';
	if (ex.sets.some((s) => s.reps > 0)) return 'reps';
	return 'weighted';
}

/** Compact token for notes, e.g. `10x40`, `15`, `45s`. */
export function formatSetToken(s: StrengthSet, kind?: StrengthKind): string {
	const k = kind ?? inferSetKind(s);
	if (k === 'time') return `${s.sec ?? 0}s`;
	if (k === 'weighted' && s.kg != null) return `${s.reps}x${s.kg}`;
	return String(s.reps ?? 0);
}

/** Human label for a set, e.g. `10×40kg`, `15`, `45s`. */
export function formatSetDisplay(s: StrengthSet, kind?: StrengthKind): string {
	const k = kind ?? inferSetKind(s);
	if (k === 'time') return `${s.sec ?? 0}s`;
	if (k === 'weighted' && s.kg != null) return `${s.reps}×${s.kg}kg`;
	return String(s.reps ?? 0);
}

export function formatSetTop(s: StrengthSet, kind?: StrengthKind): string {
	const k = kind ?? inferSetKind(s);
	if (k === 'time') return `${s.sec ?? 0}s`;
	if (k === 'weighted' && s.kg != null) return `${s.reps}×${s.kg}kg`;
	return `${s.reps} reps`;
}

function parseSetToken(t: string): StrengthSet | null {
	const weighted = t.match(SET_RE);
	if (weighted) return { reps: Number(weighted[1]), kg: Number(weighted[2]), sec: null };
	const timed = t.match(TIME_RE);
	if (timed) return { reps: 0, kg: null, sec: Number(timed[1]) };
	const reps = t.match(REPS_RE);
	if (reps) return { reps: Number(reps[1]), kg: null, sec: null };
	return null;
}

/**
 * Parse strength notes. Lines like `seated row: 10x40kg, 8x45, 6x50` become structured
 * exercises; `plank: 45s, 60s` is time; `push-ups: 15, 12` is reps. Anything that doesn't
 * match is preserved as free-text `extra`.
 */
export function parseStrengthNotes(text: string | null | undefined): {
	exercises: StrengthExercise[];
	extra: string;
} {
	const exercises: StrengthExercise[] = [];
	const extraLines: string[] = [];
	for (const raw of String(text ?? '').split('\n')) {
		const line = raw.trim();
		if (!line) continue;
		const idx = line.indexOf(':');
		if (idx > 0) {
			const name = line.slice(0, idx).trim();
			const rest = line.slice(idx + 1).trim();
			const sets: StrengthSet[] = [];
			let ok = rest.length > 0;
			for (const tok of rest.split(',')) {
				const t = tok.trim();
				if (!t) continue;
				const parsed = parseSetToken(t);
				if (parsed) {
					sets.push(parsed);
					continue;
				}
				ok = false;
				break;
			}
			if (ok && name && sets.length) {
				exercises.push({ name, sets, kind: inferExerciseKind({ name, sets }) });
				continue;
			}
		}
		extraLines.push(line);
	}
	return { exercises, extra: extraLines.join('\n') };
}

/** Serialize exercises (+ optional free text) back to the notes format. */
export function formatStrengthNotes(exercises: StrengthExercise[], extra = ''): string {
	const ex = exercises
		.filter((e) => e.name.trim() && e.sets.length)
		.map((e) => {
			const kind = inferExerciseKind(e);
			return `${e.name.trim()}: ${e.sets.map((s) => formatSetToken(s, kind)).join(', ')}`;
		})
		.join('\n');
	return [ex, extra.trim()].filter(Boolean).join('\n\n');
}

export function topSet(ex: StrengthExercise): StrengthSet | null {
	if (!ex.sets.length) return null;
	const kind = inferExerciseKind(ex);
	if (kind === 'time') {
		return ex.sets.reduce((b, s) => ((s.sec ?? 0) > (b.sec ?? 0) ? s : b));
	}
	if (kind === 'weighted') {
		const withKg = ex.sets.filter((s) => s.kg != null);
		if (withKg.length) return withKg.reduce((b, s) => ((s.kg ?? 0) > (b.kg ?? 0) ? s : b));
	}
	return ex.sets.reduce((b, s) => (s.reps > b.reps ? s : b));
}

export function exerciseVolume(ex: StrengthExercise): number {
	return ex.sets.reduce((a, s) => a + s.reps * (s.kg ?? 0), 0);
}

export function exerciseTotalLabel(ex: StrengthExercise): string {
	const kind = inferExerciseKind(ex);
	if (kind === 'time') {
		const sec = ex.sets.reduce((a, s) => a + (s.sec ?? 0), 0);
		return sec ? `${sec}s` : '—';
	}
	if (kind === 'weighted') {
		const vol = Math.round(exerciseVolume(ex));
		return vol ? `${vol} kg` : '—';
	}
	const reps = ex.sets.reduce((a, s) => a + s.reps, 0);
	return reps ? `${reps} reps` : '—';
}

/** Compact one-line summary for the coach brief, e.g. "seated row top 6×50kg, vol 1140kg". */
export function strengthSummary(exercises: StrengthExercise[]): string {
	return exercises
		.map((e) => {
			const kind = inferExerciseKind(e);
			if (kind === 'time') {
				const sec = e.sets.reduce((a, s) => a + (s.sec ?? 0), 0);
				return sec ? `${e.name} ${sec}s` : e.name;
			}
			if (kind === 'reps') {
				const reps = e.sets.reduce((a, s) => a + s.reps, 0);
				return reps ? `${e.name} ${reps} reps` : e.name;
			}
			const t = topSet(e);
			if (!t) return e.name;
			if (t.kg != null) {
				const vol = Math.round(exerciseVolume(e));
				return `${e.name} top ${t.reps}×${t.kg}kg${vol ? `, vol ${vol}kg` : ''}`;
			}
			const reps = e.sets.reduce((a, s) => a + s.reps, 0);
			return `${e.name} ${reps} reps`;
		})
		.join('; ');
}

export type StrengthLogLike = {
	date: string;
	time?: string;
	notes?: string | null;
};

function exerciseKey(name: string): string {
	return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Lift book for the generate-plan brief: recent sessions plus the newest top of each lift.
 * `logs` should already be strength-only, newest first.
 */
export function formatStrengthHistoryBrief(
	logs: StrengthLogLike[],
	opts: { maxSessions?: number; maxTopsFrom?: number } = {}
): string {
	const maxSessions = opts.maxSessions ?? 8;
	const maxTopsFrom = opts.maxTopsFrom ?? 20;
	if (!logs.length) return '';

	const lines = [
		'## Recent strength',
		'Use **these lifts and loads** when you prescribe gym sessions. Match the program I actually do — do not invent a different split or machine list. Progress or back off from the tops below given recovery and the rest of the week.'
	];
	for (const r of logs.slice(0, maxSessions)) {
		const parsed = parseStrengthNotes(r.notes);
		const extra = parsed.extra.replace(/\s+/g, ' ').trim().slice(0, 180);
		const body = [strengthSummary(parsed.exercises), extra].filter(Boolean).join(' — ');
		const dur = r.time?.trim() ? ` (${r.time.trim()})` : '';
		lines.push(`- ${r.date}${dur}: ${body || '(no lifts logged)'}`);
	}

	const tops = recentExerciseTops(logs, maxTopsFrom);
	if (tops.length) {
		lines.push('', 'Recent tops (newest log of each lift):');
		for (const t of tops) {
			lines.push(
				`- ${t.name}: ${formatSetTop({ reps: t.reps, kg: t.kg, sec: t.sec }, t.kind)} (${t.date})`
			);
		}
	}
	return lines.join('\n');
}

export type RecentLiftTop = {
	name: string;
	date: string;
	kg: number | null;
	reps: number;
	sec: number | null;
	kind: StrengthKind;
};

export function recentExerciseTops(logs: StrengthLogLike[], maxFrom = 20): RecentLiftTop[] {
	const tops: RecentLiftTop[] = [];
	const seen = new Set<string>();
	for (const r of logs.slice(0, maxFrom)) {
		for (const ex of parseStrengthNotes(r.notes).exercises) {
			const key = exerciseKey(ex.name);
			if (!key || seen.has(key)) continue;
			const t = topSet(ex);
			if (!t) continue;
			seen.add(key);
			tops.push({
				name: ex.name.trim(),
				date: r.date,
				kg: t.kg,
				reps: t.reps,
				sec: t.sec,
				kind: inferExerciseKind(ex)
			});
		}
	}
	return tops;
}

/** Fill missing kg on planned sets from the newest logged top of that lift. */
export function fillStrengthNotesFromTops(notes: string, tops: RecentLiftTop[]): string {
	if (!notes.trim() || !tops.length) return notes;
	const parsed = parseStrengthNotes(notes);
	const byKey = new Map(tops.map((t) => [exerciseKey(t.name), t]));
	let changed = false;
	const exercises = parsed.exercises.map((ex) => {
		if (ex.sets.some((s) => s.kg != null || s.sec != null)) return ex;
		const top = byKey.get(exerciseKey(ex.name));
		if (top?.kg == null) return ex;
		changed = true;
		return {
			...ex,
			kind: 'weighted' as const,
			sets: ex.sets.map((s) => ({ ...s, kg: top.kg }))
		};
	});
	return changed ? formatStrengthNotes(exercises, parsed.extra) : notes;
}

const PLAN_MIN_RE = /^(\d+(?:\.\d+)?)\s*(?:min(?:ute)?s?)\b[.\s,:]*/i;
const PLAN_HOUR_RE =
	/^(\d+)\s*h(?:ours?)?(?:\s*(\d+)\s*m(?:in(?:ute)?s?)?)?\b[.\s,:]*/i;
const PLAN_TRIPLE_RE =
	/^(.+?)\s+(\d+)\s*[x×]\s*(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:kgs?)?$/i;
const PLAN_TIMED_RE =
	/^(.+?)\s+(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*s(?:ecs?|econds?)?$/i;
const PLAN_SETS_RE =
	/^(.+?)\s+(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)(?:\s*(?:at|@)\s*(.+))?$/i;
const PLAN_CUE_RE =
	/^(?:(?:\d+(?:\.\d+)?\s*(?:s|secs?|seconds?)?\s+)?rest(?:s)?|controlled(?:\s+tempo)?|straight sets|not a circuit|not rushed|circuit(?:s)?|warmup|warm-up|cool-?down)$/i;

function stripPlanDuration(detail: string): { minutes: number | null; rest: string } {
	const raw = detail.trim();
	const hour = raw.match(PLAN_HOUR_RE);
	if (hour) {
		const minutes = Number(hour[1]) * 60 + (hour[2] ? Number(hour[2]) : 0);
		return { minutes, rest: raw.slice(hour[0].length).trim() };
	}
	const min = raw.match(PLAN_MIN_RE);
	if (min) return { minutes: Number(min[1]), rest: raw.slice(min[0].length).trim() };
	return { minutes: null, rest: raw };
}

function planClauses(text: string): string[] {
	return text
		.split(/[;•]/)
		.flatMap((part) => part.split(/\.\s+/))
		.flatMap((part) => part.split(','))
		.map((s) => s.replace(/\.+$/, '').trim())
		.filter(Boolean);
}

function parsePlanLoad(raw: string): { kg: number | null; cue: string } {
	const t = raw.trim();
	if (!t) return { kg: null, cue: '' };
	if (/last\s+top|rpe/i.test(t) && !/\d+(?:\.\d+)?\s*(?:kgs?)/i.test(t)) {
		return { kg: null, cue: t };
	}
	const kg = t.match(/(\d+(?:\.\d+)?)\s*(?:kgs?)/i);
	if (kg) {
		const leftover = t.replace(kg[0], '').trim();
		return { kg: Number(kg[1]), cue: leftover };
	}
	if (/^\d+(?:\.\d+)?$/.test(t)) return { kg: Number(t), cue: '' };
	return { kg: null, cue: t };
}

function expandSets(n: number, set: StrengthSet): StrengthExercise['sets'] {
	const count = Math.max(1, Math.min(8, n));
	return Array.from({ length: count }, () => ({ ...set }));
}

function parsePlanClause(clause: string): { exercise: StrengthExercise; cue: string } | 'cue' | null {
	if (PLAN_CUE_RE.test(clause) || (/\brest\b/i.test(clause) && !PLAN_SETS_RE.test(clause))) {
		return 'cue';
	}
	const triple = clause.match(PLAN_TRIPLE_RE);
	if (triple) {
		const n = Number(triple[2]);
		return {
			exercise: {
				name: triple[1]!.trim(),
				kind: 'weighted',
				sets: expandSets(n, { reps: Number(triple[3]), kg: Number(triple[4]), sec: null })
			},
			cue: ''
		};
	}
	const timed = clause.match(PLAN_TIMED_RE);
	if (timed) {
		const n = Number(timed[2]);
		return {
			exercise: {
				name: timed[1]!.trim(),
				kind: 'time',
				sets: expandSets(n, { reps: 0, kg: null, sec: Number(timed[3]) })
			},
			cue: ''
		};
	}
	const sets = clause.match(PLAN_SETS_RE);
	if (sets) {
		const n = Number(sets[2]);
		const load = parsePlanLoad(sets[4] ?? '');
		const weighted = load.kg != null;
		return {
			exercise: {
				name: sets[1]!.trim(),
				kind: weighted ? 'weighted' : 'reps',
				sets: expandSets(n, { reps: Number(sets[3]), kg: load.kg, sec: null })
			},
			cue: load.cue
		};
	}
	return null;
}

/**
 * Turn a planned strength `detail` into a log prefill: duration as `MM:SS` / `H:MM:SS`,
 * and notes in the StrengthEditor format.
 */
export function strengthLogFromPlan(detail: string): { time: string; notes: string } {
	const { minutes, rest } = stripPlanDuration(detail);
	const time = minutes != null && minutes > 0 ? formatDuration(Math.round(minutes * 60)) : '';
	const exercises: StrengthExercise[] = [];
	const extra: string[] = [];
	for (const clause of planClauses(rest)) {
		const parsed = parsePlanClause(clause);
		if (parsed === 'cue') {
			extra.push(clause);
			continue;
		}
		if (parsed) {
			exercises.push(parsed.exercise);
			if (parsed.cue) extra.push(parsed.cue);
			continue;
		}
		extra.push(clause);
	}
	if (!exercises.length && rest) return { time, notes: rest };
	return { time, notes: formatStrengthNotes(exercises, extra.join('. ')) };
}
