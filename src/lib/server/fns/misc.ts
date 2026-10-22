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

export const saveHrMax = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((hrMax: number | null) => hrMax)
	.handler(async ({ data }) => {
		await saveHrMaxSetting(data);
		return { ok: true };
	});

export const getLogDefaults = createServerFn({ method: 'GET' }).handler(async () => {
	const [week, gear, runs, training, habits] = await Promise.all([
		currentPlanWeek(),
		loadGear(),
		listRuns(),
		loadTrainingContext(),
		loadActivityHabits()
	]);
	const strengthTops = recentExerciseTops(
		runs
			.filter((r) => normalizeActivityType(r.activity_type) === 'strength')
			.sort(byDateNewestFirst)
	);
	return {
		week,
		gear,
		gearWear: wearByAllGear(runs),
		calendar: training.calendar,
		strengthTops,
		habits
	};
});

export const getRouteGeoJsonFn = createServerFn({ method: 'GET' })
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		return (await getRouteGeoJson(id)) ?? null;
	});

export const getWeather = createServerFn({ method: 'GET' })
	.validator(
		(d: { date: string; time?: string | null; duration?: string | null; slug?: string | null }) => d
	)
	.handler(async ({ data }) => {
		const slug = data.slug?.trim() ?? '';
		const run = slug ? await getRun(slug) : null;
		return fetchWeatherForDateTime(
			data.date,
			data.time ?? null,
			null,
			null,
			data.duration ?? null,
			run
		);
	});
