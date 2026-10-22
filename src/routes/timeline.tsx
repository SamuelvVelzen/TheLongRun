import { getTimelineRuns } from '$lib/server/functions';
import { appHead } from '$lib/title';
import type { RangeKind } from '$lib/date-range';
import { createFileRoute } from '@tanstack/react-router';
import { DeferredData } from '../components/DeferredData';
import { TimelineBody } from '../components/timeline/TimelinePage';
import { parseSportSearch } from '../components/SportFilter';
import type { RangeSearch } from '../components/DateRangeFilter';

type TimelineSearch = RangeSearch & {
	sport?: string;
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
			{(data) => <TimelineBody allRuns={data.runs} groups={data.groups} />}
		</DeferredData>
	);
}
