import fs from 'node:fs';

const src = fs.readFileSync('src/routes/goals.tsx', 'utf8').split(/\r?\n/);
const slice = (a, b) => src.slice(a - 1, b).join('\n');

const importBlock = slice(1, 39).replace(/\.\.\/components\//g, '../');
const routeApi = `import { getRouteApi } from '@tanstack/react-router';
const goalsRoute = getRouteApi('/goals');
`;

const typesBlock = `type GoalsTab = 'races' | 'medals';
type GoalsSearch = { tab?: GoalsTab };

type OpenGoalDialog =
	| { variant: 'race'; mode: 'add' }
	| { variant: 'race'; mode: 'edit'; goal: Goal }
	| { variant: 'lookahead'; mode: 'add' }
	| { variant: 'lookahead'; mode: 'edit'; goal: Goal };

type GoalsData = Awaited<ReturnType<typeof getGoalsData>>;
`;

let body = slice(66, src.length)
	.replace(/Route\.useLoaderData\(\)/g, 'goalsRoute.useLoaderData()')
	.replace(/Route\.useSearch\(\)/g, 'goalsRoute.useSearch()')
	.replace(/^function goalSummaryLine/, 'export function goalSummaryLine')
	.replace(/^function GoalUrlLinks/, 'export function GoalUrlLinks')
	.replace(/^function GoalsPage/, 'export function GoalsPage');

fs.mkdirSync('src/components/goals', { recursive: true });
fs.writeFileSync(
	'src/components/goals/GoalsPage.tsx',
	importBlock +
		'\n' +
		"import { getGoalsData } from '$lib/server/functions';\n" +
		typesBlock +
		'\n' +
		routeApi +
		'\n' +
		body +
		'\n'
);

const slim = `import { getGoalsData } from '$lib/server/functions';
import { appHead } from '$lib/title';
import { createFileRoute } from '@tanstack/react-router';
import { GoalsPage } from '../components/goals/GoalsPage';

type GoalsTab = 'races' | 'medals';
type GoalsSearch = { tab?: GoalsTab };

function parseTab(v: unknown): GoalsTab {
	return v === 'medals' ? 'medals' : 'races';
}

export const Route = createFileRoute('/goals')({
	validateSearch: (s: Record<string, unknown>): GoalsSearch => ({
		tab: parseTab(s.tab)
	}),
	loaderDeps: () => ({}),
	loader: () => ({ page: getGoalsData() }),
	head: () => appHead('Goals'),
	component: GoalsPage
});
`;

fs.writeFileSync('src/routes/goals.tsx', slim);
console.log('goals extracted');
