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

	const tops: { name: string; date: string; label: string }[] = [];
	const seen = new Set<string>();
	for (const r of logs.slice(0, maxTopsFrom)) {
		for (const ex of parseStrengthNotes(r.notes).exercises) {
			const key = exerciseKey(ex.name);
			if (!key || seen.has(key)) continue;
			const t = topSet(ex);
			if (!t) continue;
			seen.add(key);
			tops.push({
				name: ex.name.trim(),
				date: r.date,
				label: formatSetTop(t, inferExerciseKind(ex))
			});
		}
	}
	if (tops.length) {
		lines.push('', 'Recent tops (newest log of each lift):');
		for (const t of tops) lines.push(`- ${t.name}: ${t.label} (${t.date})`);
	}
	return lines.join('\n');
}
