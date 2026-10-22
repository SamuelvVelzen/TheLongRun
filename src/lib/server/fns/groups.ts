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

export const getGroupDetail = createServerFn({ method: 'GET' })
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		const groupRaw = await getActivityGroup(id);
		if (!groupRaw) return null;
		const [allRuns, routeIds, settings, allTimeMaxHr, groupsRaw] = await Promise.all([
			listRuns(),
			listRouteIds(),
			loadSettings(),
			getMaxHrAllTime(),
			listActivityGroups()
		]);
		await hydrateBestEfforts(allRuns);
		const members = groupRaw.member_ids
			.map((mid) => allRuns.find((r) => r.id === mid))
			.filter((r): r is RunRecord => r != null);
		if (members.length < 2) return null;
		const group = await enrichGroupEfforts(groupRaw, members);
		const parts = await tracksForMembers(members);
		const stats = combineRunStats(members);
		const hrMaxManual = settings.hrMax;
		const analytics = withEffectiveHrZones(
			combinedAnalytics(parts, {
				avgHr: stats.avg_hr,
				maxHr: stats.max_hr,
				profileMaxHr: hrMaxManual ?? allTimeMaxHr
			}),
			{
				avgHr: stats.avg_hr,
				hrMaxManual,
				hrMaxAllTime: allTimeMaxHr
			}
		);
		const segments = members.map((run, i) => {
			const points = parts[i] ?? [];
			return {
				slug: run.slug,
				name: `${run.date}${run.start_time ? ` ${run.start_time}` : ''} · ${run.activity_type}`,
				activity_type: run.activity_type,
				has_track: points.length >= 2,
				route_id: routeIdForRun(run)
			};
		});
		return {
			group,
			stats,
			members: withMap(members, routeIds),
			analytics,
			routeIds: segments.map((s) => s.route_id).filter((x): x is string => Boolean(x)),
			segments,
			hrMaxManual,
			hrMaxAllTime: allTimeMaxHr,
			allRuns: withMap(allRuns, routeIds),
			groups: await enrichAllGroupEfforts(groupsRaw, allRuns)
		};
	});

export const createActivityGroupFn = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: { ids: number[]; name?: string }) => d)
	.handler(async ({ data }) => {
		const group = await createActivityGroup(data.ids, data.name ?? '');
		return { id: group.id };
	});

export const addToActivityGroupFn = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: { groupId: string; id: number }) => d)
	.handler(async ({ data }) => {
		await addActivityToGroup(data.groupId, data.id);
		return { ok: true };
	});

export const removeFromActivityGroupFn = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: { groupId: string; id: number }) => d)
	.handler(async ({ data }) => {
		await removeActivityFromGroup(data.groupId, data.id);
		return { ok: true };
	});

export const ungroupActivitiesFn = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		await ungroupActivities(id);
		return { ok: true };
	});

export const exportGroupedActivity = createServerFn({ method: 'GET' })
	.validator((d: { id: string; kind: 'gpx' | 'tcx' | 'zip' }) => d)
	.handler(async ({ data }) => {
		const groupRaw = await getActivityGroup(data.id);
		if (!groupRaw) throw new Error('Group not found.');
		const allRuns = await listRuns();
		const members = groupRaw.member_ids
			.map((mid) => allRuns.find((r) => r.id === mid))
			.filter((r): r is RunRecord => r != null);
		if (members.length < 2) throw new Error('Group not found.');
		const stats = combineRunStats(members);
		const parts = await tracksForMembers(members);
		const segments = members.map((run, i) => ({
			name: `${run.date}${run.start_time ? ` ${run.start_time}` : ''}`,
			activity_type: run.activity_type,
			points: parts[i] ?? []
		}));
		const withTrack = segments.filter((s) => s.points.length >= 2);
		if (!withTrack.length) throw new Error('No GPS tracks to export.');
		const title = groupedSessionTitle(groupRaw, members.length, stats.date);
		const fileBase = safeFilename(
			`combined-${stats.mixed ? 'mix' : stats.activity_type}-${stats.date}`
		);

		if (data.kind === 'zip' || stats.mixed) {
			if (data.kind !== 'zip' && stats.mixed) {
				throw new Error('Mixed-type groups export as separate files.');
			}
			const entries = withTrack.map((s, i) => ({
				name: `${fileBase}-${i + 1}-${normalizeActivityType(s.activity_type)}.gpx`,
				data: memberActivityGpx({
					name: `${title} · ${s.name}`,
					activityType: s.activity_type,
					points: s.points
				})
			}));
			return zipFilePayload(`${fileBase}.zip`, entries);
		}

		const xml =
			data.kind === 'tcx'
				? combinedActivityTcx({
						name: title,
						activityType: stats.activity_type,
						segments: withTrack
					})
				: combinedActivityGpx({
						name: title,
						activityType: stats.activity_type,
						segments: withTrack
					});
		const ext = data.kind === 'tcx' ? 'tcx' : 'gpx';
		const mime = data.kind === 'tcx' ? 'application/vnd.garmin.tcx+xml' : 'application/gpx+xml';
		return { filename: `${fileBase}.${ext}`, mime, encoding: 'utf8' as const, body: xml };
	});

export const exportActivitiesFn = createServerFn({ method: 'GET' })
	.validator((d: { ids: number[] }) => d)
	.handler(async ({ data }) => {
		const unique = [...new Set(data.ids.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0))];
		if (!unique.length) throw new Error('Pick at least one activity to export.');
		const all = await listRuns();
		const runs = sortGroupMembers(
			unique
				.map((id) => all.find((r) => r.id === id))
				.filter((r): r is RunRecord => r != null)
		);
		if (!runs.length) throw new Error('Activity not found.');
		const parts = await tracksForMembers(runs);
		const entries: { name: string; data: string }[] = [];
		for (let i = 0; i < runs.length; i++) {
			const run = runs[i]!;
			const points = parts[i] ?? [];
			if (points.length < 2) continue;
			const name = `${run.date}${run.start_time ? ` ${run.start_time}` : ''}`;
			entries.push({
				name: safeFilename(
					`${run.date}-${normalizeActivityType(run.activity_type)}-${run.slug}.gpx`
				),
				data: memberActivityGpx({
					name,
					activityType: run.activity_type,
					points
				})
			});
		}
		if (!entries.length) throw new Error('No GPS tracks to export.');
		if (entries.length === 1) {
			return {
				filename: entries[0]!.name,
				mime: 'application/gpx+xml',
				encoding: 'utf8' as const,
				body: entries[0]!.data
			};
		}
		const first = runs[0]!.date;
		const last = runs[runs.length - 1]!.date;
		const zipName =
			first === last ? `activities-${first}.zip` : `activities-${first}-to-${last}.zip`;
		return zipFilePayload(zipName, entries);
	});

/** Merge AI-returned plan week(s) into plan.json (replace by week number, keep the rest). */
