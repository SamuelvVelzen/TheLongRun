import fs from 'node:fs';

const srcPath = 'scripts/coach-full.bak.tsx';
const coach = fs.readFileSync(srcPath, 'utf8').split(/\r?\n/);
const slice = (a, b) => coach.slice(a - 1, b).join('\n');
const dir = 'src/components/coach';
fs.mkdirSync(dir, { recursive: true });

const importBlock = coach
	.slice(0, 90)
	.join('\n')
	.replace(/\.\.\/components\//g, '../')
	.concat(`
import {
	type CoachTab,
	withCoachSearch
} from '$lib/coach/search';
`);

const routeApi = `import { getRouteApi } from '@tanstack/react-router';
const coachRoute = getRouteApi('/coach');
`;

const utilsImports = `import type { RangeKind } from '$lib/date-range';
import { getCoachPlan, getDebriefPrompt } from '$lib/server/functions';
import type { CoachTab } from '$lib/coach/search';
`;

let utils = slice(104, 170);
utils = utils
	.replace(/^const DEFAULT_BRIEF_RANGE/, 'export const DEFAULT_BRIEF_RANGE')
	.replace(/^function /gm, 'export function ')
	.replace(/^type DebriefPrompt/m, 'export type DebriefPrompt')
	.replace(/^type CoachDebriefUnit/m, 'export type CoachDebriefUnit')
	.replace(/^type CoachPlanData/m, 'export type CoachPlanData');
fs.writeFileSync(`${dir}/coach-utils.ts`, utilsImports + '\n' + utils);

let planPanel = slice(172, 356)
	.replace(/Route\.useSearch\(\)/g, 'coachRoute.useSearch()')
	.replace(/^function PlanWeekPanel/, 'export function PlanWeekPanel');
fs.writeFileSync(
	`${dir}/PlanWeekPanel.tsx`,
	importBlock +
		'\n' +
		routeApi +
		"import type { CoachPlanData } from './coach-utils';\n\n" +
		planPanel
);

let coachPanels = slice(411, 1155)
	.replace(/Route\.useSearch\(\)/g, 'coachRoute.useSearch()')
	.replace(/^function CoachPanels/, 'export function CoachPanels');
fs.writeFileSync(
	`${dir}/CoachPanels.tsx`,
	importBlock +
		'\n' +
		routeApi +
		`import {
	coachDebriefUnits,
	defaultCoachTab,
	defaultQuestion,
	DEFAULT_BRIEF_RANGE,
	type CoachDebriefUnit,
	type CoachPlanData,
	type DebriefPrompt,
	visibleTab,
	weekTag
} from './coach-utils';
import { PlanWeekPanel } from './PlanWeekPanel';
import { GenerateBriefForm } from './GenerateBriefForm';

` +
		coachPanels
);

let genForm = slice(1156, coach.length).replace(
	/^function GenerateBriefForm/,
	'export function GenerateBriefForm'
);
fs.writeFileSync(`${dir}/GenerateBriefForm.tsx`, importBlock + '\n' + genForm);

const slimRoute = `import { appHead } from '$lib/title';
import { loadCoachPage } from '$lib/coach/loader';
import { type CoachSearch, validateCoachSearch } from '$lib/coach/search';
import { createFileRoute } from '@tanstack/react-router';
import { DeferredData } from '../components/DeferredData';
import { PageHero } from '../components/ui';
import { CoachPanels } from '../components/coach/CoachPanels';

export const Route = createFileRoute('/coach')({
	validateSearch: validateCoachSearch,
	loaderDeps: () => ({}),
	loader: ({ location }) => ({
		page: loadCoachPage(location.search as CoachSearch)
	}),
	head: () => appHead('Coach'),
	component: Coach
});

function Coach() {
	const { page } = Route.useLoaderData();

	return (
		<>
			<PageHero variant="quiet" kicker="This week" title="Coach" />

			<DeferredData promise={page}>
				{(data) => (
					<CoachPanels
						debrief={data.debrief}
						initialSetup={data.weekSetup}
						planData={data.planData}
						gear={data.debrief.gear}
						gearWear={data.debrief.gearWear}
					/>
				)}
			</DeferredData>
		</>
	);
}
`;

fs.writeFileSync('src/routes/coach.tsx', slimRoute);
console.log('Extracted coach components from', srcPath);
