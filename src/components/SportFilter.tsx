import { Link } from '@tanstack/react-router';
import type { ActivityType } from '$lib/activity';

const OPTIONS: { value: 'all' | ActivityType; label: string }[] = [
	{ value: 'run', label: 'Run' },
	{ value: 'walk', label: 'Walk' },
	{ value: 'ride', label: 'Ride' },
	{ value: 'swim', label: 'Swim' },
	{ value: 'all', label: 'All' }
];

/** Activity-type toggle. The `defaultSport` option maps to no `sport` param. */
export function SportFilter({
	sport,
	to,
	defaultSport = 'run'
}: {
	sport: string;
	to: string;
	defaultSport?: string;
}) {
	return (
		<div className="range-filter" role="group" aria-label="Activity type">
			<div className="range-presets">
				{OPTIONS.map((o) => (
					<Link
						key={o.value}
						to={to}
						search={(prev: Record<string, unknown>) => ({
							...prev,
							sport: o.value === defaultSport ? undefined : o.value
						})}
						className={`range-chip${sport === o.value ? ' active' : ''}`}
						aria-current={sport === o.value ? 'page' : undefined}
					>
						{o.label}
					</Link>
				))}
			</div>
		</div>
	);
}
