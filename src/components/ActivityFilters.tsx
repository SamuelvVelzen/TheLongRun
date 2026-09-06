import type { DateRange } from '$lib/date-range';
import type { ReactNode } from 'react';
import { DateRangeFilter } from './DateRangeFilter';
import { FilterSheet, filterSummary } from './FilterSheet';
import { PlaceFilter } from './PlaceFilter';
import { SportFilter } from './SportFilter';

type PlaceRun = { country?: string; province?: string; place?: string };

export function ActivityFilters({
	to,
	sport,
	range,
	runs,
	country,
	province,
	place,
	availableSports,
	actions
}: {
	to: string;
	sport: string;
	range: DateRange;
	runs: PlaceRun[];
	country: string;
	province: string;
	place: string;
	availableSports?: Set<string>;
	actions?: ReactNode;
}) {
	return (
		<FilterSheet
			summary={filterSummary(sport, range, { country, province, place })}
			actions={actions}
		>
			<SportFilter sport={sport} to={to} defaultSport="all" available={availableSports} />
			<DateRangeFilter range={range} to={to} />
			<PlaceFilter to={to} runs={runs} country={country} province={province} place={place} />
		</FilterSheet>
	);
}
