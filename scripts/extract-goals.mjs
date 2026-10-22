import fs from 'node:fs';

const src = fs.readFileSync('src/routes/goals.tsx', 'utf8').split(/\r?\n/);
const slice = (a, b) => src.slice(a - 1, b).join('\n');

const importBlock = slice(1, 39)
	.replace(/\.\.\/components\//g, '../')
	.replace(
		/import \{([^}]+)\} from '@tanstack\/react-router';/,
		(_, names) =>
			`import { getRouteApi, ${names.trim().replace(/^createFileRoute,\s*/, '')} } from '@tanstack/react-router';`
	);

const routeApi = `const goalsRoute = getRouteApi('/goals');
`;

const typesBlock = `type GoalsTab = 'races' | 'medals';
type GoalsSearch = { tab?: GoalsTab };

type OpenGoalDialog =
	| { variant: 'race'; mode: 'add' }
	| { variant: 'race'; mode: 'edit'; goal: Goal }
	| { variant: 'lookahead'; mode: 'add' }
	| { variant: 'lookahead'; mode: 'edit'; goal: Goal };

type GoalsData = Awaited<ReturnType<typeof getGoalsData>>;

function parseTab(v: unknown): GoalsTab {
	return v === 'medals' ? 'medals' : 'races';
}

`;

let body = slice(66, src.length)
	.replace(/Route\.useLoaderData\(\)/g, 'goalsRoute.useLoaderData()')
	.replace(/Route\.useSearch\(\)/g, 'goalsRoute.useSearch()')
	.replace(/^function goalSummaryLine/, 'export function goalSummaryLine')
	.replace(/^function GoalUrlLinks/, 'export function GoalUrlLinks')
	.replace(/^function parseTab[\s\S]*?\n\}\n\n/, '')
	.replace(/^function GoalsPage/, 'export function GoalsPage');

fs.mkdirSync('src/components/goals', { recursive: true });
fs.writeFileSync(
	'src/components/goals/GoalsPage.tsx',
	importBlock + '\n' + typesBlock + routeApi + '\n' + body + '\n'
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
