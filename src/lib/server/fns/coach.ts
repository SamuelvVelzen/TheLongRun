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

export const getCoachPlan = createServerFn({ method: 'GET' }).handler(async () => {
	const [runs, training, planRefs, plannedRoutes] = await Promise.all([
		listRuns(),
		loadTrainingContext(),
		listPlanRouteRefs(),
		listPlannedRoutes()
	]);
	const { plan, calendar, activeGoal } = training;
	const views = keepSoonestNext(
		plan
			.filter((w) => (w.sessions?.length ?? 0) > 0)
			.sort((a, b) => a.week - b.week)
			.map((w) => attachPlanRoutes(buildWeekView(w, runs, calendar), planRefs))
			.filter((v): v is NonNullable<typeof v> => v != null)
	);
	return {
		views,
		currentWeek: weekToPlan(calendar),
		generateWeek: weekToGenerate(plan, runs, calendar),
		calendar,
		activeGoal,
		intentions: openIntentions(training.store.goals),
		routes: plannedRoutes.map((r): SessionRouteRef => ({
			slug: r.slug,
			name: r.name,
			distance_km: r.distance_km
		}))
	};
});

export const getCoachBrief = createServerFn({ method: 'GET' })
	.validator(
		(
			d: {
				range?: RangeKind;
				from?: string | null;
				to?: string | null;
				setup?: WeekSetup;
				defaultSetup?: WeekSetup;
				note?: string;
			} = {}
		) => {
			const range = dateRangeFromSearch({
				range: d?.range ?? (d?.from || d?.to ? undefined : DEFAULT_BRIEF_RANGE),
				from: d?.from ?? undefined,
				to: d?.to ?? undefined
			});
			return {
				range,
				setup: d?.setup != null ? normalizeWeekSetup(d.setup) : undefined,
				defaultSetup: d?.defaultSetup != null ? normalizeWeekSetup(d.defaultSetup) : undefined,
				note: typeof d?.note === 'string' ? d.note : ''
			};
		}
	)
	.handler(async ({ data }) => {
		const range = data.range;
		// Before reading gear.md: the first load moves its fuel section into the fuel log.
		const fuelLog = await loadFuelLog();
		const [allRuns, training, gearInventory, settings, habits, wardrobe, profile] =
			await Promise.all([
				listRuns(),
				loadTrainingContext(),
				loadGear(),
				loadSettings(),
				loadActivityHabits(),
				loadWardrobe(),
				loadProfile()
			]);
		const { plan, calendar, activeGoal, medals, store } = training;
		const defaultSetup = data.defaultSetup ?? weekSetupFromSettings(settings);
		const thisSetup = data.setup ?? defaultSetup;
		const mixNote = data.note.trim();

		const today = new Date();
		const windowRuns = filterRunsByRange(allRuns, range).sort(byDateNewestFirst);

		const daysToRace =
			activeGoal != null ? Math.max(0, daysUntil(activeGoal.date, today) ?? 0) : null;

		const curWeek = Math.min(calendar.weekCount, Math.max(1, planWeekIndex(calendar, today)));
		const targetWeek = weekToGenerate(plan, allRuns, calendar, today);
		const weekPhrase = targetWeek > curWeek ? 'next week' : 'this week';
		const todayIso = isoDateLocal(today);
		const weekRange = (n: number) => planWeekDateRange(n, calendar);

		const paces = buildPaceProfile(allRuns, medals, todayIso);
		const easyPace = typicalEasyPace(paces) ?? 'M:SS';
		const history = buildHistoryTiers(allRuns, today);
		const windowPhrase = historyWindowPhrase(range);
		const rows = windowRuns.map(briefTableRow).join('\n');
		const activitySection = rows
			? `## Activity log (${windowPhrase}, newest first)\n${feelScale()}\n\n${BRIEF_TABLE_HEAD}\n${rows}`
			: '';
		const strengthLogs = allRuns
			.filter((r) => normalizeActivityType(r.activity_type) === 'strength')
			.sort(byDateNewestFirst);
		const liftTopsSection = formatLiftTopsBrief(strengthLogs, todayIso);

		const savedTarget = plan.find((w) => w.week === targetWeek);
		const revising = weekHasSessions(savedTarget);
		const targetView = savedTarget ? buildWeekView(savedTarget, allRuns, calendar, today) : null;
		const unplannedSection = targetView?.unplanned.length
			? `## Unplanned activities (${weekPhrase})
These logs fall in week ${targetWeek} but did not match a planned session (extra session, rest/empty day, or different sport). They are **already done extra load** — do not add a plan row just to file them. Account for that load when ${revising ? 'revising remaining sessions' : 'planning the week'}.
${formatUnplannedBrief(targetView.unplanned)}`
			: '';
		const weekStartIso = planWeekStartIso(targetWeek, calendar);
		const weekEndIso = planWeekEndIso(targetWeek, calendar);
		const hasWardrobe = wardrobeHasItems(wardrobe);
		const forecast = (await fetchDailyForecast(weekStartIso, weekEndIso)).map((f) => {
			const weekday = new Date(`${f.date}T12:00:00`).toLocaleDateString('en-GB', {
				weekday: 'long'
			});
			return { date: f.date, line: `${weekday} ${f.date}: ${formatDailyForecast(f)}` };
		});
		const forecastSection = forecastSectionForBrief(
			forecast,
			weekPhrase,
			hasWardrobe,
			typicalStartTime(allRuns)
		);
		const wardrobeSection = formatWardrobeSection(wardrobe);
		const wardrobeBit = hasWardrobe
			? `My clothing${forecast.length ? ' and that day’s forecast' : ''} for \`kit\``
			: 'forecast and what I own for \`kit\`';
		const planFuelKitRules = ` On run, walk, and bike sessions where it matters, add \`"fuel"\` and/or \`"kit"\` (omit on strength or when nothing specific is needed). This is **planned** fuel/kit on the session — saved in the training plan, **not** in my fuel log (the log is only for what I actually tried). \`fuel\`: array of \`{"phase":"before"|"during"|"after","item","timing"}\` with optional \`"notes"\` — use separate rows per phase; default to what worked in my Fuel log; never suggest timings that caused trouble. \`kit\`: one short string sentence — ${wardrobeBit}; long or wet runs → long-run-safe bottoms. Example fuel: ${JSON.stringify(PLAN_SESSION_FUEL_JSON_EXAMPLE)}. Example kit: ${JSON.stringify(PLAN_SESSION_KIT_JSON_EXAMPLE)}. Keep coaching intent in \`"detail"\` — do not duplicate fuel or kit there. If the weather calls for something I don’t own, say so once in prose or in \`kit\`.`;
		const thisWeekLogs = allRuns
			.filter((r) => r.date >= weekStartIso && r.date <= weekEndIso)
			.sort((a, b) =>
				a.date !== b.date ? (a.date < b.date ? -1 : 1) : (a.slug ?? '').localeCompare(b.slug ?? '')
			);
		const alreadyLoggedSection =
			!revising && thisWeekLogs.length
				? `## Already logged this week
These are already done. If a log matches a pinned activity (day + sport), that activity is done — keep it in the JSON to match what I did. A log in a sport you plan counts toward that sport for the week — include it as a row to match what I did, and plan the rest around it. Logs in sports you do not plan are extra load; do not add a plan row just to file them.
${thisWeekLogs.map(formatRunBriefLine).join('\n')}`
				: '';
		const recentSports = ACTIVITY_TYPES.filter((t) =>
			windowRuns.some((r) => normalizeActivityType(r.activity_type) === t)
		);
		const mixSection = formatWeekSetupPromptSection({
			setup: thisSetup,
			defaultSetup,
			weekPhrase,
			recentSports,
			note: mixNote
		});
		const exampleJson = JSON.stringify(
			revising && savedTarget
				? {
						week: targetWeek,
						dates: weekRange(targetWeek),
						phase: savedTarget.phase,
						focus: savedTarget.focus,
						sessions: savedTarget.sessions
					}
				: {
						week: targetWeek,
						dates: weekRange(targetWeek),
						phase: 'base | build | peak | taper',
						focus: 'one-line focus for the week',
						sessions: exampleSessionsForSetup(thisSetup, easyPace)
					}
		);
		const lastMedal = medals[0];
		const lastMedalLine = lastMedal
			? `- Last race: ${lastMedal.name} on ${lastMedal.date}${lastMedal.result?.time ? ` in ${lastMedal.result.time}` : ''}${lastMedal.result?.pace ? ` (${lastMedal.result.pace}/km)` : ''}`
			: '';
		const laterRaces = store.goals
			.filter((g) => g.status !== 'done' && g.id !== activeGoal?.id && isRaceGoal(g))
			.sort((a, b) => a.date.localeCompare(b.date));
		const laterLines = laterRaces.map(formatLaterRacePromptLine).join('\n');
		const intentions = openIntentions(store.goals);
		const intentionLines = intentions.map(formatIntentionPromptLine).join('\n');
		const intentionLookahead =
			intentions.length === 0
				? ''
				: ` Look-ahead (not booked): ${intentions
						.map(
							(g) => `**${g.name}** (${g.distance_km} km) in **${formatHorizonLabel(g.horizon)}**`
						)
						.join('; ')}.`;
		const toward = activeGoal
			? `I'm training toward **${activeGoal.name}** (${activeGoal.distance_km} km) on **${activeGoal.date}**${
					daysToRace != null ? ` — **${daysToRace} days** away` : ''
				}`
			: `There is **no race on the calendar**. Plan ${weekPhrase} as base / consistency training.${intentionLookahead}`;
		const ladderLine = activeGoal
			? "Base each session on how I've been recovering and laddering toward the race."
			: "Base each session on how I've been recovering. No race to peak for — keep it sustainable.";
		const briefAsk = revising
			? `Week ${targetWeek} already has a saved plan (see Training plan). **Revise remaining sessions** given what is already logged, including any unplanned extras. Start from the saved week JSON. Keep completed planned sessions in the JSON as they were (a matching Activity log date + sport means done; do not add \`"status": "completed"\` — \`status\` is only for skipped). Remaining sessions in the sports you plan may move to any day my day limits allow, or be added or dropped, if that serves the goal — say why. Flag any red flags (injury risk, overtraining, under-recovery).`
			: `Please assess how my training is going and **build ${weekPhrase} around my pinned activities**: keep every pinned activity, respect my day limits, and plan the sports I listed — you decide how many sessions of each and on which days. ${ladderLine} If a log ${weekPhrase} already covers a pinned activity or a planned sport, keep it in the JSON to match what I did, and plan the rest around it. Flag any red flags (injury risk, overtraining, under-recovery).`;
		const runRules = runSessionPrompt(easyPace);
		const replyRules = revising
			? `Start from the saved week JSON. Keep completed sessions as they were (do not add \`"status": "completed"\`). Revise what's still ahead. Never move or skip a **pinned** activity; **pinned, optional** ones may be skipped with \`"status": "skipped"\`. Other remaining sessions may move to any day my day limits allow — say why. If you drop a session, set \`"status": "skipped"\`. ${SKIP_STATUS_PROMPT} ${runRules} ${STRENGTH_SESSION_PROMPT}`
			: `Include every pinned activity on its day. Add the sessions you plan for the sports I listed — every row needs a real weekday in \`"day"\` and an \`"activity_type"\`. You invent \`"label"\`, \`"distance_km"\` (null for strength), \`"detail"\`, and \`"workout"\` for runs. ${runRules} ${STRENGTH_SESSION_PROMPT} The example rows, labels, days, and distances below are placeholders, not prescriptions — "YOU CHOOSE — a weekday" means pick a real day, and add or remove rows as the week needs. **Pinned, optional** activities may be skipped with \`"status": "skipped"\`. ${SKIP_STATUS_PROMPT}`;

		const goalLines = activeGoal
			? [
					'## Goal',
					`- Race: ${activeGoal.name} — ${activeGoal.distance_km} km on ${activeGoal.date}${daysToRace != null ? ` (~${daysToRace} days to go)` : ''}`,
					`- Sport: ${activityLabel(activeGoal.sport)}`,
					activeGoal.time_goal ? `- Time goal: ${activeGoal.time_goal}` : '',
					activeGoal.bib_number ? `- Bib: ${activeGoal.bib_number}` : '',
					activeGoal.wave ? `- Wave: ${activeGoal.wave}` : '',
					activeGoal.start_time ? `- Start: ${activeGoal.start_time}` : '',
					activeGoal.url ? `- Race URL: ${activeGoal.url}` : '',
					activeGoal.itinerary_url ? `- Itinerary: ${activeGoal.itinerary_url}` : '',
					...(activeGoal.primary ?? []).map((p) => `- Priority: ${p}`),
					laterLines,
					intentionLines,
					activeGoal.notes.trim() ? `\n${activeGoal.notes.trim()}` : ''
				]
			: ['## Goal', '- No active race. This is a base week.', lastMedalLine, intentionLines];
		const goalSection = goalLines.filter(Boolean).join('\n');

		const timingSection = calendar.rolling
			? `## Timing (use these exact values — do not guess dates)
- Today: ${todayIso}.
- No multi-week race block — plan **this week only** (${weekRange(1)}).
- The week to plan is **week ${targetWeek}** (${weekRange(targetWeek)}) — ${weekPhrase}. In the JSON you return, set exactly \`"week": ${targetWeek}\` and \`"dates": "${weekRange(targetWeek)}"\`.`
			: `## Timing (use these exact values — do not guess dates)
- Today: ${todayIso}.
- Plan block: Monday–Sunday, **${calendar.weekCount} weeks**, from ${calendar.startIso} to race day ${activeGoal?.date ?? ''}.
- Current week: **week ${curWeek}** of ${calendar.weekCount} (${weekRange(curWeek)}).
- The week to plan is **week ${targetWeek}** (${weekRange(targetWeek)}) — ${weekPhrase}. In the JSON you return, set exactly \`"week": ${targetWeek}\` and \`"dates": "${weekRange(targetWeek)}"\`.`;

		return tidyPrompt(
			joinSections(
				'# The Long Run — training context',
				`## Coaching brief
You are my coach for the sports I actually do — not a running-only coach. ${toward}. My pinned activities and day limits are fixed by life; everything else is yours to plan around them. You choose how many sessions of each sport I asked you to plan, which days, the session kind, distance or strength prescription, and intent. Below is my plan, my recent training with how each session felt, weekly volume across sports, and my constraints.

${briefAsk}`,
				`## How to read this brief
${HOW_TO_READ}`,
				goalSection,
				timingSection,
				allTimeSummarySection(allRuns),
				formatPaceSection(paces),
				history.weekly,
				history.monthly,
				history.yearly,
				activitySection,
				liftTopsSection,
				section(
					'Training plan',
					plan.length ? formatTrainingPlanBrief(plan, targetWeek, calendar, allRuns, today) : ''
				),
				unplannedSection,
				alreadyLoggedSection,
				forecastSection,
				gearSectionForBrief(gearInventory, allRuns),
				wardrobeSection,
				formatBodyNotesSection(profile.body),
				formatCoachNotesSection(profile.coachNotes),
				formatUsualHabitsSection(habits),
				formatFuelSection(fuelLog, fuelRunRefs(allRuns, fuelLog)),
				mixSection,
				`## When you reply
Give your assessment and ${weekPhrase}'s sessions in prose. Then, so I can save it straight back into my app, also output **${weekPhrase} as one JSON object** in exactly this shape (real values, same keys). ${replyRules}${planFuelKitRules}

\`\`\`json
${exampleJson}
\`\`\``
			)
		);
	});

export const getWeekPattern = createServerFn({ method: 'GET' }).handler(async () => {
	const s = await loadSettings();
	return weekSetupFromSettings(s);
});

export const saveWeekPattern = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((setup: WeekSetup) => normalizeWeekSetup(setup))
	.handler(async ({ data }) => saveWeekSetupSetting(data));

export const savePlanWeeks = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((jsonText: string) => jsonText)
	.handler(async ({ data: jsonText }) => {
		const candidates = planWeekCandidates(parseJsonPayload(jsonText));
		if (!candidates.length) throw new Error('No plan week found in that JSON.');
		return mergePlanWeeks(parsePlanWeeks(candidates));
	});

/** Save a debrief reply: feelings for this run + an updated week plan. */
