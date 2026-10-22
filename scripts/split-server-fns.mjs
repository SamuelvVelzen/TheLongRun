/**
 * Split src/lib/server/functions.ts into fns/<domain>.ts (imports + shared helpers + domain exports).
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const srcPath = path.join(root, 'src/lib/server/functions.ts');
const src = fs.readFileSync(srcPath, 'utf8');

const readsMarker = '// ---------- reads ----------';
const importEnd = src.indexOf(readsMarker);
if (importEnd < 0) throw new Error('Missing reads marker');
const importsOnly = src.slice(0, importEnd).trimEnd();

const exportRe = /^export (const \w+|type \w+)/gm;
const matches = [...src.matchAll(exportRe)];
const blocks = [];
for (let i = 0; i < matches.length; i++) {
	const start = matches[i].index;
	const end = i + 1 < matches.length ? matches[i + 1].index : src.length;
	blocks.push(src.slice(start, end).trimEnd());
}

const domainMap = {
	getAuthState: 'auth',
	getLiveLocation: 'live-location',
	pingLiveLocation: 'live-location',
	stopLiveLocation: 'live-location',
	getDashboardData: 'dashboard',
	getPlanPeekData: 'dashboard',
	PlanPeekData: 'dashboard',
	getCoachPlan: 'coach',
	getCoachBrief: 'coach',
	getWeekPattern: 'coach',
	saveWeekPattern: 'coach',
	savePlanWeeks: 'coach',
	getTimelineRuns: 'runs',
	getRunDetail: 'runs',
	saveHrMax: 'misc',
	getLogDefaults: 'misc',
	getRouteGeoJsonFn: 'misc',
	getWeather: 'misc',
	getGearData: 'gear',
	getDebriefPrompt: 'debrief',
	DebriefRaceHint: 'debrief',
	saveActivityFeel: 'debrief',
	ActivityFeelInput: 'debrief',
	createRun: 'runs',
	importGpx: 'runs',
	repairRunGps: 'runs',
	previewGpsNetwork: 'runs',
	CreateRunInput: 'runs',
	UpdateRunInput: 'runs',
	updateRun: 'runs',
	deleteRun: 'runs',
	deleteRunsFn: 'runs',
	getGroupDetail: 'groups',
	createActivityGroupFn: 'groups',
	addToActivityGroupFn: 'groups',
	removeFromActivityGroupFn: 'groups',
	ungroupActivitiesFn: 'groups',
	exportGroupedActivity: 'groups',
	exportActivitiesFn: 'groups',
	saveDebrief: 'debrief',
	getProfileData: 'profile',
	saveBodyNotes: 'profile',
	saveCoachNotes: 'profile',
	applyBodySuggestions: 'profile',
	getFeelingsPrompt: 'profile',
	saveFeelings: 'profile',
	saveGear: 'gear',
	saveWardrobe: 'gear',
	saveActivityHabits: 'gear',
	getFuelData: 'fuel',
	saveFuelLog: 'fuel',
	addFuelEntries: 'fuel',
	renameFuelItem: 'fuel',
	saveFuelReply: 'fuel',
	getGoalBrief: 'goals',
	GoalBriefDraft: 'goals',
	getGoalsData: 'goals',
	saveMedalDetails: 'goals',
	saveActiveGoal: 'goals',
	repinGoalResult: 'goals',
	completeGoal: 'goals',
	clearGoal: 'goals',
	getPlannedRoutesData: 'planned-routes',
	getPlannedRouteDetail: 'planned-routes',
	importPlannedRoute: 'planned-routes',
	createPlannedRoute: 'planned-routes',
	updatePlannedRoute: 'planned-routes',
	deletePlannedRoute: 'planned-routes',
	setPlanSessionSkipped: 'planned-routes',
	attachPlannedRoute: 'planned-routes',
	detachPlannedRoute: 'planned-routes'
};

function domainOf(body) {
	const m = body.match(/export (?:const|type) (\w+)/);
	return domainMap[m?.[1] ?? ''] ?? 'misc';
}

const byDomain = new Map();
for (const b of blocks) {
	const d = domainOf(b);
	if (!byDomain.has(d)) byDomain.set(d, []);
	byDomain.get(d).push(b);
}

const firstExport = matches[0].index;
const helpers = src.slice(importEnd, firstExport).trim();

const fnsDir = path.join(root, 'src/lib/server/fns');
fs.mkdirSync(fnsDir, { recursive: true });

for (const [domain, bodies] of byDomain) {
	let content = `${importsOnly}\n\n${helpers}\n\n${bodies.join('\n\n')}\n`;
	content = content.replaceAll("from './", "from '../");
	content = content.replaceAll("import('./", "import('../");
	fs.writeFileSync(path.join(fnsDir, `${domain}.ts`), content);
}

const barrel = [...byDomain.keys()]
	.sort()
	.map((d) => `export * from './fns/${d}';`)
	.join('\n');
fs.copyFileSync(srcPath, `${srcPath}.pre-split.bak`);
fs.writeFileSync(srcPath, `${barrel}\n`);

console.log(`Split ${byDomain.size} domains; helpers ${helpers.length} chars`);
