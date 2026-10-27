import { sessionMeasureLabel, type WeekSessionView } from '$lib/plan';
import { planStrengthSummary } from '$lib/plan-strength';
import { workoutSummary } from '$lib/run-workout';

/** One-line workout prescription for next-up cards (distance, session kind, intervals). */
export function planSessionPrescriptionGlance(session: WeekSessionView): string | null {
	if (session.workout) {
		const measure = sessionMeasureLabel(session);
		const kind = session.label.trim();
		const prescription = workoutSummary(session.workout);
		const head = [measure, kind ? kind.toLowerCase() : ''].filter(Boolean).join(' ');
		return head ? `${head} · ${prescription}` : prescription;
	}
	if (session.exercises?.length) {
		return planStrengthSummary(session.exercises);
	}
	return null;
}
