import type { DateRange } from '$lib/date-range';
import { hasFeel } from '$lib/feel';
import { gearFilterOptions } from '$lib/gear-filter';
import type { GearContext } from '$lib/gear';
import type { RunRecord } from '$lib/types';
import { useMemo, type ReactNode } from 'react';
import { DateRangeFilter } from './DateRangeFilter';
import { FeelFilter } from './FeelFilter';
import { FilterSheet, filterSummary } from './ui';
import { GearFilter } from './GearFilter';
import { MapFilter } from './MapFilter';
import { PlaceFilter } from './PlaceFilter';
import { normalizeRunSession, SessionFilter } from './SessionFilter';
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
	const availableSessions = new Set(runs.map((r) => normalizeRunSession(r.session)));
	const gearOptions = useMemo(() => gearFilterOptions(runs, gearContext), [runs, gearContext]);

	return (
		<FilterSheet
			summary={filterSummary(
				sport,
				range,
				{ country, province, place },
				{ session, map, feel, gear, gearOptions }
			)}
			actions={actions}
		>
			<div className="inline-flex items-center gap-3 shrink-0 max-sm:contents sm:gap-2">
				<SportFilter sport={sport} to={to} defaultSport="all" available={availableSports} />
				<DateRangeFilter range={range} to={to} />
			</div>
			<SessionFilter session={session} to={to} available={availableSessions} />
			<MapFilter map={map} to={to} runs={runs} />
			<FeelFilter
				feel={feel}
				to={to}
				runs={runs}
				hasFeelForRun={(r) => hasFeel(r as RunRecord)}
			/>
			<GearFilter gear={gear} to={to} runs={runs} gearContext={gearContext} />
			<PlaceFilter to={to} runs={runs} country={country} province={province} place={place} />
		</FilterSheet>
	);
}
