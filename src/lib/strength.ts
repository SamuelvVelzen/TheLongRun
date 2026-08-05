export type StrengthSet = { reps: number; kg: number | null };
export type StrengthExercise = { name: string; sets: StrengthSet[] };

// "10x40kg" / "10x40" / "10×40" → reps×kg;  "15" / "15 reps" → bodyweight reps.
const SET_RE = /^(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(?:kgs?)?$/i;
const REPS_RE = /^(\d+(?:\.\d+)?)\s*(?:reps?)?$/i;

/**
 * Parse strength notes. Lines like `seated row: 10x40kg, 8x45, 6x50` become structured
 * exercises; anything that doesn't match is preserved as free-text `extra`.
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
				const m = t.match(SET_RE);
				if (m) {
					sets.push({ reps: Number(m[1]), kg: Number(m[2]) });
					continue;
				}
				const r = t.match(REPS_RE);
				if (r) {
					sets.push({ reps: Number(r[1]), kg: null });
					continue;
				}
				ok = false;
				break;
			}
			if (ok && name && sets.length) {
				exercises.push({ name, sets });
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
		.map(
			(e) =>
				`${e.name.trim()}: ${e.sets
					.map((s) => (s.kg != null ? `${s.reps}x${s.kg}` : `${s.reps}`))
					.join(', ')}`
		)
		.join('\n');
	return [ex, extra.trim()].filter(Boolean).join('\n\n');
}

export function topSet(ex: StrengthExercise): StrengthSet | null {
	if (!ex.sets.length) return null;
	const withKg = ex.sets.filter((s) => s.kg != null);
	if (withKg.length) return withKg.reduce((b, s) => ((s.kg ?? 0) > (b.kg ?? 0) ? s : b));
	return ex.sets.reduce((b, s) => (s.reps > b.reps ? s : b));
}

export function exerciseVolume(ex: StrengthExercise): number {
	return ex.sets.reduce((a, s) => a + s.reps * (s.kg ?? 0), 0);
}

/** Compact one-line summary for the coach brief, e.g. "seated row top 6×50kg, vol 1140kg". */
export function strengthSummary(exercises: StrengthExercise[]): string {
	return exercises
		.map((e) => {
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
