import fs from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const src = fs.readFileSync(path.join(root, 'src/lib/server/functions.ts'), 'utf8');
const lines = src.split('\n');

function slice(start, end) {
	return lines.slice(start - 1, end).join('\n');
}

const coachBrief = `import {
	activityCount,
	activityLabel,
	metricText,
	normalizeActivityType,
	showsField
} from '$lib/activity';
import { BODY_SAFETY_RULE } from '$lib/body-notes';
import { bodyScoreTracks } from '$lib/body-scores';
import type { DateRange, RangeKind } from '$lib/date-range';
import {
	formatGearKm,
	GEAR_KINDS,
	gearKey,
	gearMeta,
	wearByAllGear,
	type GearCatalog,
	type GearContext,
	type GearKind
} from '$lib/gear';
import { buildHistoryTiers, personalBestsLine, sportVolume } from '$lib/history-brief';
import {
	buildWeekView,
	formatWeekPlanMarkdown,
	planWeekDateRange,
	type PlanCalendar
} from '$lib/plan';
import { feelCell, hrCell } from '$lib/prompt';
import type { PlanWeek, RunRecord } from '$lib/types';
import { parseStrengthNotes, strengthCompact } from '$lib/strength';
import { byDateNewestFirst, isImportNote } from './run-sort';

${slice(663, 781).replace(/^function /gm, 'export function ')}

/** Detailed activity rows default to the last 30 days; older history is summarised in tiers. */
export const DEFAULT_BRIEF_RANGE: RangeKind = '30d';

export const HOW_TO_READ = \`Goal and Timing come from the booked race and calendar I set. Look-aheads are not races — they constrain the horizon, they do not set race day. Every section with numbers (summary, paces, weekly/monthly volume, activity log, lift tops) is auto-computed from my logs and is **current**. Body notes and Notes from me are hand-written by me. \${BODY_SAFETY_RULE}\`;

${slice(799, 858).replace(/^function /gm, 'export function ').replace(/^const BRIEF_TABLE_HEAD/gm, 'export const BRIEF_TABLE_HEAD')}
`;

const debriefBody = slice(1111, 1557)
	.replace(/^function /gm, 'export function ')
	.replace(/^const DEBRIEF_SPLITS/gm, 'export const DEBRIEF')
	.replace(/^type PlannedMatch/gm, 'export type PlannedMatch');

const debriefPrompt = `import {
	activityLabel,
	metricText,
	normalizeActivityType,
	showsFeel,
	showsField
} from '$lib/activity';
import {
	computeBestEffortsFromSplits,
	distanceLabel,
	formatEffortTime,
	supportsBestEfforts
} from '$lib/best-efforts';
import type { DebriefRaceHint } from '$lib/debrief-types';
import {
	debriefUnitLead,
	debriefUnitSlug,
	type DebriefSessionUnit
} from '$lib/debrief-group';
import {
	activityLooksLikeRace,
	canPinRaceResult
} from '$lib/goals';
import { combineRunStats, groupedSessionTitle, groupMembership } from '$lib/group';
import {
	buildWeekView,
	formatUnplannedBrief,
	planWeekDateRange,
	planWeekStartIso,
	weekNumberForDate,
	type PlanCalendar,
	type WeekSessionView
} from '$lib/plan';
import { feelCell, feelScale, joinSections, section, tidyPrompt } from '$lib/prompt';
import { workoutMarkdown, workoutSummary } from '$lib/run-workout';
import type { RouteAnalytics } from '$lib/splits';
import { withEffectiveHrZones } from '$lib/splits';
import type { BodyArea, PlanWeek, RunRecord } from '$lib/types';
import { bodyScoreRows } from '$lib/body-scores';
import { parseStrengthNotes } from '$lib/strength';
import { notesForBriefRow } from './coach-brief';
import { byDateNewestFirst, isImportNote } from './run-sort';

${debriefBody}
`;

fs.writeFileSync(path.join(root, 'src/lib/server/coach-brief.ts'), coachBrief);
fs.writeFileSync(path.join(root, 'src/lib/server/debrief-prompt.ts'), debriefPrompt);
console.log('Wrote coach-brief.ts and debrief-prompt.ts');
