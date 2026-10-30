import { gearFilterApplies, gearKindsForSport, runsMatchingSport } from '$lib/activity-filter-scope';
import {
	GEAR_FILTER_CHIP_MAX,
	GEAR_FILTER_NONE,
	gearFilterIsAll,
	gearFilterIsNone,
	gearFilterOptions,
	gearOptionLabel,
	gearSummaryLabel,
	selectedGearTokens,
	type GearFilterOption
} from '$lib/gear-filter';
import type { GearContext } from '$lib/gear';
import { cn } from '$lib/ui';
import { useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { filterSegButtonClass, filterSegToggleClass, filterSegWrapClass } from './filter-seg-classes';
import { FilterRow } from './FilterRow';
import { Icon } from './Icon';
import { Select } from './ui';

type GearRun = { activity_type: string; gear?: string };

function toggleGearToken(current: string, token: string): string | undefined {
	if (gearFilterIsNone(current)) {
		return token;
	}
	if (gearFilterIsAll(current)) {
		return token;
	}
	const selected = selectedGearTokens(current);
	const next = selected.includes(token)
		? selected.filter((t) => t !== token)
		: [...selected, token];
	return next.length ? next.join(',') : undefined;
}

function gearSelectOptions(
	gear: string,
	options: GearFilterOption[]
): { value: string; label: string }[] {
	const selected = selectedGearTokens(gear);
	return [
		{ value: 'all', label: 'All gear' },
		{ value: GEAR_FILTER_NONE, label: 'No gear' },
		...(selected.length > 1
			? [{ value: gear, label: gearSummaryLabel(gear, options) }]
			: []),
		...options
			.filter((o) => selected.length <= 1 || !selected.includes(o.token))
			.map((o) => ({ value: o.token, label: gearOptionLabel(o) }))
	];
}

function GearSelect({
	gear,
	to,
	options,
	className
}: {
	gear: string;
	to: string;
	options: GearFilterOption[];
	className?: string;
}) {
	const navigate = useNavigate();
	const selected = selectedGearTokens(gear);
	const selectValue = gearFilterIsNone(gear)
		? GEAR_FILTER_NONE
		: gearFilterIsAll(gear)
			? 'all'
			: selected.length === 1
				? selected[0]
				: selected.length > 1
					? gear
					: 'all';

	return (
		<Select
			className={className}
			size="compact"
			appearance="filter"
			value={selectValue}
			aria-label="Gear"
			onChange={(next) =>
				navigate({
					to,
					replace: true,
					resetScroll: false,
					search: (prev) => ({
						...prev,
						gear:
							next === 'all'
								? undefined
								: next === GEAR_FILTER_NONE
									? GEAR_FILTER_NONE
									: next
					})
				})
			}
			options={gearSelectOptions(gear, options)}
		/>
	);
}

function GearChipStrip({
	gear,
	to,
	options
}: {
	gear: string;
	to: string;
	options: GearFilterOption[];
}) {
	const navigate = useNavigate();
	const selected = selectedGearTokens(gear);
	const allOn = gearFilterIsAll(gear);
	const noneOn = gearFilterIsNone(gear);

	const setGear = (next: string | undefined) => {
		const prev = gearFilterIsAll(gear) ? undefined : gear;
		if (next === prev) return;
		navigate({
			to,
			search: (prevSearch) => ({
				...prevSearch,
				gear: next
			}),
			replace: true,
			resetScroll: false
		});
	};

	return (
		<div className={filterSegToggleClass} role="group" aria-label="Gear">
			<button
				type="button"
				className={filterSegButtonClass}
				aria-pressed={allOn}
				onClick={() => setGear(undefined)}
			>
				All gear
			</button>
			<button
				type="button"
				className={filterSegButtonClass}
				aria-pressed={noneOn}
				onClick={() => setGear(GEAR_FILTER_NONE)}
			>
				No gear
			</button>
			{options.map((opt) => {
				const pressed = selected.includes(opt.token);
				const title = gearOptionLabel(opt);
				return (
					<button
						key={opt.token}
						type="button"
						className={cn(filterSegButtonClass, 'max-w-[min(100%,14rem)] sm:max-w-[14rem]')}
						aria-pressed={pressed}
						title={title}
						onClick={() => {
							const next = toggleGearToken(gear, opt.token);
							setGear(next);
						}}
					>
						<span className="truncate min-w-0">{opt.name}</span>
					</button>
				);
			})}
		</div>
	);
}

/**
 * Gear logged on activities — chips when ≤5 names, otherwise a select.
 */
export function GearFilter({
	gear,
	sport,
	to,
	runs,
	gearContext
}: {
	gear: string;
	sport: string;
	to: string;
	runs: GearRun[];
	gearContext: GearContext;
}) {
	const allowedKinds = gearKindsForSport(sport);
	const scoped = useMemo(() => runsMatchingSport(runs, sport), [runs, sport]);
	const options = useMemo(
		() => gearFilterOptions(scoped, gearContext, allowedKinds),
		[scoped, gearContext, allowedKinds]
	);

	if (!gearFilterApplies(sport) || options.length === 0) return null;

	const useSelect = options.length > GEAR_FILTER_CHIP_MAX;

	if (useSelect) {
		return (
			<FilterRow label="Gear" icon={<Icon name="shoe" size={14} />}>
				<GearSelect gear={gear} to={to} options={options} />
			</FilterRow>
		);
	}

	return (
		<FilterRow label="Gear" icon={<Icon name="shoe" size={14} />}>
			<div className={filterSegWrapClass}>
				<GearChipStrip gear={gear} to={to} options={options} />
			</div>
		</FilterRow>
	);
}
