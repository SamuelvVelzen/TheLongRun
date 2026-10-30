import { mapFilterApplies, runsMatchingSport } from '$lib/activity-filter-scope';
import { cn } from '$lib/ui';
import { useNavigate } from '@tanstack/react-router';
import { Icon } from './Icon';
import { filterSegButtonClass, filterSegToggleClass, filterSegWrapClass } from './filter-seg-classes';
import { FilterRow } from './FilterRow';

export type MapFilterKind = 'all' | 'mapped' | 'unmapped';

const OPTIONS: { value: MapFilterKind; label: string }[] = [
	{ value: 'all', label: 'All routes' },
	{ value: 'mapped', label: 'GPS' },
	{ value: 'unmapped', label: 'No GPS' }
];

export function parseMapSearch(raw: unknown): MapFilterKind | undefined {
	if (raw === 'mapped' || raw === 'unmapped') return raw;
	return undefined;
}

export function matchesMapFilter(
	hasMap: boolean | undefined,
	map: string,
	sport: string
): boolean {
	if (!mapFilterApplies(sport)) return true;
	if (!map || map === 'all') return true;
	if (map === 'mapped') return !!hasMap;
	if (map === 'unmapped') return !hasMap;
	return true;
}

export function mapFilterActive(map: string): boolean {
	return map === 'mapped' || map === 'unmapped';
}

export function mapSummaryLabel(map: string): string {
	if (map === 'mapped') return 'GPS';
	if (map === 'unmapped') return 'No GPS';
	return 'All routes';
}

type MapRun = { has_map?: boolean; activity_type: string };

/** Shown when scoped activities include both mapped and unmapped GPS routes. */
export function MapFilter({
	map,
	sport,
	to,
	runs,
	defaultMap = 'all'
}: {
	map: string;
	sport: string;
	to: string;
	runs: MapRun[];
	defaultMap?: MapFilterKind;
}) {
	const navigate = useNavigate();
	if (!mapFilterApplies(sport)) return null;
	const scoped = runsMatchingSport(runs, sport);
	const hasMapped = scoped.some((r) => r.has_map);
	const hasUnmapped = scoped.some((r) => !r.has_map);
	if (!hasMapped || !hasUnmapped) return null;

	const current = (map === 'mapped' || map === 'unmapped' ? map : 'all') as MapFilterKind;

	const group = (
		<div className={filterSegWrapClass}>
			<div className={filterSegToggleClass} role="group" aria-label="Route map">
				{OPTIONS.map((o) => (
					<button
						key={o.value}
						type="button"
						className={filterSegButtonClass}
						aria-pressed={current === o.value}
						onClick={() => {
							const next = o.value === defaultMap ? undefined : o.value === 'all' ? undefined : o.value;
							const prev =
								current === defaultMap || current === 'all' ? undefined : current;
							if (next === prev) return;
							navigate({
								to,
								search: (prevSearch: Record<string, unknown>) => ({
									...prevSearch,
									map: next
								}),
								replace: true,
								resetScroll: false
							});
						}}
					>
						{o.label}
					</button>
				))}
			</div>
		</div>
	);

	return (
		<FilterRow label="Routes" icon={<Icon name="map" size={14} />}>
			{group}
		</FilterRow>
	);
}
