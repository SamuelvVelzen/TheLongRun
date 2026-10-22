import fs from 'node:fs';

const src = fs.readFileSync('src/routes/timeline.tsx', 'utf8').split(/\r?\n/);
const slice = (a, b) => src.slice(a - 1, b).join('\n');

const importBlock = slice(1, 70).replace(/\.\.\/components\//g, '../');
const routeApi = `import { getRouteApi } from '@tanstack/react-router';
const timelineRoute = getRouteApi('/timeline');
`;

let body = slice(95, src.length)
	.replace(/Route\.useSearch\(\)/g, 'timelineRoute.useSearch()')
	.replace(/^function TimelineBody/, 'export function TimelineBody')
	.replace(/^function Timeline\(\)/m, 'function _removedTimeline()');
// Drop orphaned Timeline wrapper (route file owns it)
body = body.replace(/\nfunction _removedTimeline\(\)[\s\S]*?\n\}\n\n/, '\n');

fs.mkdirSync('src/components/timeline', { recursive: true });
fs.writeFileSync(
	'src/components/timeline/TimelinePage.tsx',
	importBlock + '\n' + routeApi + '\n' + body + '\n'
);

const slim = `import { getTimelineRuns } from '$lib/server/functions';
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
`;

fs.writeFileSync('src/routes/timeline.tsx', slim);
console.log('timeline extracted');
