import { normalizeActivityType } from '$lib/activity';
import { isoDateLocal } from '$lib/plan';
import { strengthLogFromPlan } from '$lib/strength';
import type { PlanStrengthExercise } from '$lib/types';
import { Link } from '@tanstack/react-router';
import { Icon } from './Icon';

export type StrengthLogSession = {
	activity_type?: string;
	date: string | null;
	detail: string;
	exercises?: PlanStrengthExercise[];
	done?: boolean;
	skipped?: boolean;
};

export function canLogPlannedStrength(
	session: StrengthLogSession,
	today = isoDateLocal(new Date())
): boolean {
	if (normalizeActivityType(session.activity_type) !== 'strength') return false;
	if (session.done || session.skipped) return false;
	if (!session.date || session.date > today) return false;
	return true;
}

export function plannedStrengthLogSearch(session: StrengthLogSession, now = new Date()) {
	const log = strengthLogFromPlan(session.detail, session.exercises);
	const clock =
		String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
	// Log it on the moment the button is pressed, not the planned day — the lift
	// prescription comes from the plan; when it actually happened is "now".
	return {
		mode: 'manual' as const,
		type: 'strength' as const,
		date: isoDateLocal(now),
		start: clock,
		time: log.time || undefined,
		notes: log.notes || undefined
	};
}

export function plannedSessionLogSearch(session: StrengthLogSession) {
	if (normalizeActivityType(session.activity_type) === 'strength') {
		return plannedStrengthLogSearch(session);
	}
	return { mode: 'gpx' as const };
}

export function LogPlannedStrengthLink({
	session,
	className
}: {
	session: StrengthLogSession;
	className?: string;
}) {
	if (!canLogPlannedStrength(session)) return null;
	return (
		<Link
			className={
				className ??
				'inline-flex items-center gap-1 pt-1 text-[0.8rem] font-[650] text-accent-fg hover:underline'
			}
			to="/import"
			search={plannedStrengthLogSearch(session)}
		>
			<Icon name="plus" size={13} />
			Log as planned
		</Link>
	);
}
