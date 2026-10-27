import { getTimelineRuns } from '$lib/server/functions';
import { appHead } from '$lib/title';
import type { RangeKind } from '$lib/date-range';
import { createFileRoute } from '@tanstack/react-router';
import { DeferredData } from '../components/DeferredData';
import { TimelineBody } from '../components/timeline/TimelinePage';
import { parseFeelSearch } from '$lib/feel';
import { parseGearSearch } from '$lib/gear-filter';
import { parseMapSearch } from '../components/MapFilter';
import { parseSessionSearch } from '../components/SessionFilter';
import { parseSportSearch } from '../components/SportFilter';
import type { RangeSearch } from '../components/DateRangeFilter';

type TimelineSearch = RangeSearch & {
	sport?: string;
	session?: string;
	map?: string;
	feel?: string;
	gear?: string;
	country?: string;
	province?: string;
	place?: string;
};

export const Route = createFileRoute('/timeline')({
	validateSearch: (s: Record<string, unknown>): TimelineSearch => ({
		range: (['7d', '30d', 'all', 'custom'] as const).includes(s.range as RangeKind)
			? (s.range as RangeKind)
			: undefined,
		from: typeof s.from === 'string' ? s.from : undefined,
		to: typeof s.to === 'string' ? s.to : undefined,
		sport: parseSportSearch(s.sport),
		session: parseSessionSearch(s.session),
		map: parseMapSearch(s.map),
		feel: parseFeelSearch(s.feel),
		gear: parseGearSearch(s.gear),
		country: typeof s.country === 'string' ? s.country : undefined,
		province: typeof s.province === 'string' ? s.province : undefined,
		place: typeof s.place === 'string' ? s.place : undefined
	}),
	loader: () => ({ page: getTimelineRuns() }),
	head: () => appHead('Timeline'),
	component: Timeline
});

function Timeline() {
	const { page } = Route.useLoaderData();
	return (
		<DeferredData promise={page}>
			{(data) => <TimelineBody allRuns={data.runs} groups={data.groups} gear={data.gear} />}
		</DeferredData>
	);
}
