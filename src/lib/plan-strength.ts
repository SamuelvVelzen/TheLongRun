/**
 * Display helpers for structured strength plans (`PlanSession.exercises`).
 */
import type { PlanStrengthExercise } from '$lib/plan-schema';

export type PlanStrengthLine = { text: string; depth: 0 | 1 };

function exerciseShort(ex: PlanStrengthExercise): string {
	const n = ex.sets;
	if (ex.sec != null) return `${ex.name} ${n}×${ex.sec}s`;
	const reps = ex.reps ?? 0;
	if (ex.kg != null) return `${ex.name} ${n}×${reps} @ ${ex.kg} kg`;
	return `${ex.name} ${n}×${reps}`;
}

/** One line for the board, e.g. `Calf raises 3×18 · Plank 2×60s`. */
export function planStrengthSummary(exercises: PlanStrengthExercise[]): string {
	return exercises.map(exerciseShort).join(' · ');
}

/** Full lift list for the expanded details toggle. */
export function planStrengthLines(exercises: PlanStrengthExercise[]): PlanStrengthLine[] {
	return exercises.map((ex) => {
		let text = exerciseShort(ex);
		if (ex.note?.trim()) text += ` — ${ex.note.trim()}`;
		return { text, depth: 0 };
	});
}
