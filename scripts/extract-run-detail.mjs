import fs from 'node:fs';

const srcPath = 'scripts/runs-full.bak.tsx';
const src = fs.readFileSync(srcPath, 'utf8').split(/\r?\n/);
if (src[0].includes('\0')) {
	throw new Error(`${srcPath} looks binary — regenerate with git show`);
}
const slice = (a, b) => src.slice(a - 1, b).join('\n');

const importLines = [
	...src.slice(0, 41),
	...src.slice(44, 60)
]
	.join('\n')
	.replace(/\.\.\/components\//g, '../');

const routeApi = `import { getRouteApi } from '@tanstack/react-router';
const runDetailRoute = getRouteApi('/runs/$slug');
`;

let runDetail = slice(306, src.length)
	.replace(/Route\.useLoaderData\(\)/g, 'runDetailRoute.useLoaderData()')
	.replace(/Route\.useSearch\(\)/g, 'runDetailRoute.useSearch()')
	.replace(/^function RunDetail/, 'export function RunDetail');

const runImports = `${importLines}
const RouteMap = lazy(() =>
	import('../RouteMap').then((m) => ({ default: m.RouteMap }))
);
import { InlineText } from './InlineText';
import { FeelTile } from './FeelTile';
import { routeIdFrom } from './route-id';
`;

fs.mkdirSync('src/components/run-detail', { recursive: true });

fs.writeFileSync(
	'src/components/run-detail/route-id.ts',
	`export function routeIdFrom(route: string, stravaId: string): string {
	const fromRoute = route.trim().split(/[\\\\/]/).pop();
	const id = (fromRoute ?? '').replace(/\\?.*$/, '').replace(/\\.json$/i, '');
	return id || stravaId || '';
}
`
);

fs.writeFileSync(
	'src/components/run-detail/RunDetail.tsx',
	runImports + '\n' + routeApi + '\n' + runDetail + '\n'
);

const slim = `import { loadRunDetail } from '$lib/run-detail/loader';
import { activityTitlePart, appHead } from '$lib/title';
import { createFileRoute } from '@tanstack/react-router';
import { RunDetail } from '../components/run-detail/RunDetail';

type RunSearch = { edit?: boolean };

export const Route = createFileRoute('/runs/$slug')({
	validateSearch: (s: Record<string, unknown>): RunSearch => ({
		edit: s.edit === true || s.edit === 'true' || s.edit === '1' ? true : undefined
	}),
	loader: async ({ params }) => loadRunDetail(params.slug),
	head: ({ loaderData }) =>
		appHead(loaderData ? activityTitlePart(loaderData.run) : null, 'Timeline'),
	component: RunDetail
});
`;

fs.writeFileSync('src/routes/runs.$slug.tsx', slim);
console.log('run detail extracted from', srcPath);
