import type { ActivityType } from '$lib/activity';
import { sportChipLabel } from './Icon';
import { SegmentedToggle } from './SegmentedToggle';

const OPTIONS: { value: 'all' | ActivityType; label: string }[] = [
	{ value: 'all', label: 'All' },
	{ value: 'run', label: 'Run' },
	{ value: 'walk', label: 'Walk' },
	{ value: 'ride', label: 'Ride' },
	{ value: 'swim', label: 'Swim' },
	{ value: 'strength', label: 'Strength' }
];

/**
 * Activity-type toggle. Starts on `defaultSport`; `available` (when given) hides sports
 * that have no activities at all.
 */
export function SportFilter({
	sport,
	to,
	defaultSport = 'run',
	available
}: {
	sport: string;
	to: string;
	defaultSport?: string;
	available?: Set<string>;
}) {
	const options = OPTIONS.filter((o) => o.value === 'all' || !available || available.has(o.value));

	return (
		<div className="contents">
			<SegmentedToggle
				value={sport}
				aria-label="Activity type"
				options={options.map((o) => ({
					value: o.value,
					label: sportChipLabel(o.value, o.label),
					to,
					search: (prev: Record<string, unknown>) => ({
						...prev,
						sport: o.value === defaultSport ? undefined : o.value
					})
				}))}
			/>
		</div>
	);
}
