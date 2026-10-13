import {
	ACTIVITY_TYPES,
	activityCount,
	activityLabel,
	activityPlural,
	importActivityType,
	metricText,
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
import { FUEL_TEXT_TOKEN } from '$lib/fuel-prompt';
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
import { combineRunStats, groupedSessionTitle, sortGroupMembers } from '$lib/group';
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
import {
	feelingsRowToPatch,
	parseFeelingsReply,
	parseFeelingsSuggestions,
	type ParsedFeelingsActivity
} from '$lib/feelings-schema';
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
import { loadBodyNotes, loadProfile, persistBodyNotes, persistCoachNotes } from './profile';
import { zipStoreBytes } from '$lib/zip';
import { createServerFn } from '@tanstack/react-start';
import { requireAuth } from './auth';
import { brouterAlongPins } from './brouter';
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
} from './context';
import { reverseGeocode, timezoneForCoord } from './geo';
import { parseActivityFile } from './gpx';
import {
	addActivityToGroup,
	createActivityGroup,
	enrichAllGroupEfforts,
	enrichGroupEfforts,
	getActivityGroup,
	listActivityGroups,
	membershipForSlug,
	removeActivityFromGroup,
	tracksForMembers,
	ungroupActivities
} from './groups';
import {
	attachRouteToActivity as dbAttachRouteToActivity,
	attachRouteToPlan as dbAttachRouteToPlan,
	deletePlannedRoute as dbDeletePlannedRoute,
	detachRouteLink as dbDetachRouteLink,
	replacePlannedRouteTrack as dbReplacePlannedRouteTrack,
	updatePlannedRoute as dbUpdatePlannedRoute,
	getActivityRouteRef,
	getPlannedRoute,
	listPlannedRoutes,
	listPlannedRouteTracks,
	listPlanRouteRefs,
	listRouteLinks,
	savePlannedFromFile,
	savePlannedFromTrack
} from './planned-routes';
import {
	getRouteGeoJson,
	listRouteEffortSources,
	loadRouteAnalytics,
	routeIdForRun,
	saveRouteGeoJson
} from './route-analytics';
import { listRouteTracks } from './routes';
import {
	deleteRun as dbDeleteRun,
	updateRun as dbUpdateRun,
	findRunsByDate,
	getMaxHrAllTime,
	getRun,
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
} from './runs';
import { inferSurfaceFromTrack } from './surface';
import {
	DEFAULT_START_HHMM,
	fetchDailyForecast,
	fetchWeatherForDateTime,
	formatDailyForecast,
	weatherLocationFromTrack
} from './weather';

const withMap = (runs: RunRecord[], routeIds: Set<string>): RunWithMap[] =>
	runs.map((r) => ({ ...r, has_map: runHasMap(r, routeIds) }));

function attachPlanRoutes(
	weekView: WeekView | null,
	planRefs: Awaited<ReturnType<typeof listPlanRouteRefs>>
): WeekView | null {
	if (!weekView) return null;
	const bySession = new Map<string, SessionRouteRef>();
	const legacyByDay = new Map<string, SessionRouteRef>();
	for (const ref of planRefs) {
		if (ref.week !== weekView.week.week) continue;
		const routeRef: SessionRouteRef = {
			slug: ref.slug,
			name: ref.name,
			distance_km: ref.distance_km,
			link_id: ref.id
		};
		if (ref.label && ref.activity_type) {
			bySession.set(planSessionRouteKey(ref.day, ref.label, ref.activity_type), routeRef);
		} else {
			legacyByDay.set(ref.day.trim().toLowerCase(), routeRef);
		}
	}
	return withSessionRoutes(weekView, bySession, legacyByDay);
}

async function hydrateBestEfforts(runs: RunRecord[]): Promise<RunRecord[]> {
	const incomplete = runs.filter(
		(r) =>
			supportsBestEfforts(r.activity_type) &&
			(r.route || r.strava_id) &&
			missingEffortKeys(r.distance_km, r.best_efforts ?? []).length > 0
	);
	if (!incomplete.length) return runs;
	const sources = await listRouteEffortSources();
	for (const run of incomplete) {
		const id = routeIdForRun(run);
		const src = id ? sources.get(id) : undefined;
		if (!src) continue;
		const fromTrack = src.samples.length >= 2 ? computeBestEffortsFromTrack(src.samples) : [];
		const fromSplits = src.splits.length ? computeBestEffortsFromSplits(src.splits) : [];
		const merged = mergeMissingBestEfforts(
			fromTrack.length ? fromTrack : (run.best_efforts ?? []),
			fromSplits
		);
		if (!merged.length || effortsEqual(merged, run.best_efforts ?? [])) continue;
		await setRunBestEfforts(run.slug, merged);
		run.best_efforts = merged;
	}
	return runs;
}

async function highlightsAfterSave(
	slug: string,
	activityType: string,
	efforts: import('$lib/best-efforts').BestEffort[]
): Promise<EffortHighlight[]> {
	if (!supportsBestEfforts(activityType) || !efforts.length) return [];
	const all = await listRuns();
	await hydrateBestEfforts(all);
	const row = all.find((r) => r.slug === slug);
	if (row) row.best_efforts = mergeMissingBestEfforts(efforts, row.best_efforts ?? []);
	return highlightsForActivity(slug, activityType, all);
}

// ---------- reads ----------

/** Root-loader data shared by every page: sign-in state + the open body notes to score. */
export const getAuthState = createServerFn({ method: 'GET' }).handler(async () => {
	const { readAuthSession } = await import('./auth.server');
	const [auth, body] = await Promise.all([readAuthSession(), loadBodyNotes()]);
	return { ...auth, bodyAreas: openBodyAreas(body) };
});

export const getLiveLocation = createServerFn({ method: 'GET' }).handler(async () => {
	return loadLiveLocation();
});

export const pingLiveLocation = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator(
		(d: { lat: number; lng: number; accuracy?: number | null; heading?: number | null }) => {
			const lat = Number(d?.lat);
			const lng = Number(d?.lng);
			if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('Invalid location.');
			if (lat < -90 || lat > 90 || lng < -180 || lng > 180) throw new Error('Invalid location.');
			const accuracy = d?.accuracy == null ? null : Number(d.accuracy);
			const heading = d?.heading == null ? null : Number(d.heading);
			return {
				lat,
				lng,
				accuracy: Number.isFinite(accuracy) ? accuracy : null,
				heading: Number.isFinite(heading) && heading! >= 0 ? heading : null
			};
		}
	)
	.handler(async ({ data }) => {
		return saveLiveLocation(data);
	});

export const stopLiveLocation = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.handler(async () => {
		await clearLiveLocation();
		return { ok: true as const };
	});

export const getDashboardData = createServerFn({ method: 'GET' }).handler(async () => {
	const [runs, tracks, routeIds, training, planRefs, groupsRaw] = await Promise.all([
		listRuns(),
		listRouteTracks(),
		listRouteIds(),
		loadTrainingContext(),
		listPlanRouteRefs(),
		listActivityGroups()
	]);
	const groups = await enrichAllGroupEfforts(groupsRaw, runs);
	const { plan, calendar, activeGoal, medals } = training;
	const nextIntention = openIntentions(training.store.goals)[0] ?? null;
	const weekNum = weekToPlan(calendar);
	const week = plan.find((w) => w.week === weekNum) ?? plan[plan.length - 1] ?? null;
	const weekView = attachPlanRoutes(pickBannerWeekView(plan, runs, calendar), planRefs);
	return {
		runs: withMap(runs, routeIds),
		tracks,
		groups,
		week,
		weekView,
		streak: sessionStreak(runs, plan, calendar),
		activeGoal,
		nextIntention,
		lastMedal: medals[0] ?? null,
		calendar
	} satisfies {
		runs: RunWithMap[];
		tracks: RouteTrack[];
		groups: ActivityGroupInfo[];
		week: PlanWeek | null;
		weekView: WeekView | null;
		streak: number;
		activeGoal: Goal | null;
		nextIntention: Goal | null;
		lastMedal: Goal | null;
		calendar: PlanCalendar;
	};
});

export const getCurrentWeekView = createServerFn({ method: 'GET' }).handler(async () => {
	const [runs, training, planRefs] = await Promise.all([
		listRuns(),
		loadTrainingContext(),
		listPlanRouteRefs()
	]);
	return attachPlanRoutes(pickBannerWeekView(training.plan, runs, training.calendar), planRefs);
});

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

export const getTimelineRuns = createServerFn({ method: 'GET' }).handler(async () => {
	const [runs, routeIds, groupsRaw] = await Promise.all([
		listRuns(),
		listRouteIds(),
		listActivityGroups()
	]);
	await hydrateBestEfforts(runs);
	const groups = await enrichAllGroupEfforts(groupsRaw, runs);
	return { runs: withMap(runs, routeIds), groups };
});

export const getRunDetail = createServerFn({ method: 'GET' })
	.validator((slug: string) => slug)
	.handler(async ({ data: slug }) => {
		const run = await getRun(slug);
		if (!run) return null;
		const routeId = routeIdForRun(run);
		const [
			geo,
			routeIds,
			gear,
			settings,
			allTimeMaxHr,
			allRuns,
			plannedRoute,
			training,
			group,
			plannedRoutes,
			habits,
			fuelLog
		] = await Promise.all([
			routeId ? getRouteGeoJson(routeId) : Promise.resolve(null),
			listRouteIds(),
			loadGear(),
			loadSettings(),
			getMaxHrAllTime(),
			listRuns(),
			getActivityRouteRef(slug),
			loadTrainingContext(),
			membershipForSlug(slug),
			listPlannedRoutes(),
			loadActivityHabits(),
			loadFuelLog()
		]);
		const analytics = geo
			? analyticsFromProperties(
					geo && typeof geo === 'object'
						? ((geo as { properties?: unknown }).properties ?? null)
						: null
				)
			: null;
		const gps = diagnoseGps(geo ? samplesFromGeoJson(geo) : []);
		await hydrateBestEfforts(allRuns);
		const current = allRuns.find((r) => r.slug === slug) ?? run;
		const highlights = highlightsForActivity(current.slug, current.activity_type, allRuns);
		const allGroups = await listActivityGroups();
		const groupedSlugs = new Set(allGroups.flatMap((g) => g.member_slugs));

		// HR zones honour a manually-set HRmax; otherwise the all-time max across activities
		// (never just this one run's noisy peak). Time-in-zone needs the stored per-point HR
		// series — present for newer imports, absent for older ones (falls back to avg-zone).
		const hrMaxManual = settings.hrMax;
		const out = withEffectiveHrZones(analytics, {
			avgHr: run.avg_hr,
			hrMaxManual,
			hrMaxAllTime: allTimeMaxHr
		});

		const groupOptions = allRuns
			.filter((r) => r.slug !== slug)
			.map((r) => ({
				slug: r.slug,
				date: r.date,
				start_time: r.start_time,
				activity_type: r.activity_type,
				distance_km: r.distance_km,
				grouped: groupedSlugs.has(r.slug)
			}));

		const gpsContextTracks = group
			? (
					await Promise.all(
						group.member_slugs
							.filter((s) => s !== slug)
							.map(async (s) => {
								const sibling = allRuns.find((r) => r.slug === s);
								if (!sibling) return null;
								const id = routeIdForRun(sibling);
								if (!id) return null;
								const siblingGeo = await getRouteGeoJson(id);
								const coords = trackFromGeoJson(siblingGeo).coords;
								if (coords.length < 2) return null;
								return {
									slug: s,
									label: `${sibling.date}${sibling.start_time ? ` · ${sibling.start_time}` : ''} ${activityLabel(sibling.activity_type)}`,
									coords
								};
							})
					)
				).filter((t): t is { slug: string; label: string; coords: [number, number][] } => t != null)
			: [];

		return {
			run: { ...current, has_map: runHasMap(current, routeIds) } as RunWithMap,
			analytics: out,
			gps,
			gear,
			gearWear: wearByAllGear(allRuns),
			hrMaxManual,
			hrMaxAllTime: allTimeMaxHr,
			bestEfforts: highlights,
			plannedRoute,
			repairRoutes: plannedRoutes
				.filter((r) => r.point_count >= 2)
				.map((r) => ({ slug: r.slug, name: r.name, distance_km: r.distance_km })),
			gpsContextTracks,
			calendar: training.calendar,
			group,
			groupOptions,
			habits,
			fuel: fuelLog.entries.filter((e) => e.slug === slug)
		};
	});

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

function historyWindowPhrase(range: DateRange): string {
	return range.label.toLowerCase();
}

function isImportNote(n: string): boolean {
	return /^imported from/i.test(n.trim());
}

function byDateNewestFirst(a: RunRecord, b: RunRecord) {
	if (a.date !== b.date) return a.date > b.date ? -1 : 1;
	return (a.slug ?? '') > (b.slug ?? '') ? -1 : (a.slug ?? '') < (b.slug ?? '') ? 1 : 0;
}

function formatWeekNumberRange(weeks: number[]): string {
	if (!weeks.length) return '';
	const ranges: [number, number][] = [];
	let lo = weeks[0]!;
	let hi = weeks[0]!;
	for (let i = 1; i < weeks.length; i++) {
		const n = weeks[i]!;
		if (n === hi + 1) hi = n;
		else {
			ranges.push([lo, hi]);
			lo = hi = n;
		}
	}
	ranges.push([lo, hi]);
	return ranges.map(([a, b]) => (a === b ? `Week ${a}` : `Weeks ${a}–${b}`)).join(', ');
}

function weekHasSessions(w: PlanWeek | undefined): boolean {
	return (w?.sessions?.length ?? 0) > 0;
}

/**
 * Compact plan for the coach brief: up to two previous weeks as one line per session (with
 * done / skipped states). The week to plan lives only in the reply JSON, never twice.
 */
function formatTrainingPlanBrief(
	plan: PlanWeek[],
	targetWeek: number,
	cal: PlanCalendar,
	runs: RunRecord[],
	today: Date
): string {
	const byWeek = new Map(plan.map((w) => [w.week, w]));
	const previous = plan
		.filter((x) => x.week < targetWeek && weekHasSessions(x))
		.sort((a, b) => b.week - a.week)
		.slice(0, 2)
		.sort((a, b) => a.week - b.week);

	const emptyFuture: number[] = [];
	const filledFuture: number[] = [];
	for (let n = targetWeek + 1; n <= cal.weekCount; n++) {
		if (weekHasSessions(byWeek.get(n))) filledFuture.push(n);
		else emptyFuture.push(n);
	}

	const parts = previous.map((w) =>
		formatWeekPlanMarkdown(
			buildWeekView({ ...w, dates: planWeekDateRange(w.week, cal) }, runs, cal, today)
		).replace(/^## /, '### ')
	);
	parts.push(`Week ${targetWeek} is the week to plan — its JSON is under When you reply.`);
	if (emptyFuture.length) parts.push(`${formatWeekNumberRange(emptyFuture)}: not planned yet.`);
	if (filledFuture.length) {
		parts.push(
			`${formatWeekNumberRange(filledFuture)} already have sessions in the plan file — omitted here; do not copy them into this week's JSON.`
		);
	}
	return parts.join('\n');
}

function notesForBriefRow(r: RunRecord): string {
	if (normalizeActivityType(r.activity_type) === 'strength') {
		const p = parseStrengthNotes(r.notes);
		const extra = isImportNote(p.extra) ? '' : p.extra.replace(/\s+/g, ' ').trim().slice(0, 60);
		return [strengthCompact(p.exercises), extra].filter(Boolean).join(' — ').replace(/\|/g, '/');
	}
	const notesText = isImportNote(r.notes || '') ? '' : r.notes || '';
	return notesText.replace(/\s+/g, ' ').replace(/\|/g, '/').trim().slice(0, 140);
}

/** Activity table row; strength shows duration in the metric column and lifts in Notes. */
function briefTableRow(r: RunRecord): string {
	const isStrength = normalizeActivityType(r.activity_type) === 'strength';
	const metric = isStrength ? r.time?.trim() || '–' : metricText(r);
	const km = isStrength ? '–' : (r.distance_km ?? '–');
	return `| ${r.date} | ${activityLabel(r.activity_type)} | ${km} | ${metric} | ${hrCell(r)} | ${feelCell(r)} | ${notesForBriefRow(r)} |`;
}

const BRIEF_TABLE_HEAD = `| Date | Type | km | pace/speed/time | HR avg/max | Feel | Notes |
|------|------|----|-----------|-----------|------|-------|`;

function catalogLinesForBrief(catalog: GearCatalog, kind: GearKind, runs: RunRecord[]): string[] {
	const wear = wearByAllGear(runs)[kind];
	const meta = gearMeta(kind);
	const line = (name: string) => {
		const w = wear[gearKey(name)];
		if (!w || w.count <= 0) return name;
		return `${name} — ${formatGearKm(w.km)} (${activityCount(w.count, meta.wearSport)})`;
	};
	const rotationRest = catalog.rotation.filter((n) => gearKey(n) !== gearKey(catalog.active));
	return [
		catalog.active ? `- ${meta.activeLabel}: ${line(catalog.active)}` : '',
		rotationRest.length ? `- Rotation: ${rotationRest.map(line).join('; ')}` : ''
	].filter(Boolean);
}

function gearSectionForBrief(gear: GearContext, runs: RunRecord[]): string {
	const blocks: string[] = [];
	for (const kind of GEAR_KINDS) {
		const catalog = gear[kind];
		const lines = catalogLinesForBrief(catalog, kind, runs);
		const notes = catalog.notes.trim();
		if (!lines.length && !notes) continue;
		const meta = gearMeta(kind);
		blocks.push(
			`### ${meta.section} — ${meta.label}\n${[...lines, notes].filter(Boolean).join('\n')}`
		);
	}
	if (!blocks.length) return '';
	return `## Gear
Mileage is counted from logged activities. Imports do not include gear.

${blocks.join('\n\n')}`;
}

export const getGearData = createServerFn({ method: 'GET' }).handler(async () => {
	const [gear, runs, habits, wardrobe] = await Promise.all([
		loadGear(),
		listRuns(),
		loadActivityHabits(),
		loadWardrobe()
	]);
	return { gear, gearWear: wearByAllGear(runs), habits, wardrobe };
});

/** Detailed activity rows default to the last 30 days; older history is summarised in tiers. */
const DEFAULT_BRIEF_RANGE: RangeKind = '30d';

const HOW_TO_READ = `Goal and Timing come from the booked race and calendar I set. Look-aheads are not races — they constrain the horizon, they do not set race day. Every section with numbers (summary, paces, weekly/monthly volume, activity log, lift tops) is auto-computed from my logs and is **current**. Body notes and Notes from me are hand-written by me. ${BODY_SAFETY_RULE}`;

/** All-time facts computed from every activity; body trend lines only when scores exist. */
function allTimeSummarySection(allRuns: RunRecord[]): string {
	if (!allRuns.length) return '';
	const runsAll = allRuns.filter((r) => normalizeActivityType(r.activity_type) === 'run');
	const firstDate = allRuns.reduce((min, r) => (r.date < min ? r.date : min), allRuns[0]!.date);
	const totalRunKm = Math.round(runsAll.reduce((a, r) => a + (r.distance_km ?? 0), 0));
	const longest = runsAll.reduce<RunRecord | null>(
		(best, r) => ((r.distance_km ?? 0) > (best?.distance_km ?? 0) ? r : best),
		null
	);
	const avg = (arr: number[]) =>
		arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null;
	const bodyLines = bodyScoreTracks(runsAll).map((t) => {
		const scores = t.points.map((p) => p.score).reverse();
		const recent = avg(scores.slice(0, 4));
		const prior = avg(scores.slice(4, 8));
		return `- ${t.area} trend (0–10, lower = better): last 4 runs avg ${recent}${prior != null ? ` vs prior 4 ${prior}` : ''}.`;
	});
	const lines = [
		`- Logged since ${firstDate}: ${sportVolume(allRuns)}.`,
		longest?.distance_km
			? `- Longest run: ${longest.distance_km} km (${longest.avg_pace || '—'}/km) on ${longest.date}.`
			: '',
		runsAll.length ? `- Running total: ${totalRunKm} km.` : '',
		personalBestsLine(allRuns),
		...bodyLines
	].filter(Boolean);
	return `## All-time summary\n${lines.join('\n')}`;
}

/** Median clock start of recent outdoor sessions, e.g. "07:10", or null when unknown. */
function typicalStartTime(runs: RunRecord[]): string | null {
	const mins = [...runs]
		.filter((r) => normalizeActivityType(r.activity_type) !== 'strength')
		.sort(byDateNewestFirst)
		.slice(0, 20)
		.map((r) => /^(\d{1,2}):(\d{2})/.exec(r.start_time ?? ''))
		.filter((m): m is RegExpExecArray => m != null)
		.map((m) => Number(m[1]) * 60 + Number(m[2]))
		.sort((a, b) => a - b);
	if (mins.length < 3) return null;
	const mid = mins[Math.floor(mins.length / 2)]!;
	const rounded = Math.round(mid / 10) * 10;
	return `${String(Math.floor(rounded / 60) % 24).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}`;
}

function forecastSectionForBrief(
	forecast: { date: string; line: string }[],
	weekPhrase: string,
	hasWardrobe: boolean,
	startTime: string | null
): string {
	if (!forecast.length) return '';
	const kitRule = hasWardrobe ? ' Use it with My clothing to suggest kit per session.' : '';
	const when = startTime
		? ` My sessions usually start around ${startTime} — weigh the temperature for that time of day.`
		: '';
	return `## Forecast (${weekPhrase}, home location, auto-fetched)
Daily range.${when}${kitRule} Days past the forecast horizon are missing; do not guess them.
${forecast.map((f) => `- ${f.line}`).join('\n')}`;
}

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
		const kitReply = hasWardrobe
			? ` In the prose, give each run, walk, and bike session a one-line **Kit:** from My clothing${forecast.length ? ' for that day’s forecast' : ''} (long or wet runs → long-run-safe bottoms). Keep kit out of the JSON. If the weather calls for something I don’t own, say so once.`
			: '';
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
Give your assessment and ${weekPhrase}'s sessions in prose.${kitReply} Then, so I can save it straight back into my app, also output **${weekPhrase} as one JSON object** in exactly this shape (real values, same keys). ${replyRules}

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

function hasFeel(r: RunRecord): boolean {
	return (
		r.effort != null ||
		r.body_scores.length > 0 ||
		r.legs != null ||
		r.energy != null ||
		r.wanted_faster != null ||
		(r.surface ?? '').trim() !== '' ||
		(normalizeActivityType(r.activity_type) !== 'strength' &&
			(r.notes ?? '').trim() !== '' &&
			!isImportNote(r.notes))
	);
}

/** No scores and no real write-up yet — still waiting on After an activity. */
function stillNeedsDebrief(r: RunRecord): boolean {
	if (
		r.effort != null ||
		r.body_scores.length > 0 ||
		r.legs != null ||
		r.energy != null ||
		r.wanted_faster != null ||
		(r.surface ?? '').trim() !== ''
	) {
		return false;
	}
	if (normalizeActivityType(r.activity_type) === 'strength') {
		const extra = parseStrengthNotes(r.notes).extra.trim();
		return !extra || isImportNote(extra);
	}
	const notes = (r.notes ?? '').trim();
	return !notes || isImportNote(notes);
}

function formatRunBriefLine(r: RunRecord): string {
	const feel = feelCell(r);
	const notes = notesForBriefRow(r);
	const km =
		normalizeActivityType(r.activity_type) === 'strength' ? '' : ` ${r.distance_km ?? '–'} km`;
	return `- ${r.date} (${r.day || '—'}) ${activityLabel(r.activity_type)}${km} · ${metricText(r)} · HR ${r.avg_hr ?? '–'}/${r.max_hr ?? '–'} · feel ${feel}${notes ? ` · ${notes}` : ''} · slug \`${r.slug}\``;
}

const DEBRIEF_SPLITS_CHUNK_KM = 5;

function formatSplitBit(s: RouteAnalytics['splits'][number]): string {
	const km = s.isPartial ? s.distanceKm.toFixed(2) : String(s.km);
	const pace = s.pace || '—';
	const hr = s.avgHr != null ? ` HR${s.avgHr}` : '';
	return `${km} ${pace}${hr}`;
}

function splitKmLabel(s: RouteAnalytics['splits'][number]): string {
	return s.isPartial ? s.distanceKm.toFixed(2) : String(s.km);
}

/** One line per 5 km — compact but scannable in the debrief prompt. */
function formatKmSplitsLines(splits: RouteAnalytics['splits']): string[] {
	if (!splits.length) return [];
	const lines: string[] = [];
	for (let i = 0; i < splits.length; i += DEBRIEF_SPLITS_CHUNK_KM) {
		const chunk = splits.slice(i, i + DEBRIEF_SPLITS_CHUNK_KM);
		const first = chunk[0]!;
		const last = chunk[chunk.length - 1]!;
		const start = splitKmLabel(first);
		const end = splitKmLabel(last);
		const range = start === end ? start : `${start}–${end}`;
		lines.push(`Pace km ${range}: ${chunk.map(formatSplitBit).join(' · ')}`);
	}
	return lines;
}

function formatHrZonesLine(analytics: RouteAnalytics | null): string {
	const zones = analytics?.hrZones;
	if (!zones) return '';
	const source =
		zones.source === 'profile'
			? 'saved'
			: zones.source === 'alltime'
				? 'all-time max'
				: "this activity's max";
	const head = `HR zones (HRmax ${zones.hrMax}, ${source})`;
	const bits = (zones.distribution ?? [])
		.filter((z) => z.pct > 0)
		.map((z) => `Z${z.zone} ${z.pct}%`);
	if (bits.length) return `${head}: ${bits.join(' · ')}`;
	if (zones.avgZone != null && zones.avgHr != null) {
		return `${head}: avg ${zones.avgHr} → Z${zones.avgZone}`;
	}
	return '';
}

function formatBestEffortsLine(r: RunRecord): string {
	if (!supportsBestEfforts(r.activity_type) || !r.best_efforts?.length) return '';
	const bits = [...r.best_efforts]
		.sort((a, b) => a.meters - b.meters)
		.map((e) => `${distanceLabel(e.key)} ${formatEffortTime(e.seconds)}`);
	return bits.length ? `Best efforts: ${bits.join(' · ')}` : '';
}

function formatDebriefGpsFacts(r: RunRecord): string {
	const t = normalizeActivityType(r.activity_type);
	const parts: string[] = [];
	if (t !== 'strength' && r.distance_km != null) parts.push(`${r.distance_km} km`);
	if (r.time) parts.push(`moving ${r.time}`);
	if (r.elapsed_time && r.elapsed_time !== r.time) parts.push(`elapsed ${r.elapsed_time}`);
	if (t === 'bike') {
		const speed = metricText(r);
		if (speed && !speed.startsWith('—')) parts.push(speed);
	} else if (showsField(r.activity_type, 'pace') && r.avg_pace) {
		parts.push(`${r.avg_pace}/km`);
	}
	if (showsField(r.activity_type, 'elevation') && r.elev_gain != null) {
		parts.push(`+${r.elev_gain} m`);
	}
	if (showsField(r.activity_type, 'hr') && (r.avg_hr != null || r.max_hr != null)) {
		parts.push(`HR ${r.avg_hr ?? '–'}/${r.max_hr ?? '–'}`);
	}
	if (showsField(r.activity_type, 'cadence') && r.cadence != null) {
		parts.push(`cadence ${r.cadence}`);
	}
	return parts.join(' · ');
}

function formatDebriefFeatured(r: RunRecord, analytics: RouteAnalytics | null): string {
	const head = `- ${r.date} (${r.day || '—'}) ${activityLabel(r.activity_type)} · slug \`${r.slug}\``;
	const extra = [
		formatDebriefGpsFacts(r),
		...(analytics ? formatKmSplitsLines(analytics.splits) : []),
		formatHrZonesLine(analytics),
		formatBestEffortsLine(r)
	].filter(Boolean);
	if (!extra.length) return head;
	return [head, ...extra.map((line) => `  ${line}`)].join('\n');
}

function parseDebriefSlugs(raw: string): string[] {
	return [
		...new Set(
			raw
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean)
		)
	];
}

function compareDebriefRuns(a: RunRecord, b: RunRecord) {
	if (a.date !== b.date) return a.date < b.date ? -1 : 1;
	const ta = a.start_time || '';
	const tb = b.start_time || '';
	if (ta !== tb) return ta < tb ? -1 : 1;
	return (a.slug ?? '').localeCompare(b.slug ?? '');
}

/**
 * Same-day companions (AM+PM commutes) plus other this-week logs that still
 * need a write-up — so an earlier import this week is not dropped when a later
 * slug is in the URL.
 */
function expandDebriefFeatured(
	seed: RunRecord[],
	pool: RunRecord[],
	weekStart: string,
	weekEnd: string
): RunRecord[] {
	if (!seed.length) return [];
	const dates = new Set(seed.map((r) => r.date));
	const bySlug = new Map<string, RunRecord>();
	for (const r of pool) {
		const sameDay = dates.has(r.date);
		const pendingThisWeek =
			Boolean(weekStart) && r.date >= weekStart && r.date <= weekEnd && stillNeedsDebrief(r);
		if (sameDay || pendingThisWeek) bySlug.set(r.slug, r);
	}
	// URL slugs are a hint, not a lock — once feel is saved, drop them unless still pending.
	for (const r of seed) {
		if (stillNeedsDebrief(r)) bySlug.set(r.slug, r);
	}
	return [...bySlug.values()].sort(compareDebriefRuns);
}

export type DebriefRaceHint =
	| {
			kind: 'match';
			goalId: string;
			goalName: string;
			pinned: boolean;
			missingMedalDetails: boolean;
			bib_number: string;
			result_url: string;
			medal_notes: string;
	  }
	| { kind: 'race_no_goal' };

function debriefRaceHint(
	run: RunRecord,
	goals: import('$lib/types').Goal[]
): DebriefRaceHint | null {
	const open = goals.find(
		(g) => g.status !== 'done' && activityLooksLikeRace(g, run) && canPinRaceResult(g)
	);
	if (open) {
		return {
			kind: 'match',
			goalId: open.id,
			goalName: open.name,
			pinned: false,
			missingMedalDetails: false,
			bib_number: open.bib_number,
			result_url: open.result_url,
			medal_notes: open.medal_notes
		};
	}
	const done = goals.find((g) => g.status === 'done' && g.result?.activity_slug === run.slug);
	if (done) {
		const missing = !done.bib_number.trim() || !done.result_url.trim() || !done.medal_notes.trim();
		return {
			kind: 'match',
			goalId: done.id,
			goalName: done.name,
			pinned: true,
			missingMedalDetails: missing,
			bib_number: done.bib_number,
			result_url: done.result_url,
			medal_notes: done.medal_notes
		};
	}
	if (run.session === 'race') return { kind: 'race_no_goal' };
	return null;
}

function debriefRunSummary(r: RunRecord) {
	return {
		slug: r.slug,
		date: r.date,
		day: r.day,
		distance_km: r.distance_km,
		start_time: r.start_time,
		avg_pace: r.avg_pace,
		hasFeel: hasFeel(r),
		activity_type: r.activity_type,
		session: r.session,
		cadence: r.cadence,
		gear: r.gear,
		effort: r.effort,
		body_scores: r.body_scores,
		legs: r.legs,
		energy: r.energy,
		wanted_faster: r.wanted_faster,
		surface: r.surface,
		notes: r.notes,
		before_notes: r.before_notes,
		after_notes: r.after_notes
	};
}

type PlannedMatch =
	{ kind: 'planned'; session: WeekSessionView } | { kind: 'unplanned' } | { kind: 'missing' };

/** The plan session this activity filled, or why there is none. */
function plannedSessionForActivity(
	run: RunRecord,
	plan: PlanWeek[],
	runs: RunRecord[],
	cal: PlanCalendar
): PlannedMatch {
	const weekNum = weekNumberForDate(run.date, cal);
	const planWeek = weekNum != null ? plan.find((w) => w.week === weekNum) : undefined;
	if (!planWeek?.sessions?.length) return { kind: 'missing' };
	const view = buildWeekView(planWeek, runs, cal);
	const session = view.sessions.find((s) => s.logSlug === run.slug);
	if (session) return { kind: 'planned', session };
	if (view.unplanned.some((u) => u.slug === run.slug)) return { kind: 'unplanned' };
	return { kind: 'missing' };
}

function formatPlannedForActivity(run: RunRecord, match: PlannedMatch): string {
	const head = `- ${run.date} ${activityLabel(run.activity_type)} (slug \`${run.slug}\`)`;
	if (match.kind === 'unplanned') {
		return `${head}: Unplanned — no session was planned for this day and sport. Coach it as extra load.`;
	}
	if (match.kind === 'missing') {
		return `${head}: Can't find a planned session for this activity — no plan covers this date.`;
	}
	const s = match.session;
	const km = s.distance_km != null ? ` · ${s.distance_km} km planned` : '';
	const lines = [`${head}: **${s.label}**${km}`];
	if (s.workout) {
		lines.push(`  Summary: ${workoutSummary(s.workout)}`);
		lines.push('  Steps:');
		lines.push(workoutMarkdown(s.workout, '    '));
	}
	if (s.exercises?.length) {
		lines.push(
			`  Lifts: ${s.exercises
				.map(
					(e) =>
						`${e.name} ${e.sets}×${e.sec != null ? `${e.sec}s` : e.reps}${e.kg != null ? ` @ ${e.kg}kg` : ''}`
				)
				.join('; ')}`
		);
	}
	if (s.detail.trim()) lines.push(`  Intent: ${s.detail.trim()}`);
	return lines.join('\n');
}

function formatFeelLogged(r: RunRecord, areas: BodyArea[]): string {
	const body = showsFeel(r.activity_type, 'body')
		? bodyScoreRows(r.body_scores, areas).map((row) => `${row.area} ${row.score ?? '–'}`)
		: [];
	const scores = [
		`effort ${r.effort ?? '–'}`,
		...body,
		`legs ${r.legs ?? '–'}`,
		`energy ${r.energy ?? '–'}`
	];
	if (showsFeel(r.activity_type, 'wanted_faster')) {
		scores.push(
			`wanted faster ${r.wanted_faster === true ? 'yes' : r.wanted_faster === false ? 'no' : '–'}`
		);
	}
	const surface = (r.surface ?? '').trim();
	const manual: string[] = [];
	if (normalizeActivityType(r.activity_type) === 'run') {
		manual.push(`session ${r.session || '–'}`);
		manual.push(`cadence ${r.cadence ?? '–'}`);
	}
	if (showsField(r.activity_type, 'gear') && (r.gear ?? '').trim()) {
		manual.push(`gear ${r.gear}`);
	} else if (showsField(r.activity_type, 'gear')) {
		manual.push('gear –');
	}
	const manualBit = manual.length ? ` · ${manual.join(' · ')}` : '';
	return `- \`${r.slug}\`: ${scores.join(' · ')}${surface ? ` · surface ${surface}` : ''}${manualBit}`;
}

/** `{ "Shins": 2, "Left knee": 1 }` for the open body notes, or null when there are none. */
function bodyScoresExample(areas: BodyArea[]): Record<string, number> | null {
	if (!areas.length) return null;
	return Object.fromEntries(areas.map((a, i) => [a.area, i === 0 ? 2 : 1]));
}

/** One `feelings` row per featured activity — only the keys that apply to its sport. */
function feelingsExample(runs: RunRecord[], areas: BodyArea[]): unknown {
	const body = bodyScoresExample(areas);
	const row = (r: RunRecord) => ({
		slug: r.slug,
		...(normalizeActivityType(r.activity_type) === 'run' ? { session: 'easy' } : {}),
		effort: 6,
		...(showsFeel(r.activity_type, 'body') && body ? { body_scores: body } : {}),
		legs: 4,
		energy: 7,
		...(showsFeel(r.activity_type, 'wanted_faster') ? { wanted_faster: false } : {}),
		...(showsField(r.activity_type, 'surface') ? { surface: 'asphalt' } : {}),
		...(showsField(r.activity_type, 'gear') ? { gear: 'shoe name' } : {}),
		notes: 'Short first-person summary of What I wrote.'
	});
	if (!runs.length) return { slug: '…', notes: '…' };
	return runs.length === 1 ? row(runs[0]!) : runs.map(row);
}

export const getDebriefPrompt = createServerFn({ method: 'GET' })
	.validator((d: { slug?: string; includePlan?: boolean } | string) => {
		if (typeof d === 'string') return { slug: d, includePlan: false };
		return {
			slug: typeof d?.slug === 'string' ? d.slug : '',
			includePlan: d?.includePlan === true
		};
	})
	.handler(async ({ data }) => {
		const { slug, includePlan } = data;
		const [
			allRuns,
			week,
			profile,
			settings,
			training,
			gearInventory,
			allTimeMaxHr,
			habits,
			fuelLog
		] = await Promise.all([
			listRuns(),
			currentPlanWeek(),
			loadProfile(),
			loadSettings(),
			loadTrainingContext(),
			loadGear(),
			getMaxHrAllTime(),
			loadActivityHabits(),
			loadFuelLog()
		]);
		const { goals } = training.store;
		const { calendar } = training;
		const weekView = week ? buildWeekView(week, allRuns, calendar) : null;
		const weekStart = week ? planWeekStartIso(week.week, calendar) : '';
		let weekEnd = weekStart;
		if (weekStart) {
			const end = new Date(`${weekStart}T12:00:00`);
			end.setDate(end.getDate() + 6);
			weekEnd = isoDateLocal(end);
		}
		const requested = parseDebriefSlugs(slug);
		const featuredUnsorted = requested.length
			? requested
					.map((s) => allRuns.find((r) => r.slug === s) ?? null)
					.filter((r): r is RunRecord => r != null)
			: weekStart
				? (() => {
						const row = allRuns.find((r) => r.date >= weekStart && r.date <= weekEnd);
						return row ? [row] : [];
					})()
				: [];
		const featured = expandDebriefFeatured(featuredUnsorted, allRuns, weekStart, weekEnd);
		if (!featured.length) {
			return {
				prompt: '',
				run: null,
				runs: [],
				raceBySlug: {} as Record<string, DebriefRaceHint | null>,
				gear: gearInventory,
				gearWear: wearByAllGear(allRuns),
				habits,
				weekView,
				error: 'Import this session’s GPX first — the prompt needs those numbers.'
			};
		}

		const storedAnalytics = await Promise.all(featured.map((r) => loadRouteAnalytics(r)));
		const featuredAnalytics = featured.map((r, i) =>
			withEffectiveHrZones(storedAnalytics[i] ?? null, {
				avgHr: r.avg_hr,
				hrMaxManual: settings.hrMax,
				hrMaxAllTime: allTimeMaxHr
			})
		);

		const weekRuns = weekStart
			? allRuns.filter((r) => r.date >= weekStart && r.date <= weekEnd).sort(byDateNewestFirst)
			: [];
		const featuredSlugs = new Set(featured.map((r) => r.slug));
		const otherThisWeek = weekRuns.filter((r) => !featuredSlugs.has(r.slug));
		const sessionLines =
			weekView?.sessions
				.map((s) => {
					const state = s.done
						? 'done'
						: s.skipped
							? 'skipped'
							: s.unlogged
								? 'unlogged — no activity logged yet, do not assume skipped'
								: s.isNext
									? 'next'
									: 'upcoming';
					const steps = s.workout ? `${workoutSummary(s.workout)}. ` : '';
					return `- ${s.day}${s.date ? ` (${s.date})` : ''}: ${activityLabel(s.activity_type ?? 'run')} · ${s.label}${s.distance_km != null ? ` · ${s.distance_km} km` : ''} — ${steps}${s.detail} [${state}]`;
				})
				.join('\n') ?? '- (no plan week)';
		const unplannedLines = weekView?.unplanned.length
			? formatUnplannedBrief(weekView.unplanned)
			: '';

		const scoreAreas = openBodyAreas(profile.body);
		const easyPace =
			typicalEasyPace(buildPaceProfile(allRuns, training.medals, isoDateLocal(new Date()))) ??
			'M:SS';
		const many = featured.length > 1;
		const sessionWord = many ? 'these sessions' : 'this session';
		const sessionHeading = many ? 'These sessions' : 'This session';
		const sessionBlock = featured
			.map((r, i) => formatDebriefFeatured(r, featuredAnalytics[i] ?? null))
			.join('\n');
		const feelBlock = featured.map((r) => formatFeelLogged(r, scoreAreas)).join('\n');
		const plannedHeading = many ? 'Planned for these sessions' : 'Planned for this session';
		const plannedBlock = featured
			.map((r) =>
				formatPlannedForActivity(r, plannedSessionForActivity(r, training.plan, allRuns, calendar))
			)
			.join('\n');
		const compareLine = `Compare what I did against **${plannedHeading}**: did each step hit its target pace or effort (use the km splits and HR in the session block), and did I cut it short or add to it? If it says Unplanned, coach it as extra load. If no plan covers the date, do not call it unplanned.`;
		const job = includePlan
			? `Coach from ${sessionWord}: how it went, recovery, and what to watch. ${compareLine} Answer any questions I asked in What I wrote. Then update **this week** only if remaining sessions should change. Remaining sessions may move to any day my day limits allow, or be dropped, if recovery or the goal calls for it — say why. Never move or drop a **pinned** activity.`
			: `Coach from ${sessionWord}: how it went, recovery, and what to watch. ${compareLine} Answer any questions I asked in What I wrote. **Same rules and context as the week brief earlier in this chat** (plan, body notes, habits, fuel, day limits, workout JSON shape) — use those, they are not repeated here. If remaining sessions should change, include an updated \`week\` in your JSON reply.`;
		const planSections = includePlan
			? joinSections(
					`## Current week plan${week ? ` — week ${week.week} (${planWeekDateRange(week.week, calendar)}) · ${week.phase} · ${week.focus}` : ''}\n${sessionLines}`,
					unplannedLines
						? `## Unplanned activities this week\nThese logs did not match a planned session — extra load, already done. Do not add a plan row just to file them.\n${unplannedLines}`
						: ''
				)
			: '';
		const fuelNames = fuelItemNames(fuelLog);
		const bodyAreas = profile.body.notes.map((n) => n.area);
		const rules = [
			'- `feelings.notes` is a **short** first-person summary of What I wrote (about 2–5 sentences) for the activity log. Keep my voice and the useful specifics (body, shoes, questions you answered). Do **not** paste the whole write-up. Omit `notes` if I wrote nothing. For strength, notes are extra commentary only — never rewrite the lift list.',
			"- Before/after in **This session's habits** are what I actually did — ground truth. Do not copy those rituals into `feelings.notes` or into week `detail`.",
			`- Scores marked – were not tapped in the app. Infer effort / legs / energy${scoreAreas.length ? ' / body scores' : ''} (and wanted_faster / surface) from What I wrote when the text is clear enough for a number; otherwise omit the field. Do not invent from GPS. If How I felt already has a number, omit that field. Do not copy example numbers. Only include keys shown in the example for that activity.`,
			scoreAreas.length
				? `- \`body_scores\` (runs/walks): one 0–10 score per body area (higher = worse), keyed by the exact area name: ${scoreAreas.map((a) => a.area).join(', ')}. Only include areas I mentioned; omit the key if none.`
				: '',
			'- `session` (runs only): easy / quality / long / race / … — keep mine if already set; infer only when obvious. `cadence` (runs only, steps per minute) and `gear` (shoe or bike name): only if I gave them; never invent.',
			`- \`fuel\`: **only** when What I wrote mentions food or drink before, during, or after ${sessionWord} — otherwise omit it. One entry per item + phase + timing; \`phase\` before / during / after; \`timing\` in my words; \`outcome\` good / mixed / bad from what I said (cramps, stitch, nausea → bad; no complaint → good); \`notes\` short. Never invent food.${fuelNames.length ? ` Reuse an exact name from my known items when it is the same thing: ${fuelNames.join(', ')}.` : ''} If you include \`fuel\`, end your prose by asking whether I want these saved (the app asks me before saving).`,
			`- \`body\`: **only** when What I wrote mentions new or changed pain, or something that has cleared up — otherwise omit it. One entry per area; \`status\` active / monitoring / resolved; \`trigger\` and \`helps\` short, in my words.${bodyAreas.length ? ` Reuse an exact area name when it is the same place: ${bodyAreas.join(', ')}.` : ''} The app asks me before saving.`,
			includePlan
				? `- \`week.sessions\` is the **full week** from Current week plan: keep completed/skipped rows as they were, rewrite what's still ahead. Every session needs \`"activity_type"\`. Only move a day if you must, and say why. If the week is finished, return the rows unchanged. ${SKIP_STATUS_PROMPT}`
				: `- **Week updates:** if anything still ahead should change, include \`week\` (full week from this chat, \`activity_type\` on every session, completed/skipped rows kept as they were); otherwise omit it. ${SKIP_STATUS_PROMPT}`,
			includePlan ? `- ${runSessionPrompt(easyPace)}` : '',
			includePlan ? `- ${STRENGTH_SESSION_PROMPT}` : ''
		].filter(Boolean);
		const exampleReply = JSON.stringify({
			feelings: feelingsExample(featured, scoreAreas),
			fuel: [
				{
					slug: featured[0]?.slug ?? '',
					phase: 'before',
					item: 'Coffee',
					timing: '20 min before',
					outcome: 'good',
					notes: ''
				}
			],
			body: [
				{ area: bodyAreas[0] ?? 'knee', status: 'monitoring', trigger: 'downhills', helps: '' }
			],
			week: {
				week: week?.week ?? 0,
				dates: week ? planWeekDateRange(week.week, calendar) : '',
				phase: week?.phase ?? '',
				focus: `one-line focus after ${sessionWord}`,
				sessions: [
					{
						day: 'Friday',
						activity_type: 'run',
						label: 'Easy',
						distance_km: 7,
						detail: 'every day of the week, not just this placeholder row',
						workout: {
							type: 'easy',
							blocks: [{ kind: 'run', distance_km: 7, pace: easyPace, effort: 'easy' }]
						}
					}
				]
			}
		});
		const reply = `## When you reply
Lead with coaching advice in prose (how ${sessionWord} went, recovery, and whether anything ahead should change). Answer any questions from What I wrote there. After the advice, output one fenced JSON object I can paste back — the JSON is what I save; the advice is not. \`fuel\`, \`body\` and \`week\` are optional.

\`\`\`json
${exampleReply}
\`\`\`

Rules:
${rules.join('\n')}`;

		const usualWeekSection = includePlan
			? formatWeekSetupDebriefSection(weekSetupFromSettings(settings), {
					includeSlots: week == null
				})
			: '';

		const prompt = tidyPrompt(
			joinSections(
				`# The Long Run — debrief ${sessionWord}`,
				`You are my coach for the sports I train, not a running-only coach. GPS numbers from the import (distance, moving and elapsed time, elevation, pace per km) and how I felt are below.${includePlan ? `\n${feelScale()}` : ''}\n\n${job}`,
				usualWeekSection,
				`## ${sessionHeading}\n${sessionBlock}`,
				`## ${plannedHeading}\n${plannedBlock}`,
				`## How I felt\n– means I did not tap a number. Infer those from What I wrote when the text is clear; keep any number already here.\n${feelBlock}`,
				`## What I wrote\nThis is my own account of ${sessionWord} — as long as I needed, including questions I want answered. Treat it as ground truth. GPS is the device record; if they disagree, mention it but trust how I said it felt.\n\n${DEBRIEF_WRITEUP_TOKEN}`,
				`## This session's habits\nBefore/after as I did them this time — may differ from Usual habits. Treat overrides as ground truth.\n\n${DEBRIEF_HABITS_TOKEN}`,
				section(
					'Other activities already logged this week',
					otherThisWeek.map(formatRunBriefLine).join('\n')
				),
				planSections,
				includePlan ? formatBodyNotesSection(profile.body) : '',
				includePlan ? formatCoachNotesSection(profile.coachNotes) : '',
				includePlan ? formatUsualHabitsSection(habits) : '',
				includePlan ? formatFuelSection(fuelLog, fuelRunRefs(allRuns, fuelLog)) : '',
				includePlan ? BODY_SAFETY_RULE : '',
				reply
			)
		);
		const runs = featured.map(debriefRunSummary);
		const raceBySlug: Record<string, DebriefRaceHint | null> = {};
		for (const r of featured) raceBySlug[r.slug] = debriefRaceHint(r, goals);
		return {
			prompt,
			run: runs[runs.length - 1] ?? null,
			runs,
			raceBySlug,
			gear: gearInventory,
			gearWear: wearByAllGear(allRuns),
			habits,
			weekView,
			error: null as string | null
		};
	});

export type ActivityFeelInput = {
	slug: string;
	effort?: number | null;
	body_scores?: BodyScore[];
	legs?: number | null;
	energy?: number | null;
	wanted_faster?: boolean | null;
	surface?: string;
	notes?: string;
	session?: string;
	cadence?: number | null;
	gear?: string;
	before_notes?: string;
	after_notes?: string;
};

export const saveActivityFeel = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: ActivityFeelInput) => d)
	.handler(async ({ data }) => {
		const patch: FeelingsPatch = {};
		if (data.effort !== undefined) patch.effort = data.effort;
		if (data.body_scores !== undefined) patch.body_scores = validateBodyScores(data.body_scores);
		if (data.legs !== undefined) patch.legs = data.legs;
		if (data.energy !== undefined) patch.energy = data.energy;
		if (data.wanted_faster !== undefined) patch.wanted_faster = data.wanted_faster;
		if (data.surface !== undefined) patch.surface = data.surface.trim();
		if (data.notes !== undefined) patch.notes = data.notes.trim();
		if (data.session !== undefined) patch.session = data.session.trim();
		if (data.cadence !== undefined) patch.cadence = data.cadence;
		if (data.gear !== undefined) patch.gear = data.gear.trim();
		if (data.before_notes !== undefined) patch.before_notes = data.before_notes.trim();
		if (data.after_notes !== undefined) patch.after_notes = data.after_notes.trim();
		const ok = await updateRunFeelings(data.slug, patch);
		if (!ok) throw new Error('Activity not found.');
		if (data.gear !== undefined) {
			const run = await getRun(data.slug);
			if (run) await rememberGearName(run.gear, run.activity_type);
		}
		return { ok: true as const, slug: data.slug };
	});

// ---------- mutations ----------

export type CreateRunInput = {
	date: string;
	activity_type: string;
	session: string;
	effort: number | null;
	body_scores: BodyScore[];
	legs: number | null;
	energy: number | null;
	weather: string;
	surface: string;
	wanted_faster: boolean | null;
	distance_km: number | null;
	start_time: string;
	time: string;
	avg_pace: string;
	avg_hr: number | null;
	max_hr: number | null;
	elev_gain: number | null;
	cadence: number | null;
	gear: string;
	notes: string;
	before_notes?: string;
	after_notes?: string;
};

export const createRun = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: CreateRunInput) => d)
	.handler(async ({ data }) => {
		const date = data.date.trim();
		const session = data.session.trim();
		if (!date || !session) throw new Error('Date and session are required.');
		const day = dayFromIsoDate(date);
		const { calendar } = await loadTrainingContext();
		const week = weekNumberForDate(date, calendar);
		const start_time = normalizeStartTime(data.start_time.trim());
		const time = data.time.trim();
		let weather = data.weather.trim();
		if (!weather) {
			weather = await fetchWeatherForDateTime(
				date,
				start_time || null,
				null,
				null,
				time || null,
				null
			);
		}
		const activity_type = normalizeActivityType(data.activity_type);
		const habits = await loadActivityHabits();
		const ritual = withHabitDefaults(activity_type, habits, {
			before: data.before_notes,
			after: data.after_notes
		});
		const run = await saveRun({
			date,
			week,
			day,
			activity_type,
			session,
			effort: data.effort,
			body_scores: validateBodyScores(data.body_scores),
			legs: data.legs,
			energy: data.energy,
			weather,
			surface: data.surface.trim(),
			wanted_faster: data.wanted_faster,
			distance_km: data.distance_km,
			start_time,
			time,
			avg_pace: data.avg_pace.trim(),
			avg_hr: data.avg_hr,
			max_hr: data.max_hr,
			elev_gain: data.elev_gain,
			cadence: data.cadence,
			gear: data.gear.trim(),
			summary_image: '',
			splits_image: '',
			strava_id: '',
			notes: data.notes,
			before_notes: ritual.before,
			after_notes: ritual.after
		});
		await rememberGearName(run.gear, run.activity_type);
		return { slug: run.slug };
	});

export const importGpx = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: { xml: string; activityType?: string }) => d)
	.handler(async ({ data }) => {
		const parsed = parseActivityFile(data.xml);
		if (!parsed.date) {
			if (parsed.points.length >= 2) {
				throw new Error(
					'This GPX has a track but no timestamps — it looks like a planned BRouter route. Save it from Routes instead of Import.'
				);
			}
			throw new Error('Could not read a date/time from that GPX file.');
		}

		const activity_type = importActivityType(data.activityType || parsed.detectedType);
		const day = dayFromIsoDate(parsed.date);
		const { calendar } = await loadTrainingContext();
		const week = weekNumberForDate(parsed.date, calendar);
		const planWeek = await currentPlanWeek(
			parsed.date ? new Date(`${parsed.date}T12:00:00`) : new Date()
		);
		const session = guessSession(day, parsed.distanceKm, plannedSessionFor(planWeek, day)?.label);

		// Dedup: an activity of the same type on the same day that matches on start time (or,
		// lacking one, on distance) is treated as the same activity — refresh its track in place
		// instead of creating a `-2` duplicate. This also backfills analytics (incl. HR series).
		const sameDay = await findRunsByDate(parsed.date);
		const existingDup =
			sameDay.find(
				(r) =>
					normalizeActivityType(r.activity_type) === activity_type &&
					parsed.startClock &&
					r.start_time &&
					r.start_time === parsed.startClock
			) ??
			sameDay.find(
				(r) =>
					normalizeActivityType(r.activity_type) === activity_type &&
					(!parsed.startClock || !r.start_time) &&
					parsed.distanceKm != null &&
					r.distance_km != null &&
					Math.abs(r.distance_km - parsed.distanceKm) <= 0.2
			) ??
			null;

		let route = existingDup?.route || '';
		if (parsed.points.length >= 2) {
			// Reuse the existing track id when refreshing a duplicate; else mint a new one.
			const id = (existingDup && routeIdForRun(existingDup)) || crypto.randomUUID();
			const geojson = {
				type: 'Feature',
				properties: {
					date: parsed.date,
					sport: activity_type,
					distance_km: parsed.distanceKm,
					point_count: parsed.points.length,
					...(parsed.analytics ? analyticsToProperties(parsed.analytics) : {}),
					...(parsed.points.some((p) => p.timeMs != null)
						? { times: parsed.points.map((p) => p.timeMs ?? null) }
						: {})
				},
				geometry: {
					type: 'LineString',
					coordinates: parsed.points.map((p) =>
						p.elev != null && Number.isFinite(p.elev) ? [p.lng, p.lat, p.elev] : [p.lng, p.lat]
					)
				}
			};
			await saveRouteGeoJson(id, geojson);
			route = existingDup?.route || `/routes/${id}.json`;
		}

		// Matched an existing activity → refresh its map/analytics, keep subjective data, no dup.
		if (existingDup) {
			if (route && route !== existingDup.route) await setRunRoute(existingDup.slug, route);
			await setRunImportMetrics(existingDup.slug, {
				distance_km: parsed.distanceKm,
				time: parsed.time,
				elapsed_time: parsed.elapsedTime,
				avg_pace: parsed.avgPace,
				avg_hr: parsed.avgHr,
				max_hr: parsed.maxHr,
				elev_gain: parsed.elevGain,
				max_speed: parsed.maxSpeed
			});
			if (
				!(existingDup.surface ?? '').trim() &&
				showsField(activity_type, 'surface') &&
				parsed.points.length >= 2
			) {
				const surface = await inferSurfaceFromTrack(parsed.points);
				if (surface) await updateRunFeelings(existingDup.slug, { surface });
			}
			const efforts = supportsBestEfforts(activity_type) ? parsed.bestEfforts : [];
			if (efforts.length) await setRunBestEfforts(existingDup.slug, efforts);
			const highlights = await highlightsAfterSave(existingDup.slug, activity_type, efforts);
			return {
				slug: existingDup.slug,
				activity_type,
				distance_km: parsed.distanceKm,
				has_route: Boolean(route),
				duplicate: true,
				highlights
			};
		}

		const trackPoints =
			showsField(activity_type, 'surface') && parsed.points.length >= 2 ? parsed.points : [];
		const weatherLoc = weatherLocationFromTrack(parsed.points, parsed.startLat, parsed.startLng);
		const [weather, geo, surface] = await Promise.all([
			fetchWeatherForDateTime(
				parsed.date,
				parsed.startClock || null,
				weatherLoc?.lat ?? null,
				weatherLoc?.lon ?? null,
				parsed.time || null
			),
			parsed.startLat != null && parsed.startLng != null
				? reverseGeocode(parsed.startLat, parsed.startLng)
				: Promise.resolve({ country: '', province: '', place: '' }),
			trackPoints.length >= 2 ? inferSurfaceFromTrack(trackPoints) : Promise.resolve('')
		]);

		const kind = gearKindForActivity(activity_type);
		const importedGear = kind ? (await loadGear())[kind].active : '';
		const ritual = withHabitDefaults(activity_type, await loadActivityHabits());

		const run = await saveRun({
			date: parsed.date,
			week,
			day,
			activity_type,
			session,
			effort: null,
			body_scores: [],
			legs: null,
			energy: null,
			weather,
			surface,
			wanted_faster: null,
			distance_km: parsed.distanceKm,
			start_time: parsed.startClock,
			time: parsed.time,
			elapsed_time: parsed.elapsedTime,
			avg_pace: parsed.avgPace,
			avg_hr: parsed.avgHr,
			max_hr: parsed.maxHr,
			elev_gain: parsed.elevGain,
			max_speed: parsed.maxSpeed,
			cadence: null,
			gear: importedGear,
			summary_image: '',
			splits_image: '',
			strava_id: '',
			route,
			notes: 'Imported from GPX.',
			before_notes: ritual.before,
			after_notes: ritual.after,
			country: geo.country,
			province: geo.province,
			place: geo.place,
			best_efforts: supportsBestEfforts(activity_type) ? parsed.bestEfforts : []
		});

		const highlights = await highlightsAfterSave(
			run.slug,
			activity_type,
			supportsBestEfforts(activity_type) ? parsed.bestEfforts : []
		);

		return {
			slug: run.slug,
			activity_type,
			distance_km: parsed.distanceKm,
			has_route: Boolean(route),
			duplicate: false,
			highlights
		};
	});

function activityStartMs(
	run: Pick<RunRecord, 'date' | 'start_time'>,
	samples: { lat: number; lng: number; timeMs?: number }[]
): number | null {
	const timed = samples.find((p) => p.timeMs != null && Number.isFinite(p.timeMs));
	if (timed?.timeMs != null) return timed.timeMs;
	const coord = samples.find((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
	const tz = (coord && timezoneForCoord(coord.lat, coord.lng)) || 'Europe/Amsterdam';
	return localDateTimeToUtcMs(run.date, run.start_time || DEFAULT_START_HHMM, tz);
}

export const repairRunGps = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator(
		(d: {
			slug: string;
			waypoints?: { lat: number; lng: number }[];
			follow_network?: boolean;
			network_coords?: { lat: number; lng: number }[];
			planned_slug?: string;
		}) => d
	)
	.handler(async ({ data }) => {
		const run = await getRun(data.slug);
		if (!run) throw new Error('Activity not found.');

		const pins = normalizeWaypoints(data.waypoints);
		let plannedSlug = data.planned_slug?.trim() || '';
		const attached = await getActivityRouteRef(run.slug);
		if (pins.length < 2) {
			if (plannedSlug && plannedSlug !== attached?.slug) {
				await dbAttachRouteToActivity(plannedSlug, run.slug);
			} else if (!plannedSlug) {
				plannedSlug = attached?.slug ?? '';
			}
		}

		const routeId = routeIdForRun(run);
		const [geo, planned] = await Promise.all([
			routeId ? getRouteGeoJson(routeId) : Promise.resolve(null),
			plannedSlug && pins.length < 2 ? getPlannedRoute(plannedSlug) : Promise.resolve(null)
		]);
		if (plannedSlug && pins.length < 2 && !planned)
			throw new Error('That planned route was not found.');

		let out =
			pins.length >= 2
				? densifyWaypoints(pins)
				: planned
					? samplesFromGeoJson(planned.geojson)
					: [];
		let source: 'waypoints' | 'waypoints-network' | 'planned' =
			pins.length >= 2 ? 'waypoints' : 'planned';

		const previewed = normalizeTrackPoints(data.network_coords);
		if (pins.length >= 2 && data.follow_network) {
			if (previewed.length >= 2) {
				out = previewed;
				source = 'waypoints-network';
			} else {
				const routed = await brouterAlongPins(pins);
				if (routed.length >= 2) {
					out = routed;
					source = 'waypoints-network';
				} else {
					throw new Error(
						'Could not follow roads between those pins. Uncheck Follow roads to save the straight line.'
					);
				}
			}
		}

		if (out.length < 2) {
			throw new Error('Drop at least two waypoints on the map, or pick a saved route.');
		}

		const durationSec = parseDurationSeconds(run.elapsed_time) ?? parseDurationSeconds(run.time);
		const startMs = activityStartMs(run, out);
		const durationMs = durationSec != null && durationSec > 0 ? durationSec * 1000 : null;
		if (startMs != null && durationMs != null) {
			out = stampAlongDistance(out, startMs, durationMs);
		}

		const prevHr = analyticsFromProperties(
			geo && typeof geo === 'object' ? ((geo as { properties?: unknown }).properties ?? null) : null
		)?.hrSamples;
		if (prevHr?.length) {
			out = attachHrSeries(
				out,
				prevHr.map((s) => ({ t: s.t, hr: s.hr }))
			);
		}

		const analytics = computeRouteAnalytics(out, { avgHr: run.avg_hr, maxHr: run.max_hr });
		const id = routeId || crypto.randomUUID();
		const geojson = {
			type: 'Feature',
			properties: {
				date: run.date,
				sport: run.activity_type,
				distance_km: run.distance_km,
				point_count: out.length,
				added_gps: true,
				gps_source: source,
				track_km: Math.round((trackDistanceMeters(out) / 1000) * 100) / 100,
				...(analytics ? analyticsToProperties(analytics) : {}),
				times: out.map((p) => p.timeMs ?? null)
			},
			geometry: {
				type: 'LineString',
				coordinates: out.map((p) =>
					p.elev != null && Number.isFinite(p.elev) ? [p.lng, p.lat, p.elev] : [p.lng, p.lat]
				)
			}
		};
		await saveRouteGeoJson(id, geojson);
		if (!run.route) await setRunRoute(run.slug, `/routes/${id}.json`);

		if (supportsBestEfforts(run.activity_type)) {
			const efforts = computeBestEffortsFromTrack(out);
			if (efforts.length) await setRunBestEfforts(run.slug, efforts);
		}

		return {
			ok: true as const,
			points: out.length,
			source
		};
	});

export const previewGpsNetwork = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: { waypoints: { lat: number; lng: number }[] }) => d)
	.handler(async ({ data }) => {
		const pins = normalizeWaypoints(data.waypoints);
		if (pins.length < 2) return { coords: [] as { lat: number; lng: number }[] };
		const routed = await brouterAlongPins(pins);
		return {
			coords: routed.map((p) =>
				p.elev != null && Number.isFinite(p.elev)
					? { lat: p.lat, lng: p.lng, elev: p.elev }
					: { lat: p.lat, lng: p.lng }
			)
		};
	});

export type UpdateRunInput = {
	slug: string;
	date: string;
	activity_type: string;
	session: string;
	effort: number | null;
	body_scores: BodyScore[];
	legs: number | null;
	energy: number | null;
	weather: string;
	surface: string;
	wanted_faster: boolean | null;
	distance_km: number | null;
	start_time: string;
	time: string;
	avg_pace: string;
	avg_hr: number | null;
	max_hr: number | null;
	elev_gain: number | null;
	cadence: number | null;
	gear: string;
	notes: string;
	before_notes?: string;
	after_notes?: string;
};

export const updateRun = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: UpdateRunInput) => d)
	.handler(async ({ data }) => {
		const date = data.date.trim();
		const session = data.session.trim();
		if (!date || !session) throw new Error('Date and session are required.');
		const day = dayFromIsoDate(date);
		const { calendar } = await loadTrainingContext();
		const week = weekNumberForDate(date, calendar);
		const fields: UpdateRunFields = {
			date,
			week,
			day,
			activity_type: normalizeActivityType(data.activity_type),
			session,
			effort: data.effort,
			body_scores: validateBodyScores(data.body_scores),
			legs: data.legs,
			energy: data.energy,
			weather: data.weather.trim(),
			surface: data.surface.trim(),
			wanted_faster: data.wanted_faster,
			distance_km: data.distance_km,
			start_time: normalizeStartTime(data.start_time.trim()),
			time: data.time.trim(),
			avg_pace: data.avg_pace.trim(),
			avg_hr: data.avg_hr,
			max_hr: data.max_hr,
			elev_gain: data.elev_gain,
			cadence: data.cadence,
			gear: data.gear.trim(),
			notes: data.notes,
			before_notes: data.before_notes?.trim() ?? '',
			after_notes: data.after_notes?.trim() ?? ''
		};
		const run = await dbUpdateRun(data.slug, fields);
		await rememberGearName(run.gear, run.activity_type);
		return { slug: run.slug };
	});

export const deleteRun = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((slug: string) => slug)
	.handler(async ({ data: slug }) => {
		return dbDeleteRun(slug);
	});

export const deleteRunsFn = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: { slugs: string[] }) => d)
	.handler(async ({ data }) => {
		const unique = [...new Set(data.slugs.map((s) => s.trim()).filter(Boolean))];
		if (!unique.length) throw new Error('Pick at least one activity to delete.');
		for (const slug of unique) await dbDeleteRun(slug);
		return { ok: true as const };
	});

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
		const members = groupRaw.member_slugs
			.map((slug) => allRuns.find((r) => r.slug === slug))
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
	.validator((d: { slugs: string[]; name?: string }) => d)
	.handler(async ({ data }) => {
		const group = await createActivityGroup(data.slugs, data.name ?? '');
		return { id: group.id };
	});

export const addToActivityGroupFn = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: { groupId: string; slug: string }) => d)
	.handler(async ({ data }) => {
		await addActivityToGroup(data.groupId, data.slug);
		return { ok: true };
	});

export const removeFromActivityGroupFn = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: { groupId: string; slug: string }) => d)
	.handler(async ({ data }) => {
		await removeActivityFromGroup(data.groupId, data.slug);
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
		const members = groupRaw.member_slugs
			.map((slug) => allRuns.find((r) => r.slug === slug))
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

function zipFilePayload(filename: string, entries: { name: string; data: string }[]) {
	const bytes = zipStoreBytes(entries);
	let binary = '';
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
	return {
		filename,
		mime: 'application/zip',
		encoding: 'base64' as const,
		body: btoa(binary)
	};
}

export const exportActivitiesFn = createServerFn({ method: 'GET' })
	.validator((d: { slugs: string[] }) => d)
	.handler(async ({ data }) => {
		const unique = [...new Set(data.slugs.map((s) => s.trim()).filter(Boolean))];
		if (!unique.length) throw new Error('Pick at least one activity to export.');
		const all = await listRuns();
		const runs = sortGroupMembers(
			unique
				.map((slug) => all.find((r) => r.slug === slug))
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

function parseJsonPayload(text: string): unknown {
	const trimmed = text.trim();
	if (!trimmed) throw new Error('Nothing to save — paste the JSON your AI returned.');
	const tryParse = (s: string) => {
		try {
			return { ok: true as const, value: JSON.parse(s) as unknown };
		} catch {
			return { ok: false as const };
		}
	};
	const direct = tryParse(trimmed);
	if (direct.ok) return direct.value;
	const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (fence) {
		const parsed = tryParse(fence[1]!.trim());
		if (parsed.ok) return parsed.value;
	}
	const start = trimmed.search(/[[{]/);
	if (start >= 0) {
		const parsed = tryParse(trimmed.slice(start));
		if (parsed.ok) return parsed.value;
	}
	throw new Error('That is not valid JSON — paste the JSON block your AI returned.');
}

/** Objects in the paste that look like plan weeks (`week` + `sessions`). */
function planWeekCandidates(parsed: unknown): unknown[] {
	return (Array.isArray(parsed) ? parsed : [parsed]).filter(looksLikePlanWeek);
}

async function mergePlanWeeks(incoming: PlanWeek[]): Promise<{ weeks: number; updated: number[] }> {
	if (!incoming.length) throw new Error('No plan week found in that JSON.');
	const { calendar } = await loadTrainingContext();
	for (const w of incoming) {
		if (w.week > calendar.weekCount) {
			throw new Error(
				calendar.rolling
					? 'With no race on the calendar, paste a single week (week 1).'
					: `Week ${w.week} is outside this ${calendar.weekCount}-week block.`
			);
		}
	}
	const current = await loadPlan();
	const byWeek = new Map<number, PlanWeek>(current.map((w) => [w.week, w]));
	for (const w of incoming) {
		byWeek.set(w.week, {
			...w,
			start: planWeekStartIso(w.week, calendar),
			dates: w.dates?.trim() ? w.dates : planWeekDateRange(w.week, calendar)
		});
	}
	const merged = [...byWeek.values()]
		.filter((w) => w.week >= 1 && w.week <= calendar.weekCount)
		.sort((a, b) => a.week - b.week);
	await savePlan(merged);
	return { weeks: merged.length, updated: incoming.map((w) => w.week) };
}

async function applyFeelingsRows(
	rows: ParsedFeelingsActivity[]
): Promise<{ updated: number; updatedSlugs: string[]; missing: string[] }> {
	const updated: string[] = [];
	const missing: string[] = [];
	const body = rows.some((r) => r.body_scores?.length || r.shins != null)
		? await loadBodyNotes()
		: null;
	for (const row of rows) {
		const patch = feelingsRowToPatch(row) as FeelingsPatch;
		const scores = body ? resolveAiBodyScores(row.body_scores, row.shins, body) : undefined;
		if (scores) {
			const current = await getRun(row.slug);
			if (current) patch.body_scores = mergeBodyScores(current.body_scores, scores);
		}
		const ok = await updateRunFeelings(row.slug, patch);
		if (ok && row.gear !== undefined) {
			const run = await getRun(row.slug);
			if (run) await rememberGearName(run.gear, run.activity_type);
		}
		(ok ? updated : missing).push(row.slug);
	}
	return { updated: updated.length, updatedSlugs: updated, missing };
}

/** Merge AI-returned plan week(s) into plan.json (replace by week number, keep the rest). */
export const savePlanWeeks = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((jsonText: string) => jsonText)
	.handler(async ({ data: jsonText }) => {
		const candidates = planWeekCandidates(parseJsonPayload(jsonText));
		if (!candidates.length) throw new Error('No plan week found in that JSON.');
		return mergePlanWeeks(parsePlanWeeks(candidates));
	});

/** Save a debrief reply: feelings for this run + an updated week plan. */
export const saveDebrief = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((jsonText: string) => jsonText)
	.handler(async ({ data: jsonText }) => {
		const parsed = parseJsonPayload(jsonText);
		const rows = parseFeelingsSuggestions(parsed);
		const obj = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
		const candidates = planWeekCandidates(looksLikePlanWeek(obj.week) ? obj.week : parsed);
		const weeks = candidates.length ? parsePlanWeeks(candidates) : [];
		const fuelSuggestions =
			obj.fuel != null ? parseFuelSuggestions(obj.fuel, runDatesBySlug(await listRuns())) : [];
		const bodySuggestions =
			obj.body != null ? mergeBodySuggestions((await loadProfile()).body, obj.body) : [];
		if (!rows.length && !weeks.length && !fuelSuggestions.length && !bodySuggestions.length) {
			throw new Error('Need a "feelings" object and/or a "week" with sessions in that JSON.');
		}
		const feelings = rows.length
			? await applyFeelingsRows(rows)
			: { updated: 0, updatedSlugs: [] as string[], missing: [] as string[] };
		const plan = weeks.length ? await mergePlanWeeks(weeks) : { weeks: 0, updated: [] as number[] };
		return {
			feelingsUpdated: feelings.updated,
			feelingsUpdatedSlugs: feelings.updatedSlugs,
			feelingsMissing: feelings.missing,
			planWeeks: plan.weeks,
			planUpdated: plan.updated,
			fuelSuggestions,
			bodySuggestions
		};
	});

// ---------- profile: body notes + coach notes ----------

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
						return `| ${r.slug} | ${r.date} | ${activityLabel(r.activity_type)} | ${
							r.distance_km != null ? `${r.distance_km} km` : '—'
						} | ${feel} |`;
					})
					.join('\n')
			: '| — | — | — | — | — |';

		const exampleSlug = targets[0]?.slug ?? 'copy-slug-from-table';
		const example = JSON.stringify({
			activities: [
				{
					slug: exampleSlug,
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
- Copy \`slug\` from the table — do not use the example slug if it is not in the table. Do not copy example numbers.
- ${feelScale()}${scoreAreas.length ? ` \`body_scores\` holds one 0–10 score per body area (runs/walks), keyed by the exact area name: ${scoreAreas.map((a) => a.area).join(', ')}.` : ''} \`wanted_faster\` is true/false.
- Omit any field you have no information for; omit an activity entirely if I said nothing about it.
- Keep \`notes\` short and in my voice (first person).

## Activities (${from} → ${to})
| slug | date | type | distance | current feel |
|------|------|------|----------|--------------|
${table}`);
		return { prompt, count: targets.length, from, to };
	});

/** Save AI-summarised feelings back onto activities by slug (subjective fields only). */
export const saveFeelings = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((jsonText: string) => jsonText)
	.handler(async ({ data: jsonText }) => {
		const rows = parseFeelingsReply(parseJsonPayload(jsonText));
		return applyFeelingsRows(rows);
	});

export const saveGear = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: GearContext) => d)
	.handler(async ({ data }) => {
		await persistGear(data);
		return { ok: true };
	});

export const saveWardrobe = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: Wardrobe) => normalizeWardrobe(d))
	.handler(async ({ data }) => {
		return persistWardrobe(data);
	});

function fuelRunRefs(runs: RunRecord[], log: FuelLog): Record<string, FuelRunRef> {
	const linked = new Set(log.entries.map((e) => e.slug).filter(Boolean));
	const out: Record<string, FuelRunRef> = {};
	for (const r of runs) {
		if (!linked.has(r.slug)) continue;
		out[r.slug] = { date: r.date, distance_km: r.distance_km, activity_type: r.activity_type };
	}
	return out;
}

function runDatesBySlug(runs: RunRecord[]): Record<string, string> {
	return Object.fromEntries(runs.map((r) => [r.slug, r.date]));
}

function buildFuelPromptTemplate(log: FuelLog, runs: RunRecord[]): string {
	const recent = [...runs].sort(byDateNewestFirst).slice(0, 10);
	const recentLines = recent
		.map(
			(r) =>
				`- \`${r.slug}\` · ${r.date} · ${activityLabel(r.activity_type)}${
					r.distance_km != null ? ` · ${r.distance_km} km` : ''
				}`
		)
		.join('\n');
	const names = fuelItemNames(log);
	const example = JSON.stringify({
		fuel: [
			{
				phase: 'before',
				item: 'Coffee',
				timing: '20 min before',
				outcome: 'good',
				notes: '',
				slug: recent[0]?.slug ?? ''
			}
		]
	});
	return tidyPrompt(`# The Long Run — log what I ate

Turn what I wrote below into fuel tries for my log: what I ate or drank before, during, or after a run, and how it went.

## What I wrote
${FUEL_TEXT_TOKEN}

${section('Items already in my log', names.length ? `Reuse one of these exact names when it is the same food or drink: ${names.join(', ')}` : '')}

${section('Recent activities', recentLines ? `Link a try to one of these only when I clearly mean it (e.g. "my 18 km on Sunday").\n${recentLines}` : '')}

## Reply
Return ONLY one JSON block in exactly this shape — no prose before or after:

\`\`\`json
${example}
\`\`\`

Rules:
- One entry per item + phase + timing. If I tried the same thing at two timings, that is two entries.
- \`phase\` is \`before\`, \`during\` or \`after\` the run.
- \`timing\` in my own words ("20 min before", "every 5 km", "at the water stations", "night before"). If I did not say, use "not noted".
- \`outcome\`: \`good\` (fine / no issues), \`mixed\`, or \`bad\` (cramps, stitch, nausea, energy crash). Only from what I said — if I said nothing went wrong, use \`good\`.
- \`notes\`: short, my words — symptoms, amounts, conditions. Empty if nothing to add.
- \`slug\`: only from Recent activities, otherwise \`""\`. Do not copy the example slug unless it fits.
- Never invent food I did not mention.`);
}

export const getFuelData = createServerFn({ method: 'GET' }).handler(async () => {
	const [log, runs] = await Promise.all([loadFuelLog(), listRuns()]);
	return {
		log,
		runsBySlug: fuelRunRefs(runs, log),
		promptTemplate: buildFuelPromptTemplate(log, runs)
	};
});

export const saveFuelLog = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: FuelLog) => normalizeFuelLog(d))
	.handler(async ({ data }) => {
		return persistFuelLog(data);
	});

export const addFuelEntries = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: FuelEntry[]) =>
		(Array.isArray(d) ? d : []).map(normalizeFuelEntry).filter((e): e is FuelEntry => e != null)
	)
	.handler(async ({ data }) => {
		const log = await loadFuelLog();
		const saved = await persistFuelLog({ ...log, entries: [...log.entries, ...data] });
		return { log: saved, added: data.length };
	});

export const renameFuelItem = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: { phase: FuelPhase; from: string; to: string }) => d)
	.handler(async ({ data }) => {
		const log = await loadFuelLog();
		return persistFuelLog(renameFuelItemIn(log, data.phase, data.from, data.to));
	});

/** Describe-what-you-ate reply: validated with zod and saved straight away. */
export const saveFuelReply = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((jsonText: string) => jsonText)
	.handler(async ({ data: jsonText }) => {
		const [log, runs] = await Promise.all([loadFuelLog(), listRuns()]);
		const entries = parseFuelReply(parseJsonPayload(jsonText), runDatesBySlug(runs));
		const saved = await persistFuelLog({ ...log, entries: [...log.entries, ...entries] });
		return { log: saved, addedIds: entries.map((e) => e.id) };
	});

export const saveActivityHabits = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: ActivityHabits) => normalizeActivityHabits(d))
	.handler(async ({ data }) => {
		return persistActivityHabits(data);
	});

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_HORIZON_RE = /^\d{4}-\d{2}$/;

export type GoalBriefDraft = {
	name: string;
	date: string;
	horizon: string;
	distance_km: number | string | undefined;
	sport: string;
	time_goal: string;
	plan_start: string;
	url: string;
	itinerary_url: string;
	primary: string | string[] | undefined;
	notes: string;
	extra: string;
};

/** Prompt to invent race priorities/notes (and fill empty race fields) from recent training. */
export const getGoalBrief = createServerFn({ method: 'GET' })
	.validator((d: Partial<GoalBriefDraft> = {}) => ({
		name: typeof d?.name === 'string' ? d.name : '',
		date: typeof d?.date === 'string' ? d.date : '',
		horizon: typeof d?.horizon === 'string' ? d.horizon : '',
		distance_km: d?.distance_km,
		sport: typeof d?.sport === 'string' ? d.sport : 'run',
		time_goal: typeof d?.time_goal === 'string' ? d.time_goal : '',
		plan_start: typeof d?.plan_start === 'string' ? d.plan_start : '',
		url: typeof d?.url === 'string' ? d.url : '',
		itinerary_url: typeof d?.itinerary_url === 'string' ? d.itinerary_url : '',
		primary: d?.primary,
		notes: typeof d?.notes === 'string' ? d.notes : '',
		extra: typeof d?.extra === 'string' ? d.extra : ''
	}))
	.handler(async ({ data }) => {
		const range = dateRangeFromSearch({ range: '30d' });
		const [allRuns, training, profile, habits, fuelLog] = await Promise.all([
			listRuns(),
			loadTrainingContext(),
			loadProfile(),
			loadActivityHabits(),
			loadFuelLog()
		]);
		const { medals } = training;
		const windowRuns = filterRunsByRange(allRuns, range).sort(byDateNewestFirst);
		const todayIso = isoDateLocal(new Date());
		const sport = normalizeActivityType(data.sport || 'run');
		const distance = Number(data.distance_km);
		const distanceKm = Number.isFinite(distance) && distance > 0 ? distance : null;
		const primaryLines = Array.isArray(data.primary)
			? data.primary.map((p) => String(p).trim()).filter(Boolean)
			: String(data.primary ?? '')
					.split('\n')
					.map((s) => s.trim())
					.filter(Boolean);
		const booked = Boolean(data.date && ISO_DATE_RE.test(data.date));
		const horizon = ISO_HORIZON_RE.test(data.horizon.trim()) ? data.horizon.trim() : '';
		const daysToRace = booked ? Math.max(0, daysUntil(data.date) ?? 0) : null;
		const lastMedal = medals[0];
		const lastMedalLine = lastMedal
			? `- Last race: ${lastMedal.name} on ${lastMedal.date}${lastMedal.result?.time ? ` in ${lastMedal.result.time}` : ''}${lastMedal.result?.pace ? ` (${lastMedal.result.pace}/km)` : ''}`
			: '';
		const activityRows = windowRuns.map(briefTableRow).join('\n');
		const extra = data.extra.trim();
		const exampleJson = JSON.stringify(
			booked
				? {
						name: data.name.trim(),
						date: data.date || '',
						distance_km: distanceKm,
						sport,
						time_goal: data.time_goal.trim(),
						plan_start: data.plan_start || '',
						url: data.url.trim(),
						itinerary_url: data.itinerary_url.trim(),
						primary: primaryLines,
						notes: data.notes.trim()
					}
				: {
						name: data.name.trim(),
						horizon: horizon || '',
						distance_km: distanceKm,
						sport,
						time_goal: data.time_goal.trim(),
						url: data.url.trim(),
						itinerary_url: data.itinerary_url.trim(),
						primary: primaryLines,
						notes: data.notes.trim()
					}
		);
		const briefKind = booked ? 'race' : 'look-ahead';
		const field = (label: string, value: string) => (value ? `- ${label}: ${value}` : '');
		const identityLines = booked
			? [
					field('Name', data.name.trim()),
					field('Date', data.date),
					field('Distance', distanceKm != null ? `${distanceKm} km` : ''),
					field('Sport', activityLabel(sport)),
					field('Time goal', data.time_goal.trim()),
					field('Plan starts (Monday)', data.plan_start),
					daysToRace != null
						? `- Days to race: ${daysToRace}${daysToRace === 0 ? ' (race day or already past)' : ''}`
						: '',
					field('Race URL', data.url.trim()),
					field('Itinerary URL', data.itinerary_url.trim())
				]
			: [
					field('Name', data.name.trim()),
					field('Horizon', horizon ? formatHorizonLabel(horizon) : ''),
					field('Distance', distanceKm != null ? `${distanceKm} km` : ''),
					field('Sport', activityLabel(sport)),
					field('Time goal', data.time_goal.trim()),
					field('URL', data.url.trim()),
					field('Itinerary URL', data.itinerary_url.trim()),
					'This is **not a booked race**. Do not invent a race date, plan start, peak, or taper.'
				];
		const draftLines = [
			...identityLines,
			primaryLines.length
				? `- Current priorities:\n${primaryLines.map((p) => `  - ${p}`).join('\n')}`
				: '',
			field('Current notes', data.notes.trim())
		].filter(Boolean);
		const identity = `## ${booked ? 'Race' : 'Look-ahead'} (current draft — fields not listed are empty)\n${draftLines.join('\n')}`;
		const coaching = booked
			? 'You are helping me set this race in my training app. Propose **priorities** (how I should train toward it) and **notes** (course, logistics, race-day intent). Keep every identity field and any priorities/notes I already filled unless I asked to change them. Fill empty identity fields only from the race URL, itinerary URL, or my extra notes — do not guess.'
			: 'You are helping me set a **look-ahead**, not a booked race. Propose **priorities** (how I should train toward that month) and **notes**. Do not invent a race date. Do not peak or taper. Keep every identity field and any priorities/notes I already filled unless I asked to change them.';
		const replyNotes = booked
			? '`notes` is a few sentences on course / logistics / race-day intent.'
			: '`notes` is a few sentences on why this look-ahead matters. Leave `date` and `plan_start` empty.';
		const fuelSection = formatFuelSection(fuelLog, fuelRunRefs(allRuns, fuelLog));
		return tidyPrompt(
			joinSections(
				`# The Long Run — ${briefKind} brief`,
				`## Coaching brief\n${coaching}`,
				identity,
				[`Today is ${todayIso}.`, lastMedalLine].filter(Boolean).join('\n'),
				section('Extra from me', extra),
				allTimeSummarySection(allRuns),
				formatPaceSection(buildPaceProfile(allRuns, medals, todayIso)),
				activityRows
					? `## Recent training (${range.label.toLowerCase()}, newest first)\n${feelScale()} Use this to keep priorities honest (volume, body scores, what is already working).\n\n${BRIEF_TABLE_HEAD}\n${activityRows}`
					: '',
				formatBodyNotesSection(profile.body),
				formatCoachNotesSection(profile.coachNotes),
				formatUsualHabitsSection(habits),
				fuelSection
					? `${fuelSection}\nUse this fuel log for any race-day fueling advice in \`notes\` — repeat what worked, avoid what caused trouble.`
					: '',
				`## When you reply\nGive a short assessment in prose if you want. Then output **one JSON object** I can paste back, with exactly these keys. If a draft field is empty, leave it \`""\`, \`null\`, or \`[]\` unless a URL or my extra notes make it clear. Do not copy example placeholders. \`primary\` is an array of 3–6 short priorities (one line each). ${replyNotes} Keep any URL I gave. ${BODY_SAFETY_RULE}\n\n\`\`\`json\n${exampleJson}\n\`\`\``
			)
		);
	});

export const getGoalsData = createServerFn({ method: 'GET' }).handler(async () => {
	const [training, runs, tracks] = await Promise.all([
		loadTrainingContext(),
		listRuns(),
		listRouteTracks()
	]);
	const { activeGoal, medals, calendar, store } = training;
	const upcoming = store.goals
		.filter((g) => g.status !== 'done' && g.id !== activeGoal?.id && isRaceGoal(g))
		.sort((a, b) => a.date.localeCompare(b.date));
	const intentions = openIntentions(store.goals);
	const candidatesByGoalId: Record<string, ReturnType<typeof pinCandidatesForGoal>> = {};
	for (const g of store.goals) {
		if (g.status !== 'done' && !canPinRaceResult(g)) continue;
		if (!isRaceGoal(g)) continue;
		candidatesByGoalId[g.id] = pinCandidatesForGoal(g, runs);
	}
	const runBySlug = new Map(runs.map((r) => [r.slug, r]));
	/** Medal time/distance/pace follow the linked activity, not a stale pin snapshot. */
	const medalsLive = medals.map((g) => {
		const slug = g.result?.activity_slug;
		if (!slug) return g;
		const run = runBySlug.get(slug);
		if (!run) return g;
		return { ...g, result: resultFromActivity(run) };
	});
	const trackById = new Map(tracks.map((t) => [t.id, t.coords]));
	const medalTracks: Record<string, [number, number][]> = {};
	const medalActivities: Record<
		string,
		Pick<
			RunRecord,
			| 'slug'
			| 'date'
			| 'activity_type'
			| 'avg_hr'
			| 'max_hr'
			| 'elev_gain'
			| 'cadence'
			| 'calories'
			| 'gear'
			| 'weather'
			| 'surface'
			| 'place'
			| 'province'
			| 'country'
			| 'effort'
			| 'start_time'
			| 'elapsed_time'
		>
	> = {};
	for (const g of medalsLive) {
		const slug = g.result?.activity_slug;
		if (!slug) continue;
		const run = runBySlug.get(slug);
		if (!run) continue;
		medalActivities[g.id] = {
			slug: run.slug,
			date: run.date,
			activity_type: run.activity_type,
			avg_hr: run.avg_hr,
			max_hr: run.max_hr,
			elev_gain: run.elev_gain,
			cadence: run.cadence,
			calories: run.calories,
			gear: run.gear,
			weather: run.weather,
			surface: run.surface,
			place: run.place,
			province: run.province,
			country: run.country,
			effort: run.effort,
			start_time: run.start_time,
			elapsed_time: run.elapsed_time
		};
		const id = routeIdForRun(run);
		if (!id) continue;
		const coords = trackById.get(id);
		if (coords && coords.length >= 2) medalTracks[g.id] = coords;
	}
	return {
		activeGoal,
		upcoming,
		intentions,
		medals: medalsLive,
		calendar,
		candidatesByGoalId,
		medalTracks,
		medalActivities
	};
});

export const saveMedalDetails = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: MedalDetailsInput) => d)
	.handler(async ({ data }) => {
		const store = await loadGoalStore();
		const target = store.goals.find((g) => g.id === data.goalId);
		if (!target) throw new Error('That medal was not found.');
		if (target.status !== 'done') throw new Error('Only finished races can be updated here.');
		const next: Goal = {
			...target,
			bib_number: String(data.bib_number ?? target.bib_number ?? '').trim(),
			result_url: normalizeGoalUrl(data.result_url ?? target.result_url ?? ''),
			medal_notes: String(data.medal_notes ?? target.medal_notes ?? '').trim()
		};
		await saveGoalStore({
			goals: store.goals.map((g) => (g.id === next.id ? next : g))
		});
		return { id: next.id };
	});

export const saveActiveGoal = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: GoalInput) => d)
	.handler(async ({ data }) => {
		const name = data.name.trim();
		const date = data.date.trim();
		const horizon = String(data.horizon ?? '')
			.trim()
			.slice(0, 7);
		if (!name) throw new Error('Give it a name.');
		const booked = ISO_DATE_RE.test(date);
		if (!booked && !ISO_HORIZON_RE.test(horizon)) {
			throw new Error('Pick a race date or a look-ahead month.');
		}
		const store = await loadGoalStore();
		const existing = data.id ? (store.goals.find((g) => g.id === data.id) ?? null) : null;
		const next = normalizeGoalInput(data, existing);
		const isIntention = !isRaceGoal(next);
		if (!isIntention && next.date < next.plan_start) {
			throw new Error('Race day needs to be on or after the plan start.');
		}
		if (store.goals.some((g) => g.id === next.id && g.id !== existing?.id)) {
			throw new Error(
				isIntention
					? 'A look-ahead with that name and month is already saved.'
					: 'A race with that name and date is already on the calendar.'
			);
		}
		const beforeId = pickSoonestOpenGoal(store.goals)?.id ?? null;
		const others = store.goals.filter((g) => g.id !== next.id);
		const merged = [next, ...others];
		await saveGoalStore({ goals: merged });
		const active = pickSoonestOpenGoal(merged);
		if (beforeId !== (active?.id ?? null)) await savePlan([]);
		return {
			id: next.id,
			weekCount: calendarFromGoal(next).weekCount,
			isActive: active?.id === next.id,
			isIntention,
			activeName: active?.name ?? next.name
		};
	});

export const repinGoalResult = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: { goalId: string; activitySlug: string }) => d)
	.handler(async ({ data }) => {
		const store = await loadGoalStore();
		const target = store.goals.find((g) => g.id === data.goalId);
		if (!target) throw new Error('That race was not found.');
		if (target.status !== 'done')
			throw new Error('Only finished races on the medal wall can be re-linked.');
		const run = await getRun(data.activitySlug);
		if (!run) throw new Error('That activity was not found.');
		const done: Goal = {
			...target,
			result: resultFromActivity(run)
		};
		await saveGoalStore({
			goals: store.goals.map((g) => (g.id === done.id ? done : g))
		});
		return { id: done.id };
	});

export const completeGoal = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: { goalId: string; activitySlug: string }) => d)
	.handler(async ({ data }) => {
		const store = await loadGoalStore();
		const target = store.goals.find((g) => g.id === data.goalId);
		if (!target) throw new Error('That race was not found.');
		if (target.status === 'done') throw new Error('That race is already on the medal wall.');
		if (!canPinRaceResult(target)) throw new Error('Pin a result from race day onward.');
		const run = await getRun(data.activitySlug);
		if (!run) throw new Error('That activity was not found.');
		const activeId = pickSoonestOpenGoal(store.goals)?.id ?? null;
		const isActive = target.id === activeId;
		const rawPlan = isActive ? await loadPlan() : null;
		const done: Goal = {
			...target,
			status: 'done',
			result: resultFromActivity(run),
			plan: rawPlan
		};
		await saveGoalStore({
			goals: store.goals.map((g) => (g.id === done.id ? done : g))
		});
		if (isActive) await savePlan([]);
		return { id: done.id };
	});

export const clearGoal = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		const store = await loadGoalStore();
		const target = store.goals.find((g) => g.id === id);
		if (!target) return { ok: true as const };
		const wasActive = pickSoonestOpenGoal(store.goals)?.id === id;
		await saveGoalStore({ goals: store.goals.filter((g) => g.id !== id) });
		if (wasActive) await savePlan([]);
		return { ok: true as const };
	});

// ---------- planned routes (BRouter exports) ----------

export const getPlannedRoutesData = createServerFn({ method: 'GET' }).handler(async () => {
	const [routes, tracks] = await Promise.all([listPlannedRoutes(), listPlannedRouteTracks()]);
	return { routes, tracks } satisfies { routes: PlannedRoute[]; tracks: RouteTrack[] };
});

export const getPlannedRouteDetail = createServerFn({ method: 'GET' })
	.validator((slug: string) => slug)
	.handler(async ({ data: slug }) => {
		const [route, allLinks, training, runs, routes] = await Promise.all([
			getPlannedRoute(slug),
			listRouteLinks(),
			loadTrainingContext(),
			listRuns(),
			listPlannedRoutes()
		]);
		if (!route) return null;
		const { plan, calendar } = training;
		const names = new Map(routes.map((r) => [r.slug, r.name]));
		const runBySlug = new Map(runs.map((r) => [r.slug, r]));
		const mine = allLinks.filter((l) => l.route_slug === slug);

		const planLinks: PlannedRoutePlanLink[] = [];
		for (const link of mine) {
			if (link.kind !== 'plan' || link.plan_week == null || !link.plan_day) continue;
			const week = plan.find((w) => w.week === link.plan_week);
			const session = week?.sessions.find((s) => {
				if (s.day.toLowerCase() !== link.plan_day!.toLowerCase()) return false;
				if (link.plan_label && s.label !== link.plan_label) return false;
				if (
					link.plan_activity_type &&
					normalizeActivityType(s.activity_type ?? 'run') !==
						normalizeActivityType(link.plan_activity_type)
				) {
					return false;
				}
				return true;
			});
			planLinks.push({
				id: link.id,
				week: link.plan_week,
				day: link.plan_day,
				date: dateForSessionDay(planWeekStartIso(link.plan_week, calendar), link.plan_day),
				label: session?.label || link.plan_label || 'Planned session',
				activity_type: session?.activity_type || link.plan_activity_type || 'run',
				distance_km: session?.distance_km ?? null
			});
		}

		const activityLinks: PlannedRouteActivityLink[] = [];
		for (const link of mine) {
			if (link.kind !== 'activity' || !link.activity_slug) continue;
			const run = runBySlug.get(link.activity_slug);
			if (!run) continue;
			activityLinks.push({
				id: link.id,
				slug: run.slug,
				date: run.date,
				day: run.day,
				activity_type: run.activity_type,
				distance_km: run.distance_km
			});
		}

		const planTaken = new Map<string, { slug: string; name: string }>();
		for (const link of allLinks) {
			if (link.kind !== 'plan' || link.plan_week == null || !link.plan_day) continue;
			const name = names.get(link.route_slug);
			if (!name) continue;
			const taken = { slug: link.route_slug, name };
			if (link.plan_label && link.plan_activity_type) {
				planTaken.set(
					`${link.plan_week}|${planSessionRouteKey(link.plan_day, link.plan_label, link.plan_activity_type)}`,
					taken
				);
			} else {
				planTaken.set(`${link.plan_week}|legacy|${link.plan_day.toLowerCase()}`, taken);
			}
		}
		const planSessionTakenKey = (s: {
			week: number;
			day: string;
			label: string;
			activity_type?: string | null;
		}) => `${s.week}|${planSessionRouteKey(s.day, s.label, s.activity_type ?? 'run')}`;

		const planOptions: PlanAttachOption[] = upcomingPlanSessions(plan, calendar)
			.filter((s) => {
				if (planTaken.get(planSessionTakenKey(s))?.slug === slug) return false;
				const legacyKey = `${s.week}|legacy|${s.day.trim().toLowerCase()}`;
				return planTaken.get(legacyKey)?.slug !== slug;
			})
			.map((s) => ({
				week: s.week,
				day: s.day,
				date: s.date,
				label: s.label,
				activity_type: s.activity_type ?? 'run',
				distance_km: s.distance_km,
				taken_by:
					planTaken.get(planSessionTakenKey(s)) ??
					planTaken.get(`${s.week}|legacy|${s.day.trim().toLowerCase()}`) ??
					null
			}));

		const activityTaken = new Map<string, { slug: string; name: string }>();
		for (const link of allLinks) {
			if (link.kind !== 'activity' || !link.activity_slug) continue;
			const name = names.get(link.route_slug);
			if (!name) continue;
			activityTaken.set(link.activity_slug, { slug: link.route_slug, name });
		}

		const linkedActivity = new Set(activityLinks.map((a) => a.slug));
		const activityOptions: ActivityAttachOption[] = runs
			.filter((r) => normalizeActivityType(r.activity_type) !== 'strength')
			.filter((r) => !linkedActivity.has(r.slug))
			.slice(0, 80)
			.map((r) => ({
				slug: r.slug,
				date: r.date,
				day: r.day,
				activity_type: r.activity_type,
				distance_km: r.distance_km,
				taken_by: activityTaken.get(r.slug) ?? null
			}));

		return { ...route, planLinks, activityLinks, planOptions, activityOptions };
	});

export const importPlannedRoute = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: { text: string; filename: string }) => d)
	.handler(async ({ data }) => {
		const route = await savePlannedFromFile(data);
		return {
			slug: route.slug,
			name: route.name,
			distance_km: route.distance_km
		};
	});

async function trackFromDrawnPins(data: {
	waypoints: { lat: number; lng: number }[];
	follow_network?: boolean;
	network_coords?: { lat: number; lng: number; elev?: number }[];
}) {
	const pins = normalizeWaypoints(data.waypoints);
	if (pins.length < 2) throw new Error('Drop at least two pins.');

	let points = densifyWaypoints(pins);
	if (data.follow_network) {
		const previewed = normalizeTrackPoints(data.network_coords);
		if (previewed.length >= 2) {
			points = previewed;
		} else {
			const routed = await brouterAlongPins(pins);
			if (routed.length < 2) {
				throw new Error(
					'Could not follow roads between those pins. Uncheck Follow roads to save the straight line.'
				);
			}
			points = routed;
		}
	}

	return { pins, points };
}

function startFinishWaypoints(pins: { lat: number; lng: number }[]) {
	return pins.map((p, i) => ({
		name: i === 0 ? 'Start' : i === pins.length - 1 ? 'Finish' : `Via ${i}`,
		lat: p.lat,
		lng: p.lng
	}));
}

export const createPlannedRoute = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator(
		(d: {
			name: string;
			waypoints: { lat: number; lng: number }[];
			follow_network?: boolean;
			network_coords?: { lat: number; lng: number; elev?: number }[];
		}) => d
	)
	.handler(async ({ data }) => {
		const name = data.name.trim();
		if (!name) throw new Error('Name this route.');
		const { pins, points } = await trackFromDrawnPins(data);

		const route = await savePlannedFromTrack({
			name,
			points,
			waypoints: startFinishWaypoints(pins)
		});
		return {
			slug: route.slug,
			name: route.name,
			distance_km: route.distance_km
		};
	});

export const updatePlannedRoute = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator(
		(d: {
			slug: string;
			name?: string;
			notes?: string;
			waypoints?: { lat: number; lng: number }[];
			follow_network?: boolean;
			network_coords?: { lat: number; lng: number; elev?: number }[];
		}) => d
	)
	.handler(async ({ data }) => {
		if (data.waypoints) {
			const { pins, points } = await trackFromDrawnPins({
				waypoints: data.waypoints,
				follow_network: data.follow_network,
				network_coords: data.network_coords
			});
			const route = await dbReplacePlannedRouteTrack(data.slug, {
				points,
				pins,
				name: data.name,
				notes: data.notes
			});
			if (!route) throw new Error('Route not found.');
			return { slug: route.slug, distance_km: route.distance_km };
		}
		const route = await dbUpdatePlannedRoute(data.slug, { name: data.name, notes: data.notes });
		if (!route) throw new Error('Route not found.');
		return { slug: route.slug };
	});

export const deletePlannedRoute = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((slug: string) => slug)
	.handler(async ({ data: slug }) => {
		return dbDeletePlannedRoute(slug);
	});

function matchingPlanSession(
	plan: PlanWeek[],
	week: number,
	day: string,
	label: string,
	activityType: string,
	sessionIndex?: number
) {
	const weekRow = plan.find((w) => w.week === week);
	if (!weekRow) return null;
	const key = planSessionRouteKey(day, label, activityType);
	if (sessionIndex != null) {
		if (sessionIndex < 0 || sessionIndex >= weekRow.sessions.length) return null;
		const session = weekRow.sessions[sessionIndex]!;
		if (planSessionRouteKey(session.day, session.label, session.activity_type) !== key) {
			return null;
		}
		return { weekRow, index: sessionIndex, session };
	}
	const index = weekRow.sessions.findIndex(
		(s) => planSessionRouteKey(s.day, s.label, s.activity_type) === key
	);
	if (index < 0) return null;
	return { weekRow, index, session: weekRow.sessions[index]! };
}

export const setPlanSessionSkipped = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator(
		(d: {
			week: number;
			day: string;
			label: string;
			activity_type?: string;
			session_index?: number;
			skipped: boolean;
		}) => ({
			week: d.week,
			day: String(d.day ?? '').trim(),
			label: String(d.label ?? '').trim(),
			activity_type: normalizeActivityType(d.activity_type ?? 'run'),
			session_index:
				d.session_index != null && Number.isInteger(d.session_index) ? d.session_index : undefined,
			skipped: Boolean(d.skipped)
		})
	)
	.handler(async ({ data }) => {
		if (!Number.isInteger(data.week) || data.week < 1) {
			throw new Error('That plan week is out of range.');
		}
		if (!data.day || !data.label) throw new Error('That session is not on the plan.');
		const plan = await loadPlan();
		const found = matchingPlanSession(
			plan,
			data.week,
			data.day,
			data.label,
			data.activity_type,
			data.session_index
		);
		if (!found) throw new Error('That session is not on the plan.');
		if (data.skipped && isRestLike(found.session.label)) {
			throw new Error('Rest days cannot be skipped.');
		}
		const nextSession = { ...found.session };
		if (data.skipped) nextSession.status = 'skipped';
		else delete nextSession.status;
		const sessions = found.weekRow.sessions.slice();
		sessions[found.index] = nextSession;
		await savePlan(
			plan.map((w) => (w.week === found.weekRow.week ? { ...found.weekRow, sessions } : w))
		);
		return { ok: true as const, skipped: data.skipped };
	});

export const attachPlannedRoute = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator(
		(d: {
			slug: string;
			week?: number;
			day?: string;
			label?: string;
			activity_type?: string;
			activity_slug?: string;
		}) => d
	)
	.handler(async ({ data }) => {
		if (data.activity_slug) {
			const run = await getRun(data.activity_slug);
			if (!run) throw new Error('Activity not found.');
			if (normalizeActivityType(run.activity_type) === 'strength') {
				throw new Error('Strength sessions do not use a route.');
			}
			await dbAttachRouteToActivity(data.slug, data.activity_slug);
			return { ok: true as const };
		}
		const week = data.week;
		const day = data.day?.trim() ?? '';
		const label = data.label?.trim() ?? '';
		const activityType = normalizeActivityType(data.activity_type ?? 'run');
		if (week == null || !day || !label) throw new Error('Pick a plan day or an activity.');
		if (!Number.isInteger(week) || week < 1) {
			throw new Error('That plan week is out of range.');
		}
		const { calendar, plan } = await loadTrainingContext();
		if (week > calendar.weekCount) {
			throw new Error('That plan week is out of range.');
		}
		const found = plan
			.find((w) => w.week === week)
			?.sessions.find(
				(s) =>
					s.day.toLowerCase() === day.toLowerCase() &&
					s.label === label &&
					normalizeActivityType(s.activity_type ?? 'run') === activityType
			);
		if (!found) throw new Error('That session is not on the plan.');
		if (!sessionCanLinkRoute(found)) {
			throw new Error(
				normalizeActivityType(found.activity_type ?? 'run') === 'strength'
					? 'Strength sessions do not use a route.'
					: 'Rest days do not use a route.'
			);
		}
		await dbAttachRouteToPlan(data.slug, week, day, label, activityType);
		return { ok: true as const };
	});

export const detachPlannedRoute = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: { slug: string; id: number }) => d)
	.handler(async ({ data }) => {
		const ok = await dbDetachRouteLink(data.id, data.slug);
		if (!ok) throw new Error('Link not found.');
		return { ok: true as const };
	});
