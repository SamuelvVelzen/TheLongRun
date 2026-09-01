import {
    ACTIVITY_TYPES,
    activityLabel,
    normalizeActivityType,
    type ActivityType
} from '$lib/activity';
import { ui } from '$lib/ui';
import { useNavigate } from '@tanstack/react-router';
import { sportChipLabel } from './Icon';

const OPTIONS: { value: 'all' | ActivityType; label: string }[] = [
	{ value: 'all', label: 'All' },
	{ value: 'run', label: 'Run' },
	{ value: 'walk', label: 'Walk' },
	{ value: 'ride', label: 'Ride' },
	{ value: 'swim', label: 'Swim' },
	{ value: 'strength', label: 'Strength' }
];

const TYPE_SET = new Set<string>(ACTIVITY_TYPES);

export function selectedSports(sport: string): ActivityType[] {
	if (!sport || sport === 'all') return [];
	return ACTIVITY_TYPES.filter((t) => sport.split(',').includes(t));
}

export function sportIsAll(sport: string): boolean {
	return !sport || sport === 'all';
}

/** Parse `?sport=` — a single type or comma-separated types. Invalid tokens dropped. */
export function parseSportSearch(raw: unknown): string | undefined {
	if (typeof raw !== 'string' || !raw.trim()) return undefined;
	const tokens = new Set(
		raw
			.split(',')
			.map((s) => s.trim().toLowerCase())
			.filter((s) => TYPE_SET.has(s))
	);
	const ordered = ACTIVITY_TYPES.filter((t) => tokens.has(t));
	if (ordered.length === 0) return undefined;
	return ordered.join(',');
}

export function matchesSportFilter(activityType: string, sport: string): boolean {
	const selected = selectedSports(sport);
	if (selected.length === 0) return true;
	return selected.includes(normalizeActivityType(activityType));
}

export function sportSummaryLabel(sport: string): string {
	const selected = selectedSports(sport);
	if (selected.length === 0) return 'All activities';
	if (selected.length === 1) return activityLabel(selected[0]);
	return selected.map((s) => activityLabel(s)).join(' + ');
}

function toggleSport(
	current: string,
	clicked: 'all' | ActivityType,
	defaultSport: string,
	availableTypes: ActivityType[]
): string | undefined {
	let next: string;
	if (clicked === 'all') {
		next = 'all';
	} else if (sportIsAll(current)) {
		next = clicked;
	} else {
		const selected = selectedSports(current);
		const remaining = selected.includes(clicked)
			? selected.filter((s) => s !== clicked)
			: ACTIVITY_TYPES.filter((t) => t === clicked || selected.includes(t));
		next = remaining.length === 0 ? 'all' : remaining.join(',');
	}

	const selectedNow = selectedSports(next);
	if (availableTypes.length > 1 && availableTypes.every((t) => selectedNow.includes(t))) {
		next = 'all';
	}

	return next === defaultSport ? undefined : next;
}

/**
 * Activity-type filter. Starts on `defaultSport`; `available` (when given) hides sports
 * that have no activities at all. Types can be combined (All remains exclusive).
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
	const availableTypes = options
		.map((o) => o.value)
		.filter((v): v is ActivityType => v !== 'all');
	const selected = selectedSports(sport);
	const allSelected = sportIsAll(sport);

	return (
		<div className="contents">
			<div className={ui.segToggle} role="group" aria-label="Activity type">
				{options.map((o) => {
					const pressed =
						o.value === 'all' ? allSelected : selected.includes(o.value as ActivityType);
					return (
						<button
							key={o.value}
							type="button"
							className={ui.segItem}
							aria-pressed={pressed}
							onClick={() => {
								const next = toggleSport(sport, o.value, defaultSport, availableTypes);
								const current = sport === defaultSport ? undefined : sport;
								if (next === current) return;
								navigate({
									to,
									search: (prev: Record<string, unknown>) => ({
										...prev,
										sport: next
									}),
									replace: true,
									resetScroll: false
								});
							}}
						>
							{sportChipLabel(o.value, o.label)}
						</button>
					);
				})}
			</div>
		</div>
	);
}
