import { FUEL_OUTCOME_META, FUEL_PHASE_META, type FuelEntry, type FuelOutcome } from '$lib/fuel';
import { cn } from '$lib/ui';
import type { ReactNode } from 'react';
import { statusPillClass } from './ui';

const OUTCOME_TONE: Record<FuelOutcome, string> = {
	good: 'bg-accent/15 text-accent-fg',
	mixed: 'text-muted border border-line',
	bad: 'bg-warn/10 text-warn'
};

export function FuelOutcomePill({ outcome }: { outcome: FuelOutcome }) {
	return <span className={statusPillClass(OUTCOME_TONE[outcome])}>{FUEL_OUTCOME_META[outcome].label}</span>;
}

/** One try: item (optional) · phase (optional) · timing, outcome pill, note underneath. */
export function FuelTryLine({
	entry,
	showItem = false,
	showPhase = false,
	meta,
	actions
}: {
	entry: FuelEntry;
	showItem?: boolean;
	showPhase?: boolean;
	meta?: ReactNode;
	actions?: ReactNode;
}) {
	const head = [
		showPhase ? FUEL_PHASE_META[entry.phase].label : null,
		showItem ? entry.item : null,
		entry.timing || 'timing not noted'
	]
		.filter(Boolean)
		.join(' · ');
	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 border-b border-line last:border-b-0">
			<div className="flex-1 min-w-40">
				<div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
					<span className={cn(showItem && 'font-semibold')}>{head}</span>
					<FuelOutcomePill outcome={entry.outcome} />
				</div>
				{entry.notes || meta ? (
					<p className={cn('text-muted', 'm-0 mt-1 text-[0.82rem]')}>
						{entry.notes}
						{entry.notes && meta ? ' · ' : null}
						{meta}
					</p>
				) : null}
			</div>
			{actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
		</div>
	);
}
