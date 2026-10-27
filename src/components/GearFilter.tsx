import {
	gearChipHint,
	gearFilterIsAll,
	gearFilterOptions,
	gearOptionsByKind,
	selectedGearTokens
} from '$lib/gear-filter';
import { GEAR_KINDS, gearMeta, type GearContext } from '$lib/gear';
import { cn } from '$lib/ui';
import { useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { segItemClass, segToggleClass } from './ui/SegmentedToggle';

type GearRun = { activity_type: string; gear?: string };

function toggleGearToken(current: string, token: string): string | undefined {
	if (gearFilterIsAll(current)) {
		return token;
	}
	const selected = selectedGearTokens(current);
	const next = selected.includes(token)
		? selected.filter((t) => t !== token)
		: [...selected, token];
	return next.length ? next.join(',') : undefined;
}

/**
 * Gear logged on activities, grouped by sport (Run / Walk / Bike).
 * Chips show inventory role (daily, etc.) when the name is in your gear catalog.
 */
export function GearFilter({
	gear,
	to,
	runs,
	gearContext
}: {
	gear: string;
	to: string;
	runs: GearRun[];
	gearContext: GearContext;
}) {
	const navigate = useNavigate();
	const options = useMemo(() => gearFilterOptions(runs, gearContext), [runs, gearContext]);
	const byKind = useMemo(() => gearOptionsByKind(options), [options]);
	const selected = selectedGearTokens(gear);

	if (options.length === 0) return null;

	return (
		<div className="flex flex-col gap-2 max-sm:w-full shrink-0">
			{GEAR_KINDS.map((kind) => {
				const items = byKind.get(kind);
				if (!items?.length) return null;
				const meta = gearMeta(kind);
				return (
					<div key={kind} className="flex flex-col gap-1 max-sm:w-full">
						<span className="text-[0.78rem] font-semibold text-muted px-0.5">{meta.section}</span>
						<div
							className={cn(
								'inline-flex items-center shrink-0 max-w-full',
								'overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
							)}
						>
							<div
								className={cn(
									segToggleClass,
									'sm:[&_button]:min-h-9 sm:[&_button]:max-w-[14rem] sm:[&_button]:truncate sm:[&_button]:px-2.5 sm:[&_button]:text-[0.82rem]'
								)}
								role="group"
								aria-label={`${meta.section} gear`}
							>
								{items.map((opt) => {
									const pressed = selected.includes(opt.token);
									const hint = gearChipHint(opt);
									const label = hint ? `${opt.name} · ${hint}` : opt.name;
									return (
										<button
											key={opt.token}
											type="button"
											className={segItemClass}
											aria-pressed={pressed}
											title={label}
											onClick={() => {
												const next = toggleGearToken(gear, opt.token);
												const prev = gearFilterIsAll(gear) ? undefined : gear;
												if (next === prev) return;
												navigate({
													to,
													search: (prevSearch: Record<string, unknown>) => ({
														...prevSearch,
														gear: next
													}),
													replace: true,
													resetScroll: false
												});
											}}
										>
											{label}
										</button>
									);
								})}
							</div>
						</div>
					</div>
				);
			})}
		</div>
	);
}
