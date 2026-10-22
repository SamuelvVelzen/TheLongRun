import {
	ACTIVITY_TYPES,
	activityCount,
	activityLabel,
	activityPlural,
	importActivityType,
	metricText,
	resolveImportActivityType,
	normalizeActivityType,
	showsFeel,
	showsField
} from '$lib/activity';
import {
	combinedActivityGpx,
	combinedActivityTcx,
	memberActivityGpx,
	safeFilename
} from '$lib/activity-export';
import {
	formatUsualHabitsSection,
	normalizeActivityHabits,
	withHabitDefaults,
	type ActivityHabits
} from '$lib/activity-habits';
import {
	computeBestEffortsFromSplits,
	computeBestEffortsFromTrack,
	distanceLabel,
	effortsEqual,
	formatEffortTime,
	highlightsForActivity,
	mergeMissingBestEfforts,
	missingEffortKeys,
	supportsBestEfforts,
	type EffortHighlight
} from '$lib/best-efforts';
import { combinedAnalytics, trackFromGeoJson } from '$lib/combine-track';
import {
	dateRangeFromSearch,
	filterRunsByRange,
	type DateRange,
	type RangeKind
} from '$lib/date-range';
import { DEBRIEF_HABITS_TOKEN, DEBRIEF_WRITEUP_TOKEN } from '$lib/debrief';
import { parseLiveRouteSlug } from '$lib/live-location';
import {
	dayFromIsoDate,
	formatDuration,
	guessSession,
	localDateTimeToUtcMs,
	normalizeStartTime,
	parseDurationSeconds
} from '$lib/format';
import {
	formatFuelSection,
	fuelItemNames,
	normalizeFuelEntry,
	normalizeFuelLog,
	renameFuelItemIn,
	type FuelEntry,
	type FuelLog,
	type FuelPhase,
	type FuelRunRef
} from '$lib/fuel';
import { parseFuelReply, parseFuelSuggestions } from '$lib/fuel-schema';
import {
	catalogHasItems,
	formatGearKm,
	GEAR_KINDS,
	gearKey,
	gearKindForActivity,
	gearMeta,
	wearByAllGear,
	type GearCatalog,
	type GearContext,
	type GearKind
} from '$lib/gear';
import {
	formatWardrobeSection,
	normalizeWardrobe,
	wardrobeHasItems,
	type Wardrobe
} from '$lib/wardrobe';
import {
	activityLooksLikeRace,
	canPinRaceResult,
	formatHorizonLabel,
	formatIntentionPromptLine,
	formatLaterRacePromptLine,
	isRaceGoal,
	normalizeGoalInput,
	normalizeGoalUrl,
	openIntentions,
	pickSoonestOpenGoal,
	pinCandidatesForGoal,
	resultFromActivity,
	type GoalInput,
	type MedalDetailsInput
} from '$lib/goals';
import {
	attachHrSeries,
	densifyWaypoints,
	diagnoseGps,
	normalizeTrackPoints,
	normalizeWaypoints,
	samplesFromGeoJson,
	stampAlongDistance,
	trackDistanceMeters
} from '$lib/gps-repair';
import {
	collapseDebriefSessions,
	debriefUnitLead,
	debriefUnitSlug,
	type DebriefSessionUnit
} from '$lib/debrief-group';
import { combineRunStats, groupedSessionTitle, groupMembership, sortGroupMembers } from '$lib/group';
import {
	buildWeekView,
	calendarFromGoal,
	dateForSessionDay,
	daysUntil,
	formatUnplannedBrief,
	formatWeekPlanMarkdown,
	isoDateLocal,
	isRestLike,
	keepSoonestNext,
	mondayIso,
	pickBannerWeekView,
	plannedSessionFor,
	planSessionRouteKey,
	planWeekDateRange,
	planWeekEndIso,
	planWeekIndex,
	planWeekStartIso,
	sessionCanLinkRoute,
	sessionStreak,
	SKIP_STATUS_PROMPT,
	upcomingPlanSessions,
	weekNumberForDate,
	weekToGenerate,
	weekToPlan,
	withSessionRoutes,
	type PlanCalendar,
	type WeekSessionView,
	type WeekView
} from '$lib/plan';
import {
	analyticsFromProperties,
	analyticsToProperties,
	computeRouteAnalytics,
	withEffectiveHrZones,
	type RouteAnalytics
} from '$lib/splits';
import { parseFeelingsReply, parseFeelingsSuggestions } from '$lib/feelings-schema';
import {
	PLAN_SESSION_FUEL_JSON_EXAMPLE,
	PLAN_SESSION_KIT_JSON_EXAMPLE
} from '$lib/plan-session-extras';
import { looksLikePlanWeek, parsePlanWeeks } from '$lib/plan-schema';
import { workoutMarkdown, workoutSummary } from '$lib/run-workout';
import {
	formatLiftTopsBrief,
	parseStrengthNotes,
	recentExerciseTops,
	strengthCompact
} from '$lib/strength';
import {
	BODY_SAFETY_RULE,
	formatBodyNotesSection,
	formatCoachNotesSection,
	mergeBodySuggestions,
	normalizeBodyNotes,
	type BodyNote,
	type BodyNotes
} from '$lib/body-notes';
import {
	bodyScoreTracks,
	mergeBodyScores,
	openBodyAreas,
	bodyScoreRows,
	resolveAiBodyScores,
	validateBodyScores,
	type BodyArea,
	type BodyScore
} from '$lib/body-scores';
import { buildHistoryTiers, personalBestsLine, sportVolume } from '$lib/history-brief';
import { buildPaceProfile, formatPaceSection, typicalEasyPace } from '$lib/pace-profile';
import { feelCell, feelScale, hrCell, joinSections, section, tidyPrompt } from '$lib/prompt';
import type {
	ActivityAttachOption,
	ActivityGroupInfo,
	Goal,
	PlanAttachOption,
	PlannedRoute,
	PlannedRouteActivityLink,
	PlannedRoutePlanLink,
	PlanWeek,
	RouteTrack,
	RunRecord,
	RunWithMap,
	SessionRouteRef
} from '$lib/types';
import {
	DAY_LIMIT_PROMPT,
	exampleSessionsForSetup,
	formatWeekSetupDebriefSection,
	formatWeekSetupPromptSection,
	normalizeWeekSetup,
	PLANNING_GUARDRAILS_PROMPT,
	runSessionPrompt,
	STRENGTH_SESSION_PROMPT,
	type WeekSetup
} from '$lib/week-mix';
import { loadBodyNotes, loadProfile, persistBodyNotes, persistCoachNotes } from '../profile';
import type { ActivityFeelInput, DebriefRaceHint } from '$lib/debrief-types';
import type { GoalBriefDraft } from '$lib/goal-brief';
import type { PlanPeekData } from '$lib/plan-peek';
import type { CreateRunInput, UpdateRunInput } from '$lib/run-input';
import { createServerFn } from '@tanstack/react-start';
import { requireAuth } from '../auth';
import { brouterAlongPins } from '../brouter';
import {
	clearLiveLocation,
	currentPlanWeek,
	loadActivityHabits,
	loadGear,
	loadFuelLog,
	loadGoalStore,
	loadWardrobe,
	loadLiveLocation,
	loadPlan,
	loadSettings,
	loadTrainingContext,
	persistActivityHabits,
	persistFuelLog,
	persistGear,
	persistWardrobe,
	rememberGearName,
	saveGoalStore,
	saveHrMaxSetting,
	saveLiveLocation,
	savePlan,
	saveWeekSetupSetting,
	weekSetupFromSettings
} from '../context';
import { reverseGeocode, timezoneForCoord } from '../geo';
import { parseActivityFile } from '../gpx';
import {
	addActivityToGroup,
	createActivityGroup,
	enrichAllGroupEfforts,
	enrichGroupEfforts,
	getActivityGroup,
	listActivityGroups,
	membershipForRun,
	removeActivityFromGroup,
	tracksForMembers,
	ungroupActivities
} from '../groups';
import {
	attachRouteToActivity as dbAttachRouteToActivity,
	attachRouteToPlan as dbAttachRouteToPlan,
	deletePlannedRoute as dbDeletePlannedRoute,
	detachRouteLink as dbDetachRouteLink,
	replacePlannedRouteTrack as dbReplacePlannedRouteTrack,
	updatePlannedRoute as dbUpdatePlannedRoute,
	getActivityRouteRef,
	getPlannedRoute,
	getPlannedRouteTrack,
	listPlannedRoutes,
	listPlannedRouteTracks,
	listPlanRouteRefs,
	listRouteLinks,
	savePlannedFromFile,
	savePlannedFromTrack
} from '../planned-routes';
import {
	getRouteGeoJson,
	listRouteEffortSources,
	loadRouteAnalytics,
	routeIdForRun,
	saveRouteGeoJson
} from '../route-analytics';
import { listRouteTracks } from '../routes';
import {
	deleteRun as dbDeleteRun,
	updateRun as dbUpdateRun,
	findRunsByDate,
	getMaxHrAllTime,
	getRun,
	getRunById,
	listRouteIds,
	listRuns,
	runHasMap,
	saveRun,
	setRunBestEfforts,
	setRunImportMetrics,
	setRunRoute,
	updateRunFeelings,
	type FeelingsPatch,
	type UpdateRunFields
} from '../runs';
import { inferSurfaceFromTrack } from '../surface';
import {
	DEFAULT_START_HHMM,
	fetchDailyForecast,
	fetchWeatherForDateTime,
	formatDailyForecast,
	weatherLocationFromTrack
} from '../weather';
import {
	attachPlanRoutes,
	highlightsAfterSave,
	hydrateBestEfforts,
	withMap
} from '../run-orchestration';
import { byDateNewestFirst, isImportNote } from '../run-sort';
import { zipFilePayload } from '../export-zip';
import { buildFuelPromptTemplate, fuelRunRefs, runDatesBySlug } from '../fuel-prompt';
import {
	applyFeelingsRows,
	mergePlanWeeks,
	parseJsonPayload,
	planWeekCandidates
} from '../plan-mutations';
import {
	activityStartMs,
	matchingPlanSession,
	startFinishWaypoints,
	trackFromDrawnPins
} from '../planned-route-draw';
import {
	allTimeSummarySection,
	briefTableRow,
	BRIEF_TABLE_HEAD,
	DEFAULT_BRIEF_RANGE,
	forecastSectionForBrief,
	gearSectionForBrief,
	HOW_TO_READ,
	historyWindowPhrase,
	notesForBriefRow,
	typicalStartTime,
	weekHasSessions,
	formatTrainingPlanBrief
} from '../coach-brief';
import {
	bodyScoresExample,
	debriefRaceHint,
	debriefRunSummary,
	expandDebriefFeatured,
	feelingsExample,
	formatDebriefSessionUnit,
	formatFeelForUnit,
	formatPlannedForActivity,
	formatRunBriefLine,
	hasFeel,
	parseDebriefIds,
	parseDebriefSlugLabels,
	plannedSessionForActivity
} from '../debrief-prompt';

// ---------- reads ----------

/** Root-loader data shared by every page: sign-in state + the open body notes to score. */

export const getProfileData = createServerFn({ method: 'GET' }).handler(async () => {
	return loadProfile();
});

export const saveBodyNotes = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: BodyNotes) => normalizeBodyNotes(d))
	.handler(async ({ data }) => persistBodyNotes(data));

export const saveCoachNotes = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: { text: string }) => ({ text: typeof d?.text === 'string' ? d.text : '' }))
	.handler(async ({ data }) => ({ coachNotes: await persistCoachNotes(data.text) }));

/** Upsert picked debrief suggestions into the body notes (same area → same note). */

export const applyBodySuggestions = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: BodyNote[]) => (Array.isArray(d) ? d : []))
	.handler(async ({ data }) => {
		const { body } = await loadProfile();
		const picked = normalizeBodyNotes({ notes: data }).notes;
		const byId = new Map(picked.map((n) => [n.id, n]));
		const kept = body.notes.map((n) => byId.get(n.id) ?? n);
		const added = picked.filter((n) => !body.notes.some((o) => o.id === n.id));
		return persistBodyNotes({ notes: [...kept, ...added] });
	});

// ---------- weekly feelings round-trip ----------

/**
 * Build a ready-to-paste prompt asking the AI to summarise, per activity, how each one felt —
 * using the week's conversation. `scope: 'window'` covers the last `weeks`; `scope: 'missing'`
 * covers every activity that still lacks feel data. The AI returns JSON keyed by slug, saved back
 * via saveFeelings.
 */

export const getFeelingsPrompt = createServerFn({ method: 'GET' })
	.validator((d: { scope: 'window' | 'missing'; weeks: number }) => ({
		scope: d.scope === 'missing' ? 'missing' : 'window',
		weeks: Number.isFinite(d.weeks) && d.weeks > 0 ? Math.floor(d.weeks) : 1
	}))
	.handler(async ({ data }) => {
		const [runs, profile] = await Promise.all([listRuns(), loadProfile()]);
		const scoreAreas = openBodyAreas(profile.body);
		const bodyExample = bodyScoresExample(scoreAreas);
		const all = runs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
		let targets: RunRecord[];
		let rangeLabel: string;
		if (data.scope === 'missing') {
			targets = all.filter((r) => !hasFeel(r));
			rangeLabel = 'all activities still missing how they felt';
		} else {
			const cutoff = new Date();
			cutoff.setDate(cutoff.getDate() - data.weeks * 7);
			const cutoffIso = cutoff.toISOString().slice(0, 10);
			targets = all.filter((r) => r.date >= cutoffIso);
			rangeLabel = `the last ${data.weeks} week${data.weeks === 1 ? '' : 's'}`;
		}

		const from = targets[0]?.date ?? '—';
		const to = targets[targets.length - 1]?.date ?? '—';

		const table = targets.length
			? targets
					.map((r) => {
						const feel = hasFeel(r) ? 'has notes — refine only if I said more' : 'none yet';
						return `| ${r.id} | ${r.date} | ${activityLabel(r.activity_type)} | ${
							r.distance_km != null ? `${r.distance_km} km` : '—'
						} | ${feel} |`;
					})
					.join('\n')
			: '| — | — | — | — | — |';

		const exampleId = targets[0]?.id ?? 0;
		const example = JSON.stringify({
			activities: [
				{
					id: exampleId,
					effort: 6,
					...(bodyExample ? { body_scores: bodyExample } : {}),
					legs: 7,
					energy: 7,
					wanted_faster: true,
					surface: 'wet asphalt',
					notes: 'Tight for the first 2 km, then opened up after the turnaround.'
				}
			]
		});
		const prompt = tidyPrompt(`# The Long Run — capture how each activity felt

From our conversation, summarise how I felt for each activity below (${rangeLabel}): terrain, ${scoreAreas.length ? `${scoreAreas.map((a) => a.area.toLowerCase()).join(', ')}, ` : ''}energy, legs, and whether I wanted to go more or faster.

Return ONLY a JSON block in exactly this shape — no prose before or after:

\`\`\`json
${example}
\`\`\`

Rules:
- Copy \`id\` from the table — do not use the example id if it is not in the table. Do not copy example numbers.
- ${feelScale()}${scoreAreas.length ? ` \`body_scores\` holds one 0–10 score per body area (runs/walks), keyed by the exact area name: ${scoreAreas.map((a) => a.area).join(', ')}.` : ''} \`wanted_faster\` is true/false.
- Omit any field you have no information for; omit an activity entirely if I said nothing about it.
- Keep \`notes\` short and in my voice (first person).

## Activities (${from} → ${to})
| id | date | type | distance | current feel |
|------|------|------|----------|--------------|
${table}`);
		return { prompt, count: targets.length, from, to };
	});

/** Save AI-summarised feelings back onto activities by id (subjective fields only). */

export const saveFeelings = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((jsonText: string) => jsonText)
	.handler(async ({ data: jsonText }) => {
		const rows = parseFeelingsReply(parseJsonPayload(jsonText));
		return applyFeelingsRows(rows);
	});
