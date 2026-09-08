import { ACTIVITY_TYPES, activityCount, activityLabel, activityPlural, metricText, normalizeActivityType, showsFeel, showsField } from '$lib/activity';
import { combinedActivityGpx, combinedActivityTcx, memberActivityGpx, safeFilename } from '$lib/activity-export';
import {
    computeBestEffortsFromSplits,
    computeBestEffortsFromTrack,
    effortsEqual,
    highlightsForActivity,
    mergeMissingBestEfforts,
    missingEffortKeys,
    supportsBestEfforts,
    type EffortHighlight
} from '$lib/best-efforts';
import { combinedAnalytics, trackFromGeoJson } from '$lib/combine-track';
import { dateRangeFromSearch, filterRunsByRange, type DateRange, type RangeKind } from '$lib/date-range';
import { dayFromIsoDate, formatDuration, guessSession, localDateTimeToUtcMs, normalizeStartTime, parseDurationSeconds } from '$lib/format';
import { canPinRaceResult, normalizeGoalInput, pickSoonestOpenGoal, pinCandidatesForGoal, resultFromActivity, type GoalInput } from '$lib/goals';
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
import { buildHrZoneSummary } from '$lib/hr-zones';
import { renderJsonPretty, renderMarkdown } from '$lib/markdown';
import {
    buildWeekView,
    calendarFromGoal,
    dateForSessionDay,
    daysUntil,
    formatUnplannedBrief,
    isoDateLocal,
    isSkippedStatus,
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
    upcomingPlanSessions,
    weekNumberForDate,
    weekToGenerate,
    weekToPlan,
    withSessionRoutes,
    type PlanCalendar,
    type WeekView
} from '$lib/plan';
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
    analyticsFromProperties,
    analyticsToProperties,
    computeRouteAnalytics,
    type RouteAnalytics
} from '$lib/splits';
import { parseStrengthNotes, strengthSummary } from '$lib/strength';
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
    exampleSessionsForPattern,
    formatPatternLines,
    formatPatternPromptSection,
    normalizeWeekPattern,
    type WeekPattern
} from '$lib/week-mix';
import { zipStoreBytes } from '$lib/zip';
import { createServerFn } from '@tanstack/react-start';
import matter from 'gray-matter';
import { requireAuth } from './auth';
import { brouterAlongPins } from './brouter';
import {
    currentPlanWeek,
    loadGoalStore,
    loadPlan,
    loadSettings,
    loadGear,
    loadTrainingContext,
    persistGear,
    readContextFile,
    rememberGearName,
    saveGoalStore,
    saveHrMaxSetting,
    savePlan,
    saveWeekPatternSetting,
    writeContextFile
} from './context';
import { reverseGeocode, timezoneForCoord } from './geo';
import { parseGpx } from './gpx';
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
    setRunRoute,
    updateRunFeelings,
    type FeelingsPatch,
    type UpdateRunFields
} from './runs';
import { DEFAULT_START_HHMM, fetchWeatherForDateTime } from './weather';

const withMap = (runs: RunRecord[], routeIds: Set<string>): RunWithMap[] =>
	runs.map((r) => ({ ...r, has_map: runHasMap(r, routeIds) }));

function attachPlanRoutes(weekView: WeekView | null, planRefs: Awaited<ReturnType<typeof listPlanRouteRefs>>): WeekView | null {
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
		const fromTrack =
			src.samples.length >= 2 ? computeBestEffortsFromTrack(src.samples) : [];
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

export const getAuthState = createServerFn({ method: 'GET' }).handler(async () => {
	const { readAuthSession } = await import('./auth.server');
	return readAuthSession();
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
		routes: plannedRoutes.map(
			(r): SessionRouteRef => ({
				slug: r.slug,
				name: r.name,
				distance_km: r.distance_km
			})
		)
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
		const [geo, routeIds, gear, settings, allTimeMaxHr, allRuns, plannedRoute, training, group, plannedRoutes] =
			await Promise.all([
				routeId ? getRouteGeoJson(routeId) : Promise.resolve(null),
				listRouteIds(),
				loadGear(),
				loadSettings(),
				getMaxHrAllTime(),
				listRuns(),
				getActivityRouteRef(slug),
				loadTrainingContext(),
				membershipForSlug(slug),
				listPlannedRoutes()
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
		const hrMaxEffective = hrMaxManual ?? allTimeMaxHr ?? null;
		let out = analytics as RouteAnalytics | null;
		if (hrMaxEffective && (run.avg_hr != null || (out?.hrSamples?.length ?? 0) > 0)) {
			const hrZones = buildHrZoneSummary({
				hrMax: hrMaxEffective,
				source: hrMaxManual != null ? 'profile' : 'alltime',
				avgHr: run.avg_hr,
				samples: (out?.hrSamples ?? []).map((s) => ({ timeMs: s.t * 1000, hr: s.hr }))
			});
			out = out ? { ...out, hrZones } : { splits: [], kmMarkers: [], hrZones };
		}

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
			groupOptions
		};
	});

export const saveHrMax = createServerFn({ method: 'POST' }).middleware([requireAuth])
	.validator((hrMax: number | null) => hrMax)
	.handler(async ({ data }) => {
		await saveHrMaxSetting(data);
		return { ok: true };
	});

export const getLogDefaults = createServerFn({ method: 'GET' }).handler(async () => {
	const [week, gear, runs, training] = await Promise.all([
		currentPlanWeek(),
		loadGear(),
		listRuns(),
		loadTrainingContext()
	]);
	return { week, gear, gearWear: wearByAllGear(runs), calendar: training.calendar };
});

export const getRouteGeoJsonFn = createServerFn({ method: 'GET' })
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		return (await getRouteGeoJson(id)) ?? null;
	});

export const getWeather = createServerFn({ method: 'GET' })
	.validator((d: { date: string; time?: string | null; duration?: string | null }) => d)
	.handler(async ({ data }) => {
		return fetchWeatherForDateTime(data.date, data.time ?? null, null, null, data.duration ?? null);
	});

const CONTEXT_FILES: { name: string; title: string }[] = [
	{ name: 'profile.md', title: 'Runner profile' },
	{ name: 'injury.md', title: 'Injury rules' },
	{ name: 'gear.md', title: 'Fueling & checklist' },
	{ name: 'training-plan.md', title: 'Training plan notes' },
	{ name: 'race-strategy.md', title: 'Race strategy' }
];

export type ContextFile = { name: string; title: string; body: string; html: string };

function gearAsMarkdown(gear: GearContext) {
	const parts: string[] = [];
	for (const kind of GEAR_KINDS) {
		const catalog = gear[kind];
		const meta = gearMeta(kind);
		const yaml = {
			active: catalog.active,
			rotation: catalog.rotation,
			retired: catalog.retired
		};
		parts.push(
			`## ${meta.section} — ${meta.label}\n\n${matter.stringify(catalog.notes ? `${catalog.notes}\n` : '', yaml)}`
		);
	}
	return parts.join('\n');
}

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

/** Compact plan for the coach brief — never the full plan.json. */
function formatTrainingPlanBrief(plan: PlanWeek[], targetWeek: number, cal: PlanCalendar): string {
	const byWeek = new Map(plan.map((w) => [w.week, w]));
	const include = new Set<number>([targetWeek]);
	for (const w of plan
		.filter((x) => x.week < targetWeek && weekHasSessions(x))
		.sort((a, b) => b.week - a.week)
		.slice(0, 2)) {
		include.add(w.week);
	}

	const jsonWeeks = [...include]
		.sort((a, b) => a - b)
		.map(
			(n) =>
				byWeek.get(n) ?? {
					week: n,
					dates: planWeekDateRange(n, cal),
					phase: '',
					focus: '',
					sessions: [] as PlanWeek['sessions']
				}
		);

	const emptyFuture: number[] = [];
	const filledFuture: number[] = [];
	for (let n = targetWeek + 1; n <= cal.weekCount; n++) {
		if (weekHasSessions(byWeek.get(n))) filledFuture.push(n);
		else emptyFuture.push(n);
	}

	const parts: string[] = [
		'Only the week to plan and up to two previous weeks with sessions are included — not the full plan.json.'
	];
	if (jsonWeeks.length) {
		parts.push('```json\n' + JSON.stringify(jsonWeeks, null, 2) + '\n```');
	}
	if (emptyFuture.length) {
		parts.push(`${formatWeekNumberRange(emptyFuture)}: not planned yet.`);
	}
	if (filledFuture.length) {
		parts.push(
			`${formatWeekNumberRange(filledFuture)} already have sessions in the plan file — omitted here; do not copy them into this week's JSON.`
		);
	}
	return parts.join('\n\n');
}

/** Decoder for feel columns in generate/debrief/race prompts. */
const FEEL_SCALE =
	'Feel = effort/shins/legs/energy. Effort and energy 1–10 (effort higher = harder, energy higher = better). Shins and legs 0–10 (higher = worse). – = not recorded.';

function notesForBriefRow(r: RunRecord): string {
	const isStrength = normalizeActivityType(r.activity_type) === 'strength';
	let notesText = r.notes || '';
	if (isImportNote(notesText)) notesText = '';
	else if (isStrength) {
		const p = parseStrengthNotes(r.notes);
		notesText = [strengthSummary(p.exercises), p.extra].filter(Boolean).join(' — ');
		if (isImportNote(notesText)) notesText = '';
	}
	return notesText
		.replace(/\s+/g, ' ')
		.replace(/\|/g, '/')
		.trim()
		.slice(0, isStrength ? 400 : 140);
}

function gearNotesForBrief(notes: string): string {
	const t = notes.trim();
	if (!t) return '';
	if (/track shoe rotation here/i.test(t)) return '';
	return t;
}

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
		`- ${meta.activeLabel}: ${catalog.active ? line(catalog.active) : '—'}`,
		rotationRest.length ? `- Rotation: ${rotationRest.map(line).join('; ')}` : '',
		catalog.retired.length ? `- Retired: ${catalog.retired.map(line).join('; ')}` : ''
	].filter(Boolean);
}

function gearSectionForBrief(gear: GearContext, runs: RunRecord[]): string {
	const blocks: string[] = [];
	for (const kind of GEAR_KINDS) {
		const catalog = gear[kind];
		if (!catalogHasItems(catalog) && !catalog.notes.trim()) continue;
		const meta = gearMeta(kind);
		const notes = gearNotesForBrief(catalog.notes);
		blocks.push(
			`### ${meta.section} — ${meta.label}\n${catalogLinesForBrief(catalog, kind, runs).join('\n')}${notes ? `\n\n${notes}` : ''}`
		);
	}
	if (!blocks.length) {
		return `## Gear
No kit logged yet. Mileage is counted from logged activities. Strava GPX exports do not include gear.`;
	}
	return `## Gear
Mileage is counted from logged activities. Strava GPX exports do not include gear.

${blocks.join('\n\n')}`;
}

export const getContextData = createServerFn({ method: 'GET' }).handler(async () => {
	const [gear, runs] = await Promise.all([loadGear(), listRuns()]);
	const raw = await Promise.all(CONTEXT_FILES.map((f) => readContextFile(f.name)));
	const files: ContextFile[] = CONTEXT_FILES.map((f, i) => {
		const body = raw[i]!;
		const html = f.name.endsWith('.json') ? renderJsonPretty(body) : renderMarkdown(body);
		return { name: f.name, title: f.title, body, html };
	});
	const allContext = [
		`# ===== gear-inventory.json =====\n\n${gearAsMarkdown(gear).trim()}`,
		...files.map((f) => `# ===== ${f.name} =====\n\n${f.body.trim()}`)
	].join('\n\n');
	return { gear, gearWear: wearByAllGear(runs), files, allContext };
});

export const getCoachBrief = createServerFn({ method: 'GET' })
	.validator((d: {
		range?: RangeKind;
		from?: string | null;
		to?: string | null;
		pattern?: WeekPattern;
		defaultPattern?: WeekPattern;
		note?: string;
	} = {}) => {
		const range = dateRangeFromSearch({
			range: d?.range,
			from: d?.from ?? undefined,
			to: d?.to ?? undefined
		});
		return {
			range,
			pattern: d?.pattern != null ? normalizeWeekPattern(d.pattern) : undefined,
			defaultPattern: d?.defaultPattern != null ? normalizeWeekPattern(d.defaultPattern) : undefined,
			note: typeof d?.note === 'string' ? d.note : ''
		};
	})
	.handler(async ({ data }) => {
		const range = data.range;
		const [allRuns, training, gearInventory, profile, injury, gear, raceStrategy, settings] =
			await Promise.all([
				listRuns(),
				loadTrainingContext(),
				loadGear(),
				readContextFile('profile.md'),
				readContextFile('injury.md'),
				readContextFile('gear.md'),
				readContextFile('race-strategy.md'),
				loadSettings()
			]);
		const { plan, calendar, activeGoal, medals, store } = training;
		const defaultPattern = data.defaultPattern ?? settings.weekPattern;
		const thisPattern = data.pattern != null ? data.pattern : defaultPattern;
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

		// All-time summary (computed from every activity, so derived facts stay current).
		const byType = { run: 0, ride: 0, walk: 0, swim: 0, strength: 0 } as Record<string, number>;
		for (const r of allRuns) byType[normalizeActivityType(r.activity_type)]++;
		const runsAll = allRuns.filter((r) => normalizeActivityType(r.activity_type) === 'run');
		const totalRunKm = Math.round(runsAll.reduce((a, r) => a + (r.distance_km ?? 0), 0));
		const longest = runsAll.reduce<RunRecord | null>(
			(best, r) => ((r.distance_km ?? 0) > (best?.distance_km ?? 0) ? r : best),
			null
		);
		const paceSecs = runsAll
			.map((r) => parseDurationSeconds(r.avg_pace))
			.filter((n): n is number => n != null && n > 0 && n < 20 * 60);
		const avgRunPace = paceSecs.length
			? formatDuration(Math.round(paceSecs.reduce((a, b) => a + b, 0) / paceSecs.length))
			: '—';
		const firstDate = allRuns.length
			? allRuns.reduce((min, r) => (r.date < min ? r.date : min), allRuns[0]!.date)
			: '—';
		const shinRuns = runsAll.filter((r) => r.shins != null).sort(byDateNewestFirst);
		const avg = (arr: number[]) =>
			arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null;
		const shinsRecent = avg(shinRuns.slice(0, 4).map((r) => r.shins!));
		const shinsPrior = avg(shinRuns.slice(4, 8).map((r) => r.shins!));

		const weekMap = new Map<string, { counts: Record<string, number>; km: Record<string, number> }>();
		for (const r of windowRuns) {
			const wk = mondayIso(r.date);
			const t = normalizeActivityType(r.activity_type);
			const e = weekMap.get(wk) ?? { counts: {}, km: {} };
			e.counts[t] = (e.counts[t] ?? 0) + 1;
			if (t !== 'strength') e.km[t] = (e.km[t] ?? 0) + (r.distance_km ?? 0);
			weekMap.set(wk, e);
		}
		const windowPhrase = historyWindowPhrase(range);
		const weekLines =
			[...weekMap.entries()]
				.sort((a, b) => (a[0] > b[0] ? -1 : a[0] < b[0] ? 1 : 0))
				.map(([wk, e]) => {
					const bits = ACTIVITY_TYPES.filter((t) => e.counts[t]).map((t) => {
						const n = e.counts[t]!;
						if (t === 'strength') return `${n} strength`;
						const km = Math.round((e.km[t] ?? 0) * 10) / 10;
						const name = n === 1 ? activityLabel(t).toLowerCase() : activityPlural(t);
						return `${n} ${name}${km ? ` (${km} km)` : ''}`;
					});
					return `- Week of ${wk}: ${bits.join(', ') || 'no sessions'}`;
				})
				.join('\n') || '- (no activities in window)';

		const activityHeading = `${windowPhrase}, newest first`;
		const rows =
			windowRuns
				.map((r) => {
					const feel = [r.effort, r.shins, r.legs, r.energy]
						.map((v) => (v == null ? '–' : v))
						.join('/');
					return `| ${r.date} | ${activityLabel(r.activity_type)} | ${r.distance_km ?? '–'} | ${metricText(r)} | ${r.avg_hr ?? '–'}/${r.max_hr ?? '–'} | ${feel} | ${notesForBriefRow(r)} |`;
				})
				.join('\n') || '| – | – | – | – | – | – | – |';

		const savedTarget = plan.find((w) => w.week === targetWeek);
		const revising = weekHasSessions(savedTarget);
		const targetView = savedTarget ? buildWeekView(savedTarget, allRuns, calendar, today) : null;
		const unplannedSection =
			targetView?.unplanned.length
				? `## Unplanned activities (${weekPhrase})
These logs fall in week ${targetWeek} but did not match a planned session (extra session, rest/empty day, or different sport). They are **already done extra load** — do not add a plan row just to file them. Account for that load when ${revising ? 'revising remaining sessions' : 'planning the week'}.

${formatUnplannedBrief(targetView.unplanned)}
`
				: '';
		const weekStartIso = planWeekStartIso(targetWeek, calendar);
		const weekEndIso = planWeekEndIso(targetWeek, calendar);
		const thisWeekLogs = allRuns
			.filter((r) => r.date >= weekStartIso && r.date <= weekEndIso)
			.sort((a, b) =>
				a.date !== b.date ? (a.date < b.date ? -1 : 1) : (a.slug ?? '').localeCompare(b.slug ?? '')
			);
		const alreadyLoggedSection =
			!revising && thisWeekLogs.length
				? `## Already logged this week
These are already done. If a log matches a skeleton day and sport, that slot is done — keep it in the JSON to match what I did, and plan the remaining days. Logs that are not a skeleton day+sport are extra load; do not add a plan row just to file them.

${thisWeekLogs.map(formatRunBriefLine).join('\n')}
`
				: '';
		const mixSection = formatPatternPromptSection({
			defaultPattern,
			thisWeek: thisPattern,
			weekPhrase,
			note: mixNote
		});
		const exampleJson = JSON.stringify(
			revising && savedTarget
				? {
						week: savedTarget.week,
						dates: savedTarget.dates || weekRange(targetWeek),
						phase: savedTarget.phase,
						focus: savedTarget.focus,
						sessions: savedTarget.sessions
					}
				: {
						week: targetWeek,
						dates: weekRange(targetWeek),
						phase: 'base | build | peak | taper',
						focus: 'one-line focus for the week',
						sessions: exampleSessionsForPattern(thisPattern)
					},
			null,
			2
		);
		const lastMedal = medals[0];
		const lastMedalLine = lastMedal
			? `- Last race: ${lastMedal.name} on ${lastMedal.date}${lastMedal.result?.time ? ` in ${lastMedal.result.time}` : ''}${lastMedal.result?.pace ? ` (${lastMedal.result.pace}/km)` : ''}`
			: '';
		const toward = activeGoal
			? `I'm training toward **${activeGoal.name}** (${activeGoal.distance_km} km) on **${activeGoal.date}**${
					daysToRace != null ? ` — **${daysToRace} days** away` : ''
				}`
			: `There is **no race on the calendar**. Plan ${weekPhrase} as base / consistency training`;
		const ladderLine = activeGoal
			? 'Invent `label`, `distance_km` (null for strength), and intent from how I\'ve been recovering and laddering toward the race. Put duration in `detail` — there is no duration field.'
			: 'Invent `label`, `distance_km` (null for strength), and intent from how I\'ve been recovering. Put duration in `detail` — there is no duration field. No race to peak for — keep it sustainable.';
		const briefAsk = revising
			? `Week ${targetWeek} already has a saved plan (see Training plan). **Revise remaining sessions** given what is already logged, including any unplanned extras. Start from the saved week JSON — do not rebuild from the usual-week skeleton. Keep completed planned sessions in the JSON as they were (a matching Activity log date + sport means done; do not add \`"status": "completed"\` — \`status\` is only for skipped). You may add sessions for extras I propose in the notes — say why. Flag any red flags (injury risk, overtraining, under-recovery).`
			: `Please assess how my training is going and give me a concrete plan for **${weekPhrase}** covering **every session in my usual-week skeleton** (runs, rides, walks, swims, strength — whatever I pinned), keeping those days and sports. ${ladderLine} If a log ${weekPhrase} already matches a skeleton day and sport, that slot is done — keep it in the JSON to match what I did, and plan the remaining days. Flag any red flags (injury risk, overtraining, under-recovery).`;
		const replyRules = revising
			? `Start from the saved week JSON — do not replace it with the usual-week skeleton. Keep completed sessions as they were (do not add \`"status": "completed"\`). Revise what's still ahead, same days and sports unless notes or recovery require a shift. You may add a session for an extra I declared in the notes. If you drop a session, set \`"status": "skipped"\` — a missing log is unlogged, not skipped. Only move a day if you must, and say why in prose.`
			: `Keep \`day\` and \`"activity_type"\` from the skeleton — not a reshuffled template. You invent \`"label"\` (Easy, Quality, Long, tempo, easy spin, endurance ride, Gym, …), \`"distance_km"\` (null for strength), and \`"detail"\`. Put swim/strength time in \`detail\` — there is no duration field. The example labels and distances below are placeholders, not prescriptions. If you drop a session, set \`"status": "skipped"\`. Unlogged ≠ skipped. Only move a day if recovery, heat, life, or the notes require it — and say why in prose.`;

		const laterRaces = store.goals
			.filter((g) => g.status !== 'done' && g.id !== activeGoal?.id)
			.sort((a, b) => a.date.localeCompare(b.date));
		const laterLines = laterRaces
			.map((g) => `- Later: ${g.name} — ${g.distance_km} km on ${g.date} (not the current training target)`)
			.join('\n');
		const goalSection = activeGoal
			? `## Goal
- Race: ${activeGoal.name} — ${activeGoal.distance_km} km on ${activeGoal.date}${daysToRace != null ? ` (~${daysToRace} days to go)` : ''}
- Sport: ${activityLabel(activeGoal.sport)}
- Time goal: ${activeGoal.time_goal || '—'}
${activeGoal.url ? `- Race URL: ${activeGoal.url}` : ''}
${activeGoal.itinerary_url ? `- Itinerary: ${activeGoal.itinerary_url}` : ''}
${(activeGoal.primary ?? []).map((p) => `- Priority: ${p}`).join('\n')}
${laterLines ? `${laterLines}\n` : ''}${activeGoal.notes ? `\n${activeGoal.notes}\n` : ''}`
			: `## Goal
- No active race. This is a base week.
${lastMedalLine}
`;

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

		return `# The Long Run — training context

## Coaching brief
You are my coach for the sports I actually do — not a running-only coach. ${toward}. Keep my usual weekdays and sports unless ${weekPhrase}'s notes or recovery require a shift. You choose the session kind (easy / quality / long / tempo / easy spin / …), distance, and intent. Below is my plan, my recent training with how each session felt (effort and energy 1–10, shins and legs 0–10), weekly volume across sports, and my constraints.

${briefAsk}

## How to read this brief
Goal and Timing come from the race and calendar I set. All-time summary, weekly volume, and the Activity log are auto-computed from logs and are **current**. Runner profile, injury, gear, and race strategy are hand-written and may lag. If they disagree on numbers (longest run, weekly volume), **prefer the computed sections**.

${goalSection}
${timingSection}

## All-time summary (auto-computed from all logged activities — current, not hand-maintained)
- Logged since ${firstDate}: ${byType.run} runs, ${byType.ride} rides, ${byType.walk} walks${byType.swim ? `, ${byType.swim} swims` : ''}${byType.strength ? `, ${byType.strength} strength sessions` : ''}.
- Running: ${totalRunKm} km total across ${runsAll.length} runs; typical pace ~${avgRunPace}/km.
- Longest run: ${longest ? `${longest.distance_km} km (${longest.avg_pace || '—'}/km) on ${longest.date}` : '—'}.
- Shin trend (0–10, lower = better): last 4 runs avg ${shinsRecent ?? '—'} vs prior 4 ${shinsPrior ?? '—'}.

## Weekly volume (${windowPhrase})
${weekLines}

## Activity log (${activityHeading})
${FEEL_SCALE}

| Date | Type | km | pace/speed | HR avg/max | Feel | Notes |
|------|------|----|-----------|-----------|------|-------|
${rows}

## Training plan
${plan.length ? formatTrainingPlanBrief(plan, targetWeek, calendar) : '(no plan set)'}

${unplannedSection}${unplannedSection ? '\n' : ''}${alreadyLoggedSection}${alreadyLoggedSection ? '\n' : ''}${gearSectionForBrief(gearInventory, allRuns)}

## Runner profile
${profile.trim() || '(none)'}

## Injury rules
${injury.trim() || '(none)'}

## Fueling & checklist
${gear.trim() || '(none)'}

## Race strategy
${raceStrategy.trim() || '(none)'}

${mixSection}

## When you reply
Give your assessment and ${weekPhrase}'s sessions in prose. Then, so I can save it straight back into my app, also output **${weekPhrase} as one JSON object** in exactly this shape (real values, same keys). ${replyRules}

\`\`\`json
${exampleJson}
\`\`\`
`;
	});

export const getWeekPattern = createServerFn({ method: 'GET' }).handler(async () => {
	const s = await loadSettings();
	return s.weekPattern;
});

export const saveWeekPattern = createServerFn({ method: 'POST' }).middleware([requireAuth])
	.validator((pattern: WeekPattern) => normalizeWeekPattern(pattern))
	.handler(async ({ data }) => saveWeekPatternSetting(data));

function hasFeel(r: RunRecord): boolean {
	return (
		r.effort != null ||
		r.shins != null ||
		r.legs != null ||
		r.energy != null ||
		r.wanted_faster != null ||
		(r.surface ?? '').trim() !== '' ||
		((r.notes ?? '').trim() !== '' && !isImportNote(r.notes))
	);
}

function formatRunBriefLine(r: RunRecord): string {
	const feel = [r.effort, r.shins, r.legs, r.energy]
		.map((v) => (v == null ? '–' : v))
		.join('/');
	const notes = (r.notes || '').replace(/\s+/g, ' ').trim().slice(0, 180);
	return `- ${r.date} (${r.day || '—'}) ${activityLabel(r.activity_type)} ${r.distance_km ?? '–'} km · ${metricText(r)} · HR ${r.avg_hr ?? '–'}/${r.max_hr ?? '–'} · feel ${feel}${notes ? ` · ${notes}` : ''} · slug \`${r.slug}\``;
}

function parseDebriefSlugs(raw: string): string[] {
	return [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))];
}

function compareDebriefRuns(a: RunRecord, b: RunRecord) {
	if (a.date !== b.date) return a.date < b.date ? -1 : 1;
	const ta = a.start_time || '';
	const tb = b.start_time || '';
	if (ta !== tb) return ta < tb ? -1 : 1;
	return (a.slug ?? '').localeCompare(b.slug ?? '');
}

/** AM+PM commutes (and anything else that day) belong in one debrief, even if the URL has one slug. */
function expandDebriefToSameDays(seed: RunRecord[], pool: RunRecord[]): RunRecord[] {
	if (!seed.length) return [];
	const dates = new Set(seed.map((r) => r.date));
	const bySlug = new Map<string, RunRecord>();
	for (const r of pool) {
		if (dates.has(r.date)) bySlug.set(r.slug, r);
	}
	for (const r of seed) bySlug.set(r.slug, r);
	return [...bySlug.values()].sort(compareDebriefRuns);
}

function debriefRunSummary(r: RunRecord) {
	return {
		slug: r.slug,
		date: r.date,
		day: r.day,
		distance_km: r.distance_km,
		avg_pace: r.avg_pace,
		hasFeel: hasFeel(r),
		activity_type: r.activity_type,
		effort: r.effort,
		shins: r.shins,
		legs: r.legs,
		energy: r.energy,
		wanted_faster: r.wanted_faster,
		surface: r.surface,
		notes: r.notes
	};
}

function formatFeelLogged(r: RunRecord): string {
	const scores = [
		`effort ${r.effort ?? '–'}`,
		`shins ${r.shins ?? '–'}`,
		`legs ${r.legs ?? '–'}`,
		`energy ${r.energy ?? '–'}`
	];
	if (showsFeel(r.activity_type, 'wanted_faster')) {
		scores.push(
			`wanted faster ${r.wanted_faster === true ? 'yes' : r.wanted_faster === false ? 'no' : '–'}`
		);
	}
	const surface = (r.surface ?? '').trim();
	const notesRaw = (r.notes ?? '').trim();
	const notes = notesRaw && !isImportNote(notesRaw) ? notesRaw : '';
	if (!hasFeel(r) && !notes) {
		return `- \`${r.slug}\`: not logged yet — do not invent scores.`;
	}
	return `- \`${r.slug}\`: ${scores.join(' · ')}${surface ? ` · surface ${surface}` : ''}${
		notes ? `\n  ${notes}` : ''
	}`;
}

export const getDebriefPrompt = createServerFn({ method: 'GET' })
	.validator((d: { slug?: string; includePlan?: boolean } | string) => {
		if (typeof d === 'string') return { slug: d, includePlan: true };
		return {
			slug: typeof d?.slug === 'string' ? d.slug : '',
			includePlan: d?.includePlan !== false
		};
	})
	.handler(async ({ data }) => {
		const { slug, includePlan } = data;
		const [allRuns, week, injury, settings, training] = await Promise.all([
			listRuns(),
			currentPlanWeek(),
			readContextFile('injury.md'),
			loadSettings(),
			loadTrainingContext()
		]);
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
		const featured = expandDebriefToSameDays(featuredUnsorted, allRuns);
		if (!featured.length) {
			return {
				prompt: '',
				run: null,
				runs: [],
				weekView,
				error: 'Import this session’s GPX first — the prompt needs those numbers.'
			};
		}

		const weekRuns = weekStart
			? allRuns
					.filter((r) => r.date >= weekStart && r.date <= weekEnd)
					.sort(byDateNewestFirst)
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
					return `- ${s.day}${s.date ? ` (${s.date})` : ''}: ${activityLabel(s.activity_type ?? 'run')} · ${s.label}${s.distance_km != null ? ` · ${s.distance_km} km` : ''} — ${s.detail} [${state}]`;
				})
				.join('\n') ?? '- (no plan week)';
		const unplannedLines = weekView?.unplanned.length
			? formatUnplannedBrief(weekView.unplanned)
			: '';

		const many = featured.length > 1;
		const sessionWord = many ? 'these sessions' : 'this session';
		const sessionHeading = many ? 'These sessions' : 'This session';
		const sessionBlock = featured.map(formatRunBriefLine).join('\n');
		const feelBlock = featured.map(formatFeelLogged).join('\n');
		const job = includePlan
			? `Coach from ${sessionWord}: how it went, recovery, and what to watch. Then update **this week** only if remaining sessions should change. Keep remaining sessions on their planned days unless recovery requires a shift — and if you move a day, say why. Keep non-run sessions unless recovery says otherwise.`
			: `Coach from ${sessionWord}: how it went, recovery, and what to watch next. Do not rewrite my week plan — this chat is advice only.`;
		const planSections = includePlan
			? `
## Current week plan${week ? ` — week ${week.week} (${week.dates}) · ${week.phase} · ${week.focus}` : ''}
${sessionLines}

${unplannedLines ? `## Unplanned activities this week\nThese logs did not match a planned session — extra load, already done. Do not add a plan row just to file them.\n${unplannedLines}\n` : ''}`
			: '';
		const reply = includePlan
			? `## When you reply
Lead with coaching advice in prose (how ${sessionWord} went, recovery, and whether anything ahead should change). After the advice, output one fenced JSON object I can paste back — the JSON is what I save; the advice is not.

\`\`\`json
{
  "week": {
    "week": ${week?.week ?? 0},
    "dates": ${JSON.stringify(week?.dates ?? '')},
    "phase": ${JSON.stringify(week?.phase ?? '')},
    "focus": "one-line focus after ${sessionWord}",
    "sessions": [
      { "day": "Friday", "activity_type": "run", "label": "Easy", "distance_km": 7, "detail": "copy each day from Current week plan — do not use this Friday row as-is" }
    ]
  }
}
\`\`\`

Rules:
- Do not return a \`feelings\` object — I already logged how ${sessionWord} felt in the app.
- \`week.sessions\` is the **full week** from Current week plan: keep completed/skipped rows as they were, rewrite what's still ahead. Every session needs \`"activity_type"\`. Only move a day if you must, and say why.
- To drop a session, set \`"status": "skipped"\` (and why in \`detail\`). Unlogged ≠ skipped.
- If the week is finished, return the same session rows unchanged — do not invent a completed status (\`status\` is only \`"skipped"\`).
`
			: `## When you reply
Lead with coaching advice in prose (how ${sessionWord} went, recovery, and the next session). Do not return JSON or a week plan.
`;

		const prompt = `# The Long Run — debrief ${sessionWord}

You are my coach for the sports I train, not a running-only coach. GPS numbers and how I felt are below. I may attach Strava screenshots for extra context.
${FEEL_SCALE}

${job}

## Usual weekdays
${formatPatternLines(settings.weekPattern)}

## ${sessionHeading}
${sessionBlock}

## How I felt (logged in the app — treat as ground truth)
${feelBlock}

## Other activities already logged this week
${otherThisWeek.length ? otherThisWeek.map(formatRunBriefLine).join('\n') : `- (none besides ${many ? 'these' : 'this one'})`}
${planSections}
## Injury rules
${injury.trim() || '(none)'}

${reply}`;
		const runs = featured.map(debriefRunSummary);
		return {
			prompt,
			run: runs[runs.length - 1] ?? null,
			runs,
			weekView,
			error: null as string | null
		};
	});

export type ActivityFeelInput = {
	slug: string;
	effort: number | null;
	shins: number | null;
	legs: number | null;
	energy: number | null;
	wanted_faster: boolean | null;
	surface?: string;
	notes?: string;
};

export const saveActivityFeel = createServerFn({ method: 'POST' }).middleware([requireAuth])
	.validator((d: ActivityFeelInput) => d)
	.handler(async ({ data }) => {
		const patch: FeelingsPatch = {
			effort: data.effort,
			shins: data.shins,
			legs: data.legs,
			energy: data.energy,
			wanted_faster: data.wanted_faster
		};
		if (data.surface !== undefined) patch.surface = data.surface.trim();
		if (data.notes !== undefined) patch.notes = data.notes.trim();
		const ok = await updateRunFeelings(data.slug, patch);
		if (!ok) throw new Error('Activity not found.');
		return { ok: true as const, slug: data.slug };
	});

// ---------- mutations ----------

export type CreateRunInput = {
	date: string;
	activity_type: string;
	session: string;
	effort: number | null;
	shins: number | null;
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
};

export const createRun = createServerFn({ method: 'POST' }).middleware([requireAuth])
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
			weather = await fetchWeatherForDateTime(date, start_time || null, null, null, time || null);
		}
		const run = await saveRun({
			date,
			week,
			day,
			activity_type: normalizeActivityType(data.activity_type),
			session,
			effort: data.effort,
			shins: data.shins,
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
			notes: data.notes
		});
		await rememberGearName(run.gear, run.activity_type);
		return { slug: run.slug };
	});

export const importGpx = createServerFn({ method: 'POST' }).middleware([requireAuth])
	.validator((d: { xml: string; activityType?: string }) => d)
	.handler(async ({ data }) => {
		const parsed = parseGpx(data.xml);
		if (!parsed.date) {
			if (parsed.points.length >= 2) {
				throw new Error(
					'This GPX has a track but no timestamps — it looks like a planned BRouter route. Save it from Routes instead of Import.'
				);
			}
			throw new Error('Could not read a date/time from that GPX file.');
		}

		const activity_type = normalizeActivityType(data.activityType || parsed.detectedType);
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
						p.elev != null && Number.isFinite(p.elev)
							? [p.lng, p.lat, p.elev]
							: [p.lng, p.lat]
					)
				}
			};
			await saveRouteGeoJson(id, geojson);
			route = existingDup?.route || `/routes/${id}.json`;
		}

		// Matched an existing activity → refresh its map/analytics, keep subjective data, no dup.
		if (existingDup) {
			if (route && route !== existingDup.route) await setRunRoute(existingDup.slug, route);
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

		const weather = await fetchWeatherForDateTime(
			parsed.date,
			parsed.startClock || null,
			null,
			null,
			parsed.time || null
		);

		// Reverse-geocode the start coordinate for country / province / municipality (best-effort).
		const geo =
			parsed.startLat != null && parsed.startLng != null
				? await reverseGeocode(parsed.startLat, parsed.startLng)
				: { country: '', province: '', place: '' };

		const kind = gearKindForActivity(activity_type);
		const importedGear = kind ? (await loadGear())[kind].active : '';

		const run = await saveRun({
			date: parsed.date,
			week,
			day,
			activity_type,
			session,
			effort: null,
			shins: null,
			legs: null,
			energy: null,
			weather,
			surface: '',
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

export const repairRunGps = createServerFn({ method: 'POST' }).middleware([requireAuth])
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
		if (plannedSlug && pins.length < 2 && !planned) throw new Error('That planned route was not found.');

		let out = pins.length >= 2 ? densifyWaypoints(pins) : planned ? samplesFromGeoJson(planned.geojson) : [];
		let source: 'waypoints' | 'waypoints-network' | 'planned' = pins.length >= 2 ? 'waypoints' : 'planned';

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
					throw new Error('Could not follow roads between those pins. Uncheck Follow roads to save the straight line.');
				}
			}
		}

		if (out.length < 2) {
			throw new Error('Drop at least two waypoints on the map, or pick a saved route.');
		}

		const durationSec =
			parseDurationSeconds(run.elapsed_time) ??
			parseDurationSeconds(run.time) ??
			parseDurationSeconds(planned?.est_time ?? '');
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

export const previewGpsNetwork = createServerFn({ method: 'POST' }).middleware([requireAuth])
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
	shins: number | null;
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
};

export const updateRun = createServerFn({ method: 'POST' }).middleware([requireAuth])
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
			shins: data.shins,
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
			notes: data.notes
		};
		const run = await dbUpdateRun(data.slug, fields);
		await rememberGearName(run.gear, run.activity_type);
		return { slug: run.slug };
	});

export const deleteRun = createServerFn({ method: 'POST' }).middleware([requireAuth])
	.validator((slug: string) => slug)
	.handler(async ({ data: slug }) => {
		return dbDeleteRun(slug);
	});

export const deleteRunsFn = createServerFn({ method: 'POST' }).middleware([requireAuth])
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
		const hrMaxEffective = hrMaxManual ?? allTimeMaxHr ?? null;
		let analytics = combinedAnalytics(parts, {
			avgHr: stats.avg_hr,
			maxHr: stats.max_hr,
			profileMaxHr: hrMaxEffective
		});
		if (hrMaxEffective && analytics) {
			const hrZones = buildHrZoneSummary({
				hrMax: hrMaxEffective,
				source: hrMaxManual != null ? 'profile' : 'alltime',
				avgHr: stats.avg_hr,
				samples: (analytics.hrSamples ?? []).map((s) => ({ timeMs: s.t * 1000, hr: s.hr }))
			});
			analytics = { ...analytics, hrZones };
		}
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

export const createActivityGroupFn = createServerFn({ method: 'POST' }).middleware([requireAuth])
	.validator((d: { slugs: string[]; name?: string }) => d)
	.handler(async ({ data }) => {
		const group = await createActivityGroup(data.slugs, data.name ?? '');
		return { id: group.id };
	});

export const addToActivityGroupFn = createServerFn({ method: 'POST' }).middleware([requireAuth])
	.validator((d: { groupId: string; slug: string }) => d)
	.handler(async ({ data }) => {
		await addActivityToGroup(data.groupId, data.slug);
		return { ok: true };
	});

export const removeFromActivityGroupFn = createServerFn({ method: 'POST' }).middleware([requireAuth])
	.validator((d: { groupId: string; slug: string }) => d)
	.handler(async ({ data }) => {
		await removeActivityFromGroup(data.groupId, data.slug);
		return { ok: true };
	});

export const ungroupActivitiesFn = createServerFn({ method: 'POST' }).middleware([requireAuth])
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
		const fileBase = safeFilename(`combined-${stats.mixed ? 'mix' : stats.activity_type}-${stats.date}`);

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
		const mime =
			data.kind === 'tcx' ? 'application/vnd.garmin.tcx+xml' : 'application/gpx+xml';
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
			unique.map((slug) => all.find((r) => r.slug === slug)).filter((r): r is RunRecord => r != null)
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
	const start = trimmed.search(/[\[{]/);
	if (start >= 0) {
		const parsed = tryParse(trimmed.slice(start));
		if (parsed.ok) return parsed.value;
	}
	throw new Error('That is not valid JSON — paste the JSON block your AI returned.');
}

function asPlanWeeks(parsed: unknown): PlanWeek[] {
	const incoming = (Array.isArray(parsed) ? parsed : [parsed]).filter(
		(w): w is PlanWeek =>
			Boolean(w) &&
			typeof w === 'object' &&
			typeof (w as PlanWeek).week === 'number' &&
			Array.isArray((w as PlanWeek).sessions)
	);
	return incoming;
}

async function mergePlanWeeks(incoming: PlanWeek[]): Promise<{ weeks: number; updated: number[] }> {
	if (!incoming.length) throw new Error('No plan week found in that JSON.');
	const { calendar } = await loadTrainingContext();
	for (const w of incoming) {
		if (typeof w.week !== 'number') throw new Error('Each week needs a numeric "week".');
		if (!Array.isArray(w.sessions)) throw new Error(`Week ${w.week} has no "sessions" array.`);
		if (!Number.isInteger(w.week) || w.week < 1 || w.week > calendar.weekCount) {
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
			dates: w.dates?.trim() ? w.dates : planWeekDateRange(w.week, calendar),
			sessions: w.sessions.map((s) => {
				const { status, ...rest } = s;
				return isSkippedStatus(status) ? { ...rest, status: 'skipped' as const } : rest;
			})
		});
	}
	const merged = [...byWeek.values()]
		.filter((w) => w.week >= 1 && w.week <= calendar.weekCount)
		.sort((a, b) => a.week - b.week);
	await savePlan(merged);
	return { weeks: merged.length, updated: incoming.map((w) => w.week) };
}

async function applyFeelingsRows(
	rows: Record<string, unknown>[]
): Promise<{ updated: number; missing: string[] }> {
	const score = (v: unknown, lo: number, hi: number): number | null => {
		const n = Number(v);
		if (!Number.isFinite(n)) return null;
		return Math.max(lo, Math.min(hi, Math.round(n)));
	};
	const updated: string[] = [];
	const missing: string[] = [];
	for (const a of rows) {
		const slug = String(a.slug);
		const patch: FeelingsPatch = {};
		if ('effort' in a) patch.effort = score(a.effort, 1, 10);
		if ('shins' in a) patch.shins = score(a.shins, 0, 10);
		if ('legs' in a) patch.legs = score(a.legs, 0, 10);
		if ('energy' in a) patch.energy = score(a.energy, 1, 10);
		if ('wanted_faster' in a)
			patch.wanted_faster =
				a.wanted_faster === true ? true : a.wanted_faster === false ? false : null;
		if (typeof a.surface === 'string') patch.surface = a.surface.trim();
		if (typeof a.notes === 'string') patch.notes = a.notes.trim();
		const ok = await updateRunFeelings(slug, patch);
		(ok ? updated : missing).push(slug);
	}
	return { updated: updated.length, missing };
}

function feelingsRowsFrom(parsed: unknown): Record<string, unknown>[] {
	if (!parsed || typeof parsed !== 'object') return [];
	const o = parsed as Record<string, unknown>;
	const list: unknown[] = Array.isArray(o)
		? o
		: Array.isArray(o.activities)
			? o.activities
			: Array.isArray(o.feelings)
				? o.feelings
				: o.feelings && typeof o.feelings === 'object'
					? Array.isArray((o.feelings as { activities?: unknown }).activities)
						? (o.feelings as { activities: unknown[] }).activities
						: [o.feelings]
					: [];
	return list.filter(
		(a): a is Record<string, unknown> =>
			Boolean(a) &&
			typeof a === 'object' &&
			!Array.isArray(a) &&
			typeof (a as { slug?: unknown }).slug === 'string'
	);
}

/** Merge AI-returned plan week(s) into plan.json (replace by week number, keep the rest). */
export const savePlanWeeks = createServerFn({ method: 'POST' }).middleware([requireAuth])
	.validator((jsonText: string) => jsonText)
	.handler(async ({ data: jsonText }) => {
		return mergePlanWeeks(asPlanWeeks(parseJsonPayload(jsonText)));
	});

/** Save a debrief reply: feelings for this run + an updated week plan. */
export const saveDebrief = createServerFn({ method: 'POST' }).middleware([requireAuth])
	.validator((jsonText: string) => jsonText)
	.handler(async ({ data: jsonText }) => {
		const parsed = parseJsonPayload(jsonText);
		const rows = feelingsRowsFrom(parsed);
		const obj = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
		const weekBlob = obj.week ?? (asPlanWeeks(parsed).length ? parsed : null);
		const weeks = asPlanWeeks(weekBlob);
		if (!rows.length && !weeks.length) {
			throw new Error('Need a "feelings" object and/or a "week" with sessions in that JSON.');
		}
		const feelings = rows.length
			? await applyFeelingsRows(rows)
			: { updated: 0, missing: [] as string[] };
		const plan = weeks.length ? await mergePlanWeeks(weeks) : { weeks: 0, updated: [] as number[] };
		return {
			feelingsUpdated: feelings.updated,
			feelingsMissing: feelings.missing,
			planWeeks: plan.weeks,
			planUpdated: plan.updated
		};
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
		const all = (await listRuns()).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
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
		const prompt = `# The Long Run — capture how each activity felt

From our conversation, summarise how I felt for each activity below (${rangeLabel}). I describe things like the road/terrain, shin soreness, energy, whether I wanted to run more or faster, and how my legs felt.

Return ONLY a JSON block in exactly this shape — no prose before or after:

\`\`\`json
{
  "activities": [
    {
      "slug": ${JSON.stringify(exampleSlug)},
      "effort": 6,
      "shins": 3,
      "legs": 7,
      "energy": 7,
      "wanted_faster": true,
      "surface": "wet asphalt",
      "notes": "My shins were tight the first 2 km, then opened up after the turnaround."
    }
  ]
}
\`\`\`

Rules:
- Copy \`slug\` from the table — do not use the example slug if it is not in the table. Do not copy example numbers.
- ${FEEL_SCALE} \`wanted_faster\` is true/false.
- Omit any field you have no information for; omit an activity entirely if I said nothing about it.
- Keep \`notes\` short and in my voice (first person).

## Activities (${from} → ${to})
| slug | date | type | distance | current feel |
|------|------|------|----------|--------------|
${table}
`;
		return { prompt, count: targets.length, from, to };
	});

/** Save AI-summarised feelings back onto activities by slug (subjective fields only). */
export const saveFeelings = createServerFn({ method: 'POST' }).middleware([requireAuth])
	.validator((jsonText: string) => jsonText)
	.handler(async ({ data: jsonText }) => {
		const rows = feelingsRowsFrom(parseJsonPayload(jsonText));
		if (!rows.length) throw new Error('No activities with a "slug" were found in that JSON.');
		return applyFeelingsRows(rows);
	});

export const saveGear = createServerFn({ method: 'POST' }).middleware([requireAuth])
	.validator((d: GearContext) => d)
	.handler(async ({ data }) => {
		await persistGear(data);
		return { ok: true };
	});

const EDITABLE = new Set(CONTEXT_FILES.map((f) => f.name));

export const saveContextFile = createServerFn({ method: 'POST' }).middleware([requireAuth])
	.validator((d: { name: string; body: string }) => d)
	.handler(async ({ data }) => {
		const name = data.name.trim();
		let body = data.body;
		if (!EDITABLE.has(name) || name.includes('..') || name.includes('/') || name.includes('\\')) {
			throw new Error('That file cannot be edited.');
		}
		if (name.endsWith('.json')) {
			const trimmed = body.trim();
			if (!trimmed) body = '[]\n';
			try {
				JSON.parse(body);
			} catch {
				throw new Error('plan.json must be valid JSON.');
			}
		}
		if (body.length > 0 && !body.endsWith('\n')) body = `${body}\n`;
		await writeContextFile(name, body);
		return { ok: true };
	});

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type GoalBriefDraft = {
	name: string;
	date: string;
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
		const [allRuns, training, injury, raceStrategy] = await Promise.all([
			listRuns(),
			loadTrainingContext(),
			readContextFile('injury.md'),
			readContextFile('race-strategy.md')
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
		const daysToRace =
			data.date && ISO_DATE_RE.test(data.date) ? Math.max(0, daysUntil(data.date) ?? 0) : null;
		const lastMedal = medals[0];
		const lastMedalLine = lastMedal
			? `- Last race: ${lastMedal.name} on ${lastMedal.date}${lastMedal.result?.time ? ` in ${lastMedal.result.time}` : ''}${lastMedal.result?.pace ? ` (${lastMedal.result.pace}/km)` : ''}`
			: '- Last race: (none pinned yet)';
		const activityRows =
			windowRuns
				.map((r) => {
					const feel = [r.effort, r.shins, r.legs, r.energy]
						.map((v) => (v == null ? '–' : v))
						.join('/');
					return `| ${r.date} | ${activityLabel(r.activity_type)} | ${r.distance_km ?? '–'} | ${metricText(r)} | ${r.avg_hr ?? '–'}/${r.max_hr ?? '–'} | ${feel} | ${notesForBriefRow(r)} |`;
				})
				.join('\n') || '| – | – | – | – | – | – | – |';
		const extra = data.extra.trim();
		const exampleJson = JSON.stringify(
			{
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
			},
			null,
			2
		);
		return `# The Long Run — race brief

## Coaching brief
You are helping me set this race in my training app. Propose **priorities** (how I should train toward it) and **notes** (course, logistics, race-day intent). Keep every identity field and any priorities/notes I already filled unless I asked to change them. Fill empty identity fields only from the race URL, itinerary URL, or my extra notes — do not guess.

## Race (current draft)
- Name: ${data.name.trim() || '(empty — fill if you can)'}
- Date: ${data.date || '(empty)'}
- Distance: ${distanceKm != null ? `${distanceKm} km` : '(empty)'}
- Sport: ${activityLabel(sport)}
- Time goal: ${data.time_goal.trim() || '(empty)'}
- Plan starts (Monday): ${data.plan_start || '(empty)'}
${daysToRace != null ? `- Days to race: ${daysToRace}${daysToRace === 0 ? ' (race day or already past)' : ''}` : ''}
- Race URL: ${data.url.trim() || '(none)'}
- Itinerary URL: ${data.itinerary_url.trim() || '(none)'}
- Current priorities:
${primaryLines.length ? primaryLines.map((p) => `  - ${p}`).join('\n') : '  - (none yet)'}
- Current notes: ${data.notes.trim() || '(none yet)'}

Today is ${todayIso}.
${lastMedalLine}

${extra ? `## Extra from me\n${extra}\n` : ''}## Recent training (${range.label.toLowerCase()}, newest first)
${FEEL_SCALE} Use this to keep priorities honest (volume, shin load, what is already working).

| Date | Type | km | pace/speed | HR avg/max | Feel | Notes |
|------|------|----|-----------|-----------|------|-------|
${activityRows}

## Injury rules
${injury.trim() || '(none)'}

## Race strategy (hand-written, may lag)
${raceStrategy.trim() || '(none)'}

## When you reply
Give a short assessment in prose if you want. Then output **one JSON object** I can paste back, with exactly these keys. If a draft field is empty, leave it \`""\`, \`null\`, or \`[]\` unless a URL or my extra notes make it clear. Do not copy example placeholders. \`primary\` is an array of 3–6 short priorities (one line each). \`notes\` is a few sentences on course / logistics / race-day intent. Keep any URL I gave.

\`\`\`json
${exampleJson}
\`\`\`
`;
	});

export const getGoalsData = createServerFn({ method: 'GET' }).handler(async () => {
	const [training, runs] = await Promise.all([loadTrainingContext(), listRuns()]);
	const { activeGoal, medals, calendar, store } = training;
	const upcoming = store.goals
		.filter((g) => g.status !== 'done' && g.id !== activeGoal?.id)
		.sort((a, b) => a.date.localeCompare(b.date));
	const candidatesByGoalId: Record<string, ReturnType<typeof pinCandidatesForGoal>> = {};
	for (const g of store.goals) {
		if (!canPinRaceResult(g)) continue;
		candidatesByGoalId[g.id] = pinCandidatesForGoal(g, runs);
	}
	return {
		activeGoal,
		upcoming,
		medals,
		calendar,
		candidatesByGoalId
	};
});

export const saveActiveGoal = createServerFn({ method: 'POST' }).middleware([requireAuth])
	.validator((d: GoalInput) => d)
	.handler(async ({ data }) => {
		const name = data.name.trim();
		const date = data.date.trim();
		if (!name) throw new Error('Give the race a name.');
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Race date must be YYYY-MM-DD.');
		const store = await loadGoalStore();
		const existing = data.id ? (store.goals.find((g) => g.id === data.id) ?? null) : null;
		const next = normalizeGoalInput(data, existing);
		if (next.date < next.plan_start) {
			throw new Error('Race day needs to be on or after the plan start.');
		}
		if (store.goals.some((g) => g.id === next.id && g.id !== existing?.id)) {
			throw new Error('A race with that name and date is already on the calendar.');
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
			activeName: active?.name ?? next.name
		};
	});

export const completeGoal = createServerFn({ method: 'POST' }).middleware([requireAuth])
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

export const clearGoal = createServerFn({ method: 'POST' }).middleware([requireAuth])
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

export const importPlannedRoute = createServerFn({ method: 'POST' }).middleware([requireAuth])
	.validator((d: { text: string; filename: string }) => d)
	.handler(async ({ data }) => {
		const route = await savePlannedFromFile(data);
		return {
			slug: route.slug,
			name: route.name,
			distance_km: route.distance_km
		};
	});

export const createPlannedRoute = createServerFn({ method: 'POST' }).middleware([requireAuth])
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

		const route = await savePlannedFromTrack({
			name,
			points,
			waypoints: pins.map((p, i) => ({
				name: i === 0 ? 'Start' : i === pins.length - 1 ? 'Finish' : `Via ${i}`,
				lat: p.lat,
				lng: p.lng
			}))
		});
		return {
			slug: route.slug,
			name: route.name,
			distance_km: route.distance_km
		};
	});

export const updatePlannedRoute = createServerFn({ method: 'POST' }).middleware([requireAuth])
	.validator((d: { slug: string; name?: string; notes?: string }) => d)
	.handler(async ({ data }) => {
		const route = await dbUpdatePlannedRoute(data.slug, { name: data.name, notes: data.notes });
		if (!route) throw new Error('Route not found.');
		return { slug: route.slug };
	});

export const deletePlannedRoute = createServerFn({ method: 'POST' }).middleware([requireAuth])
	.validator((slug: string) => slug)
	.handler(async ({ data: slug }) => {
		return dbDeletePlannedRoute(slug);
	});

export const attachPlannedRoute = createServerFn({ method: 'POST' }).middleware([requireAuth])
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

export const detachPlannedRoute = createServerFn({ method: 'POST' }).middleware([requireAuth])
	.validator((d: { slug: string; id: number }) => d)
	.handler(async ({ data }) => {
		const ok = await dbDetachRouteLink(data.id, data.slug);
		if (!ok) throw new Error('Link not found.');
		return { ok: true as const };
	});
