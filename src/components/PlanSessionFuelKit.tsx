import {
	formatPlanSessionFuelRow,
	fuelByPhase,
	type PlanSessionFuel
} from '$lib/plan-session-extras';
import { FUEL_PHASES, FUEL_PHASE_META } from '$lib/fuel';
import { cn } from '$lib/ui';

const lineClass = (compact: boolean) =>
	cn(
		'm-0 [overflow-wrap:anywhere]',
		compact ? 'text-[0.84rem] leading-snug text-fg/90' : 'text-[0.9rem] leading-[1.45] text-fg/90'
	);

export function PlanSessionFuelKit({
	fuel,
	kit,
	className,
	compact = false
}: {
	fuel?: PlanSessionFuel[];
	kit?: string;
	className?: string;
	compact?: boolean;
}) {
	const kitLine = kit?.trim();
	if (!fuel?.length && !kitLine) return null;

	const grouped = fuel?.length ? fuelByPhase(fuel) : null;

	return (
		<div className={cn('flex flex-col gap-2 min-w-0', className)}>
			{grouped ? (
				<div className="flex flex-col gap-1.5 min-w-0">
					{FUEL_PHASES.map((phase) => {
						const rows = grouped[phase];
						if (!rows.length) return null;
						return (
							<div key={phase} className="min-w-0">
								<p className="m-0 mb-0.5 text-[0.72rem] font-bold uppercase tracking-[0.05em] text-muted">
									{FUEL_PHASE_META[phase].title}
								</p>
								<ul className="m-0 p-0 list-none flex flex-col gap-0.5">
									{rows.map((row, i) => (
										<li key={i} className={lineClass(compact)}>
											{formatPlanSessionFuelRow(row)}
										</li>
									))}
								</ul>
							</div>
						);
					})}
				</div>
			) : null}
			{kitLine ? (
				<div className="min-w-0">
					<p className="m-0 mb-0.5 text-[0.72rem] font-bold uppercase tracking-[0.05em] text-muted">
						Kit
					</p>
					<p className={lineClass(compact)}>{kitLine}</p>
				</div>
			) : null}
		</div>
	);
}
