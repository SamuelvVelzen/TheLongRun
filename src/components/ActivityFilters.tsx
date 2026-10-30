import type { DateRange } from '$lib/date-range';
import {
	activityFiltersActive,
	clearActivityFilterSearch,
	gearKindsForSport,
	runsMatchingSport
} from '$lib/activity-filter-scope';
import { hasFeel } from '$lib/feel';
import { gearFilterOptions } from '$lib/gear-filter';
import type { GearContext } from '$lib/gear';
import type { RunRecord } from '$lib/types';
import { useNavigate } from '@tanstack/react-router';
import { useMemo, type ReactNode } from 'react';
import { DateRangeFilter } from './DateRangeFilter';
import { FeelFilter } from './FeelFilter';
import { FilterRow } from './FilterRow';
import { FilterSheet, filterSummary } from './ui';
import { GearFilter } from './GearFilter';
import { Icon } from './Icon';
import { MapFilter } from './MapFilter';
import { PlaceFilter } from './PlaceFilter';
import { SessionFilter } from './SessionFilter';
import { SportFilter } from './SportFilter';

type FilterRun = Pick<
	RunRecord,
	| 'country'
	| 'province'
	| 'place'
	| 'session'
	| 'gear'
	| 'activity_type'
	| 'effort'
	| 'body_scores'
	| 'legs'
	| 'energy'
	| 'wanted_faster'
	| 'surface'
	| 'notes'
> & { has_map?: boolean };

export function ActivityFilters({
	to,
	sport,
	range,
	runs,
	country,
	province,
	place,
	session,
	map,
	feel,
	gear,
	gearContext,
	availableSports,
	actions
}: {
	to: string;
	sport: string;
	range: DateRange;
	runs: FilterRun[];
	country: string;
	province: string;
	place: string;
	session: string;
	map: string;
	feel: string;
	gear: string;
	gearContext: GearContext;
	availableSports?: Set<string>;
	actions?: ReactNode;
}) {
	const navigate = useNavigate();
	const scoped = useMemo(() => runsMatchingSport(runs, sport), [runs, sport]);
	const gearOptions = useMemo(
		() => gearFilterOptions(scoped, gearContext, gearKindsForSport(sport)),
		[scoped, gearContext, sport]
	);

	const filtersActive = activityFiltersActive({
		sport,
		rangeKind: range.kind,
		session,
		map,
		feel,
		gear,
		country,
		province,
		place
	});

	const clearFilters = () => {
		navigate({
			to,
			replace: true,
			resetScroll: false,
			search: clearActivityFilterSearch()
		});
	};

	return (
		<FilterSheet
			summary={filterSummary(
				sport,
				range,
				{ country, province, place },
				{ session, map, feel, gear, gearOptions }
			)}
			filtersActive={filtersActive}
			onClearFilters={clearFilters}
			actions={actions}
		>
			<FilterRow label="Activity" icon={<Icon name="run" size={14} />}>
				<SportFilter sport={sport} to={to} defaultSport="all" available={availableSports} />
			</FilterRow>
			<FilterRow label="When" icon={<Icon name="calendar" size={14} />}>
				<DateRangeFilter range={range} to={to} />
			</FilterRow>
			<SessionFilter session={session} sport={sport} to={to} runs={runs} />
			<MapFilter map={map} sport={sport} to={to} runs={runs} />
			<FeelFilter
				feel={feel}
				sport={sport}
				to={to}
				runs={runs}
				hasFeelForRun={(r) => hasFeel(r as RunRecord)}
			/>
			<GearFilter gear={gear} sport={sport} to={to} runs={runs} gearContext={gearContext} />
			<PlaceFilter to={to} runs={runs} country={country} province={province} place={place} />
		</FilterSheet>
	);
}

/** Message when the current filter set matches nothing. */
export function activityFilterEmptyMessage(summary: string): string {
	return `Nothing matches your filters (${summary}).`;
}
