import { useNavigate } from '@tanstack/react-router';
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
 * (falls back to "all"). `available` (when given) hides sports that have no activities at all.
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
	const navigate = useNavigate();
	const options = OPTIONS.filter((o) => o.value === 'all' || !available || available.has(o.value));

	return (
		<div className="range-filter" role="group" aria-label="Activity type">
			<div className="range-presets">
				{options.map((o) => {
					const active = sport === o.value;
					// Clicking the active chip deselects → all; otherwise select the chip.
					const target = active ? 'all' : o.value;
					return (
						<button
							key={o.value}
							type="button"
							className={`range-chip${active ? ' active' : ''}`}
							aria-pressed={active}
							onClick={() =>
								navigate({
									to,
									search: (prev: Record<string, unknown>) => ({
										...prev,
										sport: target === defaultSport ? undefined : target
									})
								})
							}
						>
							{o.label}
						</button>
					);
				})}
			</div>
		</div>
	);
}
