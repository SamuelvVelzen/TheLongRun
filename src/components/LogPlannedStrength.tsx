import { normalizeActivityType } from '$lib/activity';
import { isoDateLocal } from '$lib/plan';
import { strengthLogFromPlan } from '$lib/strength';
import { Link } from '@tanstack/react-router';
import { Icon } from './Icon';

export type StrengthLogSession = {
	activity_type?: string;
	date: string | null;
	detail: string;
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

export function plannedStrengthLogSearch(session: StrengthLogSession) {
	const log = strengthLogFromPlan(session.detail);
	return {
		mode: 'manual' as const,
		type: 'strength' as const,
		date: session.date || undefined,
		time: log.time || undefined,
		notes: log.notes || undefined
	};
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
