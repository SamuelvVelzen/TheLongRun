import { ACTIVITY_TYPES, activityLabel, activityPlural, metricText, normalizeActivityType, showsField } from '$lib/activity';
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
import { dateRangeFromSearch, filterRunsByRange, type DateRange, type RangeKind } from '$lib/date-range';
import {
    dayFromIsoDate,
    formatDuration,
    guessSession,
    normalizeStartTime,
    parseDurationSeconds
} from '$lib/format';
import { canPinRaceResult, normalizeGoalInput, pickSoonestOpenGoal, pinCandidatesForGoal, resultFromActivity, type GoalInput } from '$lib/goals';
import { buildHrZoneSummary } from '$lib/hr-zones';
import { renderJsonPretty, renderMarkdown } from '$lib/markdown';
import {
    buildWeekView,
    calendarFromGoal,
    dateForSessionDay,
    daysUntil,
    formatUnplannedBrief,
    isoDateLocal,
    keepSoonestNext,
    mondayIso,
    pickBannerWeekView,
    plannedSessionFor,
    planWeekDateRange,
    planWeekEndIso,
    planWeekIndex,
    planWeekStartIso,
    sessionStreak,
    upcomingPlanSessions,
    weekNumberForDate,
    weekToPlan,
    isSkippedStatus,
    withSessionRoutes,
    type PlanCalendar,
    type WeekView
} from '$lib/plan';
import {
    formatShoeKm,
    shoeKey,
    wearByShoe,
    type ShoeContext
} from '$lib/shoes';
import { analyticsToProperties, type RouteAnalytics } from '$lib/splits';
import { parseStrengthNotes, strengthSummary } from '$lib/strength';
import type {
    ActivityAttachOption,
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
import { createServerFn } from '@tanstack/react-start';
import matter from 'gray-matter';
import { requireAuth } from './auth';
import {
    currentPlanWeek,
    loadGoalStore,
    loadPlan,
    loadSettings,
    loadShoes,
    loadTrainingContext,
    persistShoes,
    readContextFile,
    rememberShoeName,
    saveGoalStore,
    saveHrMaxSetting,
    savePlan,
    saveWeekPatternSetting,
    writeContextFile
} from './context';
import { reverseGeocode } from './geo';
import { parseGpx } from './gpx';
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
    savePlannedFromFile
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
    setRunRoute,
    updateRunFeelings,
    type FeelingsPatch,
    type UpdateRunFields
} from './runs';
import { fetchWeatherForDateTime } from './weather';

const withMap = (runs: RunRecord[], routeIds: Set<string>): RunWithMap[] =>
	runs.map((r) => ({ ...r, has_map: runHasMap(r, routeIds) }));

function attachPlanRoutes(weekView: WeekView | null, planRefs: Awaited<ReturnType<typeof listPlanRouteRefs>>): WeekView | null {
	if (!weekView) return null;
	const byDay = new Map<string, SessionRouteRef>();
	for (const ref of planRefs) {
		if (ref.week !== weekView.week.week) continue;
		byDay.set(ref.day.trim().toLowerCase(), {
			slug: ref.slug,
			name: ref.name,
			distance_km: ref.distance_km
		});
	}
	return withSessionRoutes(weekView, byDay);
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
	const [runs, tracks, routeIds, training, shoes, planRefs] = await Promise.all([
		listRuns(),
		listRouteTracks(),
		listRouteIds(),
		loadTrainingContext(),
		loadShoes(),
		listPlanRouteRefs()
	]);
	const { plan, calendar, activeGoal, medals } = training;
	const weekNum = weekToPlan(calendar);
	const week = plan.find((w) => w.week === weekNum) ?? plan[plan.length - 1] ?? null;
	const weekView = attachPlanRoutes(pickBannerWeekView(plan, runs, calendar), planRefs);
	return {
		runs: withMap(runs, routeIds),
		tracks,
		week,
		weekView,
		streak: sessionStreak(runs, plan, calendar),
		activeGoal,
		lastMedal: medals[0] ?? null,
		calendar,
		shoes
	} satisfies {
		runs: RunWithMap[];
		tracks: RouteTrack[];
		week: PlanWeek | null;
		weekView: WeekView | null;
		streak: number;
		activeGoal: Goal | null;
		lastMedal: Goal | null;
		calendar: PlanCalendar;
		shoes: { active: string; notes: string; rotation: string[]; retired: string[] };
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
	const [runs, training, planRefs] = await Promise.all([
		listRuns(),
		loadTrainingContext(),
		listPlanRouteRefs()
	]);
	const { plan, calendar, activeGoal } = training;
	const views = keepSoonestNext(
		plan
			.filter((w) => (w.sessions?.length ?? 0) > 0)
			.sort((a, b) => a.week - b.week)
			.map((w) => attachPlanRoutes(buildWeekView(w, runs, calendar), planRefs))
			.filter((v): v is NonNullable<typeof v> => v != null)
	);
	return { views, currentWeek: weekToPlan(calendar), calendar, activeGoal };
});

export const getTimelineRuns = createServerFn({ method: 'GET' }).handler(async () => {
	const [runs, routeIds] = await Promise.all([listRuns(), listRouteIds()]);
	await hydrateBestEfforts(runs);
	return withMap(runs, routeIds);
});

export const getRunDetail = createServerFn({ method: 'GET' })
	.validator((slug: string) => slug)
	.handler(async ({ data: slug }) => {
		const run = await getRun(slug);
		if (!run) return null;
		const [analytics, routeIds, shoes, settings, allTimeMaxHr, allRuns, plannedRoute, training] =
			await Promise.all([
				loadRouteAnalytics(run),
				listRouteIds(),
				loadShoes(),
				loadSettings(),
				getMaxHrAllTime(),
				listRuns(),
				getActivityRouteRef(slug),
				loadTrainingContext()
			]);
		await hydrateBestEfforts(allRuns);
		const current = allRuns.find((r) => r.slug === slug) ?? run;
		const highlights = highlightsForActivity(current.slug, current.activity_type, allRuns);

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

		return {
			run: { ...current, has_map: runHasMap(current, routeIds) } as RunWithMap,
			analytics: out,
			shoes,
			shoeWear: wearByShoe(allRuns),
			hrMaxManual,
			hrMaxAllTime: allTimeMaxHr,
			bestEfforts: highlights,
			plannedRoute,
			calendar: training.calendar
		};
	});

export const saveHrMax = createServerFn({ method: 'POST' }).middleware([requireAuth])
	.validator((hrMax: number | null) => hrMax)
	.handler(async ({ data }) => {
		await saveHrMaxSetting(data);
		return { ok: true };
	});

export const getLogDefaults = createServerFn({ method: 'GET' }).handler(async () => {
	const [week, shoes, runs, training] = await Promise.all([
		currentPlanWeek(),
		loadShoes(),
		listRuns(),
		loadTrainingContext()
	]);
	return { week, shoes, shoeWear: wearByShoe(runs), calendar: training.calendar };
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
	{ name: 'shoes.md', title: 'Shoes' },
	{ name: 'injury.md', title: 'Injury rules' },
	{ name: 'gear.md', title: 'Gear & fueling' },
	{ name: 'training-plan.md', title: 'Training plan notes' },
	{ name: 'race-strategy.md', title: 'Race strategy' }
];

export type ContextFile = { name: string; title: string; body: string; html: string };

function shoesAsMarkdown(shoes: ShoeContext) {
	return matter.stringify(shoes.notes ? `${shoes.notes}\n` : '', {
		active: shoes.active,
		rotation: shoes.rotation,
		retired: shoes.retired
	});
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

function shoesNotesForBrief(notes: string): string {
	const t = notes.trim();
	if (!t) return '';
	if (/track shoe rotation here/i.test(t)) return '';
	return t;
}

function shoesSectionForBrief(shoes: ShoeContext, runs: RunRecord[]): string {
	const wear = wearByShoe(runs);
	const line = (name: string) => {
		const w = wear[shoeKey(name)];
		if (!w || w.count <= 0) return name;
		const runsLabel = w.count === 1 ? '1 run' : `${w.count} runs`;
		return `${name} — ${formatShoeKm(w.km)} (${runsLabel})`;
	};
	const rotationRest = shoes.rotation.filter((n) => shoeKey(n) !== shoeKey(shoes.active));
	const lines = [
		`- Daily: ${shoes.active ? line(shoes.active) : '—'}`,
		rotationRest.length ? `- Rotation: ${rotationRest.map(line).join('; ')}` : '',
		shoes.retired.length ? `- Retired: ${shoes.retired.map(line).join('; ')}` : ''
	].filter(Boolean);
	const notes = shoesNotesForBrief(shoes.notes ?? '');
	return `## Shoes
Mileage is counted from logged activities. Strava GPX exports do not include gear.
${lines.join('\n')}${notes ? `\n\n${notes}` : ''}`;
}

export const getContextData = createServerFn({ method: 'GET' }).handler(async () => {
	const [shoes, runs] = await Promise.all([loadShoes(), listRuns()]);
	const raw = await Promise.all(
		CONTEXT_FILES.map((f) =>
			f.name === 'shoes.md' ? Promise.resolve('') : readContextFile(f.name)
		)
	);
	const files: ContextFile[] = CONTEXT_FILES.map((f, i) => {
		const body = f.name === 'shoes.md' ? shoesAsMarkdown(shoes) : raw[i]!;
		const html = f.name.endsWith('.json') ? renderJsonPretty(body) : renderMarkdown(body);
		return { name: f.name, title: f.title, body, html };
	});
	const allContext = files.map((f) => `# ===== ${f.name} =====\n\n${f.body.trim()}`).join('\n\n');
	return { shoes, shoeWear: wearByShoe(runs), files, allContext };
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
		const [allRuns, training, shoes, profile, injury, gear, raceStrategy, settings] =
			await Promise.all([
				listRuns(),
				loadTrainingContext(),
				loadShoes(),
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
		const targetWeek = weekToPlan(calendar, today);
		const weekPhrase = 'this week';
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
			: `There is **no race on the calendar**. Plan this week as base / consistency training`;
		const ladderLine = activeGoal
			? 'Invent `label`, `distance_km` (null for strength), and intent from how I\'ve been recovering and laddering toward the race. Put duration in `detail` — there is no duration field.'
			: 'Invent `label`, `distance_km` (null for strength), and intent from how I\'ve been recovering. Put duration in `detail` — there is no duration field. No race to peak for — keep it sustainable.';
		const briefAsk = revising
			? `Week ${targetWeek} already has a saved plan (see Training plan). **Revise remaining sessions** given what is already logged, including any unplanned extras. Start from the saved week JSON — do not rebuild from the usual-week skeleton. Keep completed planned sessions in the JSON as they were (a matching Activity log date + sport means done; do not add \`"status": "completed"\` — \`status\` is only for skipped). You may add sessions for extras I propose in the notes — say why. Flag any red flags (injury risk, overtraining, under-recovery).`
			: `Please assess how my training is going and give me a concrete plan for **${weekPhrase}** covering **every session in my usual-week skeleton** (runs, rides, walks, swims, strength — whatever I pinned), keeping those days and sports. ${ladderLine} If a log this week already matches a skeleton day and sport, that slot is done — keep it in the JSON to match what I did, and plan the remaining days. Flag any red flags (injury risk, overtraining, under-recovery).`;
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
You are my coach for the sports I actually do — not a running-only coach. ${toward}. Keep my usual weekdays and sports unless this week's notes or recovery require a shift. You choose the session kind (easy / quality / long / tempo / easy spin / …), distance, and intent. Below is my plan, my recent training with how each session felt (effort and energy 1–10, shins and legs 0–10), weekly volume across sports, and my constraints.

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

${unplannedSection}${unplannedSection ? '\n' : ''}${alreadyLoggedSection}${alreadyLoggedSection ? '\n' : ''}${shoesSectionForBrief(shoes, allRuns)}

## Runner profile
${profile.trim() || '(none)'}

## Injury rules
${injury.trim() || '(none)'}

## Gear & fueling
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
		hasFeel: hasFeel(r)
	};
}

function formatFeelingsExample(runs: RunRecord[]): string {
	const fields = (r: RunRecord, pad: string) =>
		[
			`${pad}"slug": ${JSON.stringify(r.slug)},`,
			`${pad}"effort": 6,`,
			`${pad}"shins": 3,`,
			`${pad}"legs": 7,`,
			`${pad}"energy": 7,`,
			`${pad}"wanted_faster": false,`,
			`${pad}"surface": "asphalt",`,
			`${pad}"notes": "Short first-person note."`
		].join('\n');
	const r = runs[0];
	if (!r || runs.length === 1) {
		if (!r) return `  "feelings": { "slug": "…" }`;
		return `  "feelings": {\n${fields(r, '    ')}\n  }`;
	}
	return `  "feelings": [\n${runs
		.map((row) => `    {\n${fields(row, '      ')}\n    }`)
		.join(',\n')}\n  ]`;
}

export const getDebriefPrompt = createServerFn({ method: 'GET' })
	.validator((slug: string) => (typeof slug === 'string' ? slug : ''))
	.handler(async ({ data: slug }) => {
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
		const feelingsRule = many
			? `- \`feelings\` is an array with one object per session above. Each \`slug\` must be exactly one of: ${featured.map((r) => `\`${r.slug}\``).join(', ')}. effort and energy 1–10; shins and legs 0–10. Omit fields you don't know. Do not invent scores from GPS or screenshots. Omit a session entirely if I said nothing about it. Do not copy example numbers.`
			: `- \`feelings.slug\` must be exactly \`${featured[0]!.slug}\`. effort and energy 1–10; shins and legs 0–10. Omit fields you don't know. Do not invent scores from GPS or screenshots. Omit the feelings object if I said nothing about this session. Do not copy example numbers.`;

		const prompt = `# The Long Run — debrief ${sessionWord}

You are my coach for the sports I train, not a running-only coach. GPS numbers are below. I'll attach Strava screenshots and say how ${many ? 'each one' : 'it'} felt.
${FEEL_SCALE}

Update **this week** from ${sessionWord}. Keep remaining sessions on their planned days unless recovery requires a shift — and if you move a day, say why. Keep non-run sessions unless recovery says otherwise.

## Usual weekdays
${formatPatternLines(settings.weekPattern)}

## ${sessionHeading}
${sessionBlock}

## Other activities already logged this week
${otherThisWeek.length ? otherThisWeek.map(formatRunBriefLine).join('\n') : `- (none besides ${many ? 'these' : 'this one'})`}

## Current week plan${week ? ` — week ${week.week} (${week.dates}) · ${week.phase} · ${week.focus}` : ''}
${sessionLines}

${unplannedLines ? `## Unplanned activities this week\nThese logs did not match a planned session — extra load, already done. Do not add a plan row just to file them.\n${unplannedLines}\n` : ''}## Injury rules
${injury.trim() || '(none)'}

## When you reply
Short assessment in prose. Then one fenced JSON object I can paste back — the JSON is what I save; the assessment is not.

\`\`\`json
{
${formatFeelingsExample(featured)},
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
${feelingsRule}
- \`week.sessions\` is the **full week** from Current week plan: keep completed/skipped rows as they were, rewrite what's still ahead. Every session needs \`"activity_type"\`. Only move a day if you must, and say why.
- To drop a session, set \`"status": "skipped"\` (and why in \`detail\`). Unlogged ≠ skipped.
- If the week is finished, return the same session rows unchanged — do not invent a completed status (\`status\` is only \`"skipped"\`).
`;
		const runs = featured.map(debriefRunSummary);
		return {
			prompt,
			run: runs[runs.length - 1] ?? null,
			runs,
			weekView,
			error: null as string | null
		};
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
	shoes: string;
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
			shoes: data.shoes.trim(),
			summary_image: '',
			splits_image: '',
			strava_id: '',
			notes: data.notes
		});
		await rememberShoeName(run.shoes);
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
					coordinates: parsed.points.map((p) => [p.lng, p.lat])
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

		const importedShoes = showsField(activity_type, 'shoes')
			? (await loadShoes()).active
			: '';

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
			shoes: importedShoes,
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
	shoes: string;
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
			shoes: data.shoes.trim(),
			notes: data.notes
		};
		const run = await dbUpdateRun(data.slug, fields);
		await rememberShoeName(run.shoes);
		return { slug: run.slug };
	});

export const deleteRun = createServerFn({ method: 'POST' }).middleware([requireAuth])
	.validator((slug: string) => slug)
	.handler(async ({ data: slug }) => {
		return dbDeleteRun(slug);
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

export const saveShoes = createServerFn({ method: 'POST' }).middleware([requireAuth])
	.validator((d: ShoeContext) => d)
	.handler(async ({ data }) => {
		await persistShoes(data);
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
			const session = week?.sessions.find(
				(s) => s.day.toLowerCase() === link.plan_day!.toLowerCase()
			);
			planLinks.push({
				id: link.id,
				week: link.plan_week,
				day: link.plan_day,
				date: dateForSessionDay(planWeekStartIso(link.plan_week, calendar), link.plan_day),
				label: session?.label || 'Planned session',
				activity_type: session?.activity_type || 'run',
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
			planTaken.set(`${link.plan_week}|${link.plan_day.toLowerCase()}`, {
				slug: link.route_slug,
				name
			});
		}
		const activityTaken = new Map<string, { slug: string; name: string }>();
		for (const link of allLinks) {
			if (link.kind !== 'activity' || !link.activity_slug) continue;
			const name = names.get(link.route_slug);
			if (!name) continue;
			activityTaken.set(link.activity_slug, { slug: link.route_slug, name });
		}

		const planOptions: PlanAttachOption[] = upcomingPlanSessions(plan, calendar)
			.filter((s) => planTaken.get(`${s.week}|${s.day.trim().toLowerCase()}`)?.slug !== slug)
			.map((s) => ({
				week: s.week,
				day: s.day,
				date: s.date,
				label: s.label,
				activity_type: s.activity_type ?? 'run',
				distance_km: s.distance_km,
				taken_by: planTaken.get(`${s.week}|${s.day.trim().toLowerCase()}`) ?? null
			}));

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
	.validator((d: { slug: string; week?: number; day?: string; activity_slug?: string }) => d)
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
		if (week == null || !day) throw new Error('Pick a plan day or an activity.');
		if (!Number.isInteger(week) || week < 1) {
			throw new Error('That plan week is out of range.');
		}
		const { calendar, plan } = await loadTrainingContext();
		if (week > calendar.weekCount) {
			throw new Error('That plan week is out of range.');
		}
		const found = plan
			.find((w) => w.week === week)
			?.sessions.find((s) => s.day.toLowerCase() === day.toLowerCase());
		if (!found) throw new Error('That day is not on the plan.');
		await dbAttachRouteToPlan(data.slug, week, day);
		return { ok: true as const };
	});

export const detachPlannedRoute = createServerFn({ method: 'POST' }).middleware([requireAuth])
	.validator((d: { slug: string; id: number }) => d)
	.handler(async ({ data }) => {
		const ok = await dbDetachRouteLink(data.id, data.slug);
		if (!ok) throw new Error('Link not found.');
		return { ok: true as const };
	});
