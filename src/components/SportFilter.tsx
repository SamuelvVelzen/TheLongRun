import { Link } from '@tanstack/react-router';
import type { ActivityType } from '$lib/activity';

const OPTIONS: { value: 'all' | ActivityType; label: string }[] = [
	{ value: 'all', label: 'All' },
	{ value: 'run', label: 'Run' },
	{ value: 'walk', label: 'Walk' },
	{ value: 'ride', label: 'Ride' },
	{ value: 'swim', label: 'Swim' }
];

/**
 * Activity-type toggle. Starts on `defaultSport`; clicking the active chip deselects it
 * (falls back to "all"). The `defaultSport` value maps to no `sport` param for clean URLs.
 */
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
				{OPTIONS.map((o) => {
					const active = sport === o.value;
					// Clicking the active chip deselects → all; otherwise select the chip.
					const target = active ? 'all' : o.value;
					return (
						<Link
							key={o.value}
							to={to}
							search={(prev: Record<string, unknown>) => ({
								...prev,
								sport: target === defaultSport ? undefined : target
							})}
							className={`range-chip${active ? ' active' : ''}`}
							aria-current={active ? 'page' : undefined}
						>
							{o.label}
						</Link>
					);
				})}
			</div>
		</div>
	);
}
