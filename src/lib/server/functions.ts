import { createServerFn } from '@tanstack/react-start';
import matter from 'gray-matter';
import type { Goals, PlanWeek, PlannedRoute, RouteTrack, RunRecord, RunWithMap } from '$lib/types';
import { analyticsToProperties, type RouteAnalytics } from '$lib/splits';
import { buildHrZoneSummary } from '$lib/hr-zones';
import {
	dayFromIsoDate,
	formatDuration,
	guessSession,
	normalizeStartTime,
	parseDurationSeconds
} from '$lib/format';
import {
	buildWeekView,
	isoDateLocal,
	PLAN_START_ISO,
	PLAN_WEEK_COUNT,
	planWeekDateRange,
	planWeekIndex,
	planWeekStartIso,
	plannedSessionFor,
	sessionStreak,
	weekNumberForDate,
	weekToPlan,
	type WeekView
} from '$lib/plan';
import { activityLabel, metricText, normalizeActivityType } from '$lib/activity';
import { renderJsonPretty, renderMarkdown } from '$lib/markdown';
import { parseStrengthNotes, strengthSummary } from '$lib/strength';
import {
	deleteRun as dbDeleteRun,
	findRunsByDate,
	getMaxHrAllTime,
	getRun,
	listRouteIds,
	listRuns,
	runHasMap,
	saveRun,
	setRunRoute,
	updateRun as dbUpdateRun,
	updateRunFeelings,
	type FeelingsPatch,
	type UpdateRunFields
} from './runs';
import { listRouteTracks } from './routes';
import {
	deletePlannedRoute as dbDeletePlannedRoute,
	getPlannedRoute,
	listPlannedRoutes,
	listPlannedRouteTracks,
	savePlannedFromFile,
	updatePlannedRoute as dbUpdatePlannedRoute
} from './planned-routes';
import {
	getRouteGeoJson,
	loadRouteAnalytics,
	routeIdForRun,
	saveRouteGeoJson
} from './route-analytics';
import {
	currentPlanWeek,
	loadGoals,
	loadPlan,
	loadSettings,
	loadShoes,
	readContextFile,
	saveHrMaxSetting,
	writeContextFile
} from './context';
import { fetchWeatherForDateTime } from './weather';
import { parseGpx } from './gpx';
import { reverseGeocode } from './geo';

const withMap = (runs: RunRecord[], routeIds: Set<string>): RunWithMap[] =>
	runs.map((r) => ({ ...r, has_map: runHasMap(r, routeIds) }));

// ---------- reads ----------

export const getDashboardData = createServerFn({ method: 'GET' }).handler(async () => {
	const [runs, tracks, routeIds, week, plan, goals, shoes] = await Promise.all([
		listRuns(),
		listRouteTracks(),
		listRouteIds(),
		currentPlanWeek(),
		loadPlan(),
		loadGoals(),
		loadShoes()
	]);
	return {
		runs: withMap(runs, routeIds),
		tracks,
		week,
		weekView: week ? buildWeekView(week, runs) : null,
		streak: sessionStreak(runs, plan),
		goals,
		shoes
	} satisfies {
		runs: RunWithMap[];
		tracks: RouteTrack[];
		week: PlanWeek | null;
		weekView: WeekView | null;
		streak: number;
		goals: Goals;
		shoes: { active: string; notes: string; rotation: string[] };
	};
});

export const getTimelineRuns = createServerFn({ method: 'GET' }).handler(async () => {
	const [runs, routeIds] = await Promise.all([listRuns(), listRouteIds()]);
	return withMap(runs, routeIds);
});

export const getRunDetail = createServerFn({ method: 'GET' })
	.validator((slug: string) => slug)
	.handler(async ({ data: slug }) => {
		const run = await getRun(slug);
		if (!run) return null;
		const [analytics, routeIds, shoes, settings, allTimeMaxHr] = await Promise.all([
			loadRouteAnalytics(run),
			listRouteIds(),
			loadShoes(),
			loadSettings(),
			getMaxHrAllTime()
		]);

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
			run: { ...run, has_map: runHasMap(run, routeIds) } as RunWithMap,
			analytics: out,
			shoes,
			hrMaxManual,
			hrMaxAllTime: allTimeMaxHr
		};
	});

export const saveHrMax = createServerFn({ method: 'POST' })
	.validator((hrMax: number | null) => hrMax)
	.handler(async ({ data }) => {
		await saveHrMaxSetting(data);
		return { ok: true };
	});

export const getLogDefaults = createServerFn({ method: 'GET' }).handler(async () => {
	const [week, shoes] = await Promise.all([currentPlanWeek(), loadShoes()]);
	return { week, shoes };
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
	{ name: 'goals.md', title: 'Goals' },
	{ name: 'shoes.md', title: 'Shoes' },
	{ name: 'injury.md', title: 'Injury rules' },
	{ name: 'gear.md', title: 'Gear & fueling' },
	{ name: 'training-plan.md', title: 'Training plan notes' },
	{ name: 'plan.json', title: 'Plan sessions (JSON)' },
	{ name: 'race-strategy.md', title: 'Race strategy' }
];

export type ContextFile = { name: string; title: string; body: string; html: string };

function shoesAsMarkdown(shoes: { active: string; rotation: string[]; notes: string }) {
	return matter.stringify(shoes.notes ? `${shoes.notes}\n` : '', {
		active: shoes.active,
		rotation: shoes.rotation
	});
}

const BRIEF_DETAIL_WEEKS = 12;
const BRIEF_DETAIL_CAP = 40;

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
function formatTrainingPlanBrief(plan: PlanWeek[], targetWeek: number): string {
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
					dates: planWeekDateRange(n),
					phase: '',
					focus: '',
					sessions: [] as PlanWeek['sessions']
				}
		);

	const emptyFuture: number[] = [];
	const filledFuture: number[] = [];
	for (let n = targetWeek + 1; n <= PLAN_WEEK_COUNT; n++) {
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

function renderPlanFileSummary(body: string): string {
	try {
		const parsed = JSON.parse(body) as unknown;
		if (!Array.isArray(parsed)) return renderJsonPretty(body);
		const lines = (parsed as PlanWeek[]).map((w) => {
			const n = Array.isArray(w.sessions) ? w.sessions.length : 0;
			const days = n
				? ` (${w.sessions.map((s) => s.day).filter(Boolean).join(', ')})`
				: '';
			const sess = n === 0 ? 'not planned yet' : `${n} session${n === 1 ? '' : 's'}${days}`;
			const phase = w.phase ? ` — ${w.phase}` : '';
			return `- **Week ${w.week}** (${w.dates || '—'}): ${sess}${phase}`;
		});
		return renderMarkdown(
			`Compact view — open **Edit** for the full JSON. Empty weeks are stubs, not a plan.\n\n${
				lines.join('\n') || '_Empty plan._'
			}`
		);
	} catch {
		return renderJsonPretty(body);
	}
}

export const getContextData = createServerFn({ method: 'GET' }).handler(async () => {
	const shoes = await loadShoes();
	const raw = await Promise.all(
		CONTEXT_FILES.map((f) =>
			f.name === 'shoes.md' ? Promise.resolve('') : readContextFile(f.name)
		)
	);
	const files: ContextFile[] = CONTEXT_FILES.map((f, i) => {
		const body = f.name === 'shoes.md' ? shoesAsMarkdown(shoes) : raw[i]!;
		const html =
			f.name === 'plan.json'
				? renderPlanFileSummary(body)
				: f.name.endsWith('.json')
					? renderJsonPretty(body)
					: renderMarkdown(body);
		return { name: f.name, title: f.title, body, html };
	});
	const allContext = files.map((f) => `# ===== ${f.name} =====\n\n${f.body.trim()}`).join('\n\n');
	return { shoes, files, allContext };
});

export const getCoachBrief = createServerFn({ method: 'GET' })
	.validator((weeks: number) =>
		Number.isFinite(weeks) && weeks > 0 ? Math.floor(weeks) : 520
	)
	.handler(async ({ data: weeks }) => {
		const [allRuns, goals, plan, shoes, profile, injury, gear, raceStrategy] = await Promise.all([
			listRuns(),
			loadGoals(),
			loadPlan(),
			loadShoes(),
			readContextFile('profile.md'),
			readContextFile('injury.md'),
			readContextFile('gear.md'),
			readContextFile('race-strategy.md')
		]);

		const today = new Date();
		const cutoff = new Date(today);
		cutoff.setDate(cutoff.getDate() - weeks * 7);
		const cutoffIso = cutoff.toISOString().slice(0, 10);
		const windowRuns = allRuns.filter((r) => r.date >= cutoffIso).sort(byDateNewestFirst);

		const raceDate = new Date(`${goals.race_date}T00:00:00`);
		const weeksToRace = Number.isNaN(raceDate.getTime())
			? null
			: Math.max(0, Math.ceil((raceDate.getTime() - today.getTime()) / (7 * 86_400_000)));

		const curWeek = Math.min(PLAN_WEEK_COUNT, Math.max(1, planWeekIndex(today)));
		const targetWeek = weekToPlan(today);
		const weekPhrase = targetWeek > curWeek ? 'next week' : 'this week';
		const todayIso = today.toISOString().slice(0, 10);
		const weekRange = planWeekDateRange;

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

		const mondayOf = (iso: string) => {
			const d = new Date(`${iso}T12:00:00`);
			const off = (d.getDay() + 6) % 7;
			d.setDate(d.getDate() - off);
			return d.toISOString().slice(0, 10);
		};
		const weekMap = new Map<string, { runKm: number; runs: number; other: number }>();
		for (const r of windowRuns) {
			const wk = mondayOf(r.date);
			const e = weekMap.get(wk) ?? { runKm: 0, runs: 0, other: 0 };
			if (normalizeActivityType(r.activity_type) === 'run') {
				e.runKm += r.distance_km ?? 0;
				e.runs++;
			} else {
				e.other++;
			}
			weekMap.set(wk, e);
		}
		const weekLines =
			[...weekMap.entries()]
				.sort((a, b) => (a[0] > b[0] ? -1 : a[0] < b[0] ? 1 : 0))
				.map(
					([wk, e]) =>
						`- Week of ${wk}: ${e.runs} runs (${Math.round(e.runKm * 10) / 10} km run)${
							e.other ? `, ${e.other} cross-training` : ''
						}`
				)
				.join('\n') || '- (no activities in window)';

		const detailCutoff = new Date(today);
		detailCutoff.setDate(detailCutoff.getDate() - BRIEF_DETAIL_WEEKS * 7);
		const detailCutoffIso = detailCutoff.toISOString().slice(0, 10);
		let detailRuns = windowRuns;
		let activityHeading = `last ${weeks} weeks, newest first`;
		if (weeks > BRIEF_DETAIL_WEEKS) {
			detailRuns = windowRuns.filter((r) => r.date >= detailCutoffIso);
			activityHeading = `newest first — detailed log is last ${BRIEF_DETAIL_WEEKS} weeks; earlier weeks are in the volume list only`;
		}
		if (detailRuns.length > BRIEF_DETAIL_CAP) {
			detailRuns = detailRuns.slice(0, BRIEF_DETAIL_CAP);
			activityHeading = `${activityHeading}; table capped at ${BRIEF_DETAIL_CAP} most recent activities`;
		}

		const rows =
			detailRuns
				.map((r) => {
					const feel = [r.effort, r.shins, r.legs, r.energy]
						.map((v) => (v == null ? '–' : v))
						.join('/');
					return `| ${r.date} | ${activityLabel(r.activity_type)} | ${r.distance_km ?? '–'} | ${metricText(r)} | ${r.avg_hr ?? '–'}/${r.max_hr ?? '–'} | ${feel} | ${notesForBriefRow(r)} |`;
				})
				.join('\n') || '| – | – | – | – | – | – | – |';

		const shoeNotes = shoesNotesForBrief(shoes.notes ?? '');

		return `# The Long Run — training context

## Coaching brief
You are my running coach. I'm training toward **${goals.race_name}** (${goals.race_distance_km} km) on **${goals.race_date}**${
			weeksToRace != null ? ` — about **${weeksToRace} weeks** away` : ''
		}. I run a few times a week and cross-train by bike and walk. Session days can move — do not assume a fixed Tuesday / Friday / Sunday pattern. Below is my plan, my recent training with how each session felt (effort / shins / legs / energy, each 0–10), my weekly running volume, and my constraints.

Please assess how my training is going and give me a concrete plan for **${weekPhrase}** — specific sessions with day, distance and intent — adjusted for how I've been recovering and laddering toward the race. Flag any red flags (injury risk, overtraining, under-recovery). Days can shift if the week needs it.

## How to read this brief
Goal, Timing, All-time summary, weekly volume, and the Activity log are auto-computed from logged activities and are **current**. Runner profile, injury, gear, and race strategy are hand-written and may lag. If they disagree on numbers (longest run, weekly rhythm, dates), **prefer the computed sections**.

## Goal
- Race: ${goals.race_name} — ${goals.race_distance_km} km on ${goals.race_date}${weeksToRace != null ? ` (~${weeksToRace} weeks to go)` : ''}
- Time goal: ${goals.time_goal || '—'}
${(goals.primary ?? []).map((p) => `- Priority: ${p}`).join('\n')}
${goals.notes ? `\n${goals.notes}\n` : ''}
## Timing (use these exact values — do not guess dates)
- Today: ${todayIso}.
- Plan block: Monday–Sunday, ${PLAN_WEEK_COUNT} weeks, from ${PLAN_START_ISO} to race day ${goals.race_date}.
- Current week: **week ${curWeek}** (${weekRange(curWeek)}).
- The week to plan is **week ${targetWeek}** (${weekRange(targetWeek)}) — ${weekPhrase}. In the JSON you return, set exactly \`"week": ${targetWeek}\` and \`"dates": "${weekRange(targetWeek)}"\`.

## All-time summary (auto-computed from all logged activities — current, not hand-maintained)
- Logged since ${firstDate}: ${byType.run} runs, ${byType.ride} rides, ${byType.walk} walks${byType.swim ? `, ${byType.swim} swims` : ''}${byType.strength ? `, ${byType.strength} strength sessions` : ''}.
- Running: ${totalRunKm} km total across ${runsAll.length} runs; typical pace ~${avgRunPace}/km.
- Longest run: ${longest ? `${longest.distance_km} km (${longest.avg_pace || '—'}/km) on ${longest.date}` : '—'}.
- Shin trend (0–10, lower = better): last 4 runs avg ${shinsRecent ?? '—'} vs prior 4 ${shinsPrior ?? '—'}.

## Weekly running volume (last ${weeks} weeks)
${weekLines}

## Activity log (${activityHeading})
Feel = effort/shins/legs/energy (0–10, – = not recorded).

| Date | Type | km | pace/speed | HR avg/max | Feel | Notes |
|------|------|----|-----------|-----------|------|-------|
${rows}

## Training plan
${plan.length ? formatTrainingPlanBrief(plan, targetWeek) : '(no plan set)'}

## Shoes
- Active: ${shoes.active || '—'}${shoes.rotation?.length ? `\n- Rotation: ${shoes.rotation.join(', ')}` : ''}${shoeNotes ? `\n\n${shoeNotes}` : ''}

## Runner profile
${profile.trim() || '(none)'}

## Injury rules
${injury.trim() || '(none)'}

## Gear & fueling
${gear.trim() || '(none)'}

## Race strategy
${raceStrategy.trim() || '(none)'}

## When you reply
Give your assessment and ${weekPhrase}'s sessions in prose. Then, so I can save it straight back into my app, also output **${weekPhrase} as one JSON object** in exactly this shape (real values, same keys). Use however many sessions the week needs, on whatever days fit — not a fixed three-day template:

\`\`\`json
{
  "week": ${targetWeek},
  "dates": "${weekRange(targetWeek)}",
  "phase": "base | build | peak | taper",
  "focus": "one-line focus for the week",
  "sessions": [
    { "day": "Wednesday", "label": "Easy", "distance_km": 6, "detail": "how + why" },
    { "day": "Saturday", "label": "Long", "distance_km": 14, "detail": "how + why" }
  ]
}
\`\`\`
`;
	});

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

export const getDebriefPrompt = createServerFn({ method: 'GET' })
	.validator((slug: string) => (typeof slug === 'string' ? slug : ''))
	.handler(async ({ data: slug }) => {
		const [allRuns, week, injury, trainingNotes] = await Promise.all([
			listRuns(),
			currentPlanWeek(),
			readContextFile('injury.md'),
			readContextFile('training-plan.md')
		]);
		const weekView = week ? buildWeekView(week, allRuns) : null;
		const weekStart = week ? planWeekStartIso(week.week) : '';
		let weekEnd = weekStart;
		if (weekStart) {
			const end = new Date(`${weekStart}T12:00:00`);
			end.setDate(end.getDate() + 6);
			weekEnd = isoDateLocal(end);
		}
		const run = slug
			? ((await getRun(slug)) ?? null)
			: weekStart
				? (allRuns.find((r) => r.date >= weekStart && r.date <= weekEnd) ?? null)
				: null;
		if (!run) {
			return {
				prompt: '',
				run: null,
				weekView,
				error: 'Import this session’s GPX first — the prompt needs those numbers.'
			};
		}

		const weekRuns = weekStart
			? allRuns
					.filter((r) => r.date >= weekStart && r.date <= weekEnd)
					.sort(byDateNewestFirst)
			: [];
		const otherThisWeek = weekRuns.filter((r) => r.slug !== run.slug);
		const sessionLines =
			weekView?.sessions
				.map((s) => {
					const state = s.done
						? 'done'
						: s.skipped
							? 'skipped'
							: s.isNext
								? 'next'
								: 'upcoming';
					return `- ${s.day}${s.date ? ` (${s.date})` : ''}: ${s.label}${s.distance_km != null ? ` · ${s.distance_km} km` : ''} — ${s.detail} [${state}]`;
				})
				.join('\n') ?? '- (no plan week)';

		const prompt = `# The Long Run — debrief this session

You are my running coach. I just trained. GPS numbers are below. I'll also attach Strava screenshots and tell you how it felt.

Update the rest of **this week** based on this session. Days can move — do not assume a fixed Tuesday / Friday / Sunday pattern. Keep, shift, shorten, or drop sessions as needed (heat, shins, heavy legs, life).

## This session
${formatRunBriefLine(run)}
- Feel already in the app: ${hasFeel(run) ? 'yes (refine from what I say now)' : 'none yet — fill from this chat'}.

## Other activities already logged this week
${otherThisWeek.length ? otherThisWeek.map(formatRunBriefLine).join('\n') : '- (none besides this one)'}

## Current week plan${week ? ` — week ${week.week} (${week.dates}) · ${week.phase} · ${week.focus}` : ''}
${sessionLines}

## Injury rules
${injury.trim() || '(none)'}

## Plan adjustment notes
${trainingNotes.trim() || '(none)'}

## When you reply
Short assessment. Then output **one JSON object** I can paste back (no prose before or after the JSON):

\`\`\`json
{
  "feelings": {
    "slug": "${run.slug}",
    "effort": 6,
    "shins": 3,
    "legs": 7,
    "energy": 7,
    "wanted_faster": false,
    "surface": "asphalt",
    "notes": "Short first-person note."
  },
  "week": {
    "week": ${week?.week ?? 0},
    "dates": ${JSON.stringify(week?.dates ?? '')},
    "phase": ${JSON.stringify(week?.phase ?? '')},
    "focus": "one-line focus after this session",
    "sessions": [
      { "day": "Wednesday", "label": "Easy", "distance_km": 7, "detail": "how + why" }
    ]
  }
}
\`\`\`

Rules:
- \`feelings.slug\` must be exactly \`${run.slug}\`. Scores 0–10 (effort/energy 1–10). Omit fields you don't know.
- \`week.sessions\` is the **full remaining-aware week**: keep completed sessions as they were, rewrite what's still ahead. \`day\` can be any weekday.
- If the week is finished, still return the week object with the sessions as completed.
`;
		return {
			prompt,
			run: {
				slug: run.slug,
				date: run.date,
				day: run.day,
				distance_km: run.distance_km,
				avg_pace: run.avg_pace,
				hasFeel: hasFeel(run)
			},
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

export const createRun = createServerFn({ method: 'POST' })
	.validator((d: CreateRunInput) => d)
	.handler(async ({ data }) => {
		const date = data.date.trim();
		const session = data.session.trim();
		if (!date || !session) throw new Error('Date and session are required.');
		const day = dayFromIsoDate(date);
		const week = weekNumberForDate(date);
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
		return { slug: run.slug };
	});

export const importGpx = createServerFn({ method: 'POST' })
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
		const week = weekNumberForDate(parsed.date);
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
					...(parsed.analytics ? analyticsToProperties(parsed.analytics) : {})
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
			return {
				slug: existingDup.slug,
				activity_type,
				distance_km: parsed.distanceKm,
				has_route: Boolean(route),
				duplicate: true
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
			shoes: '',
			summary_image: '',
			splits_image: '',
			strava_id: '',
			route,
			notes: 'Imported from GPX.',
			country: geo.country,
			province: geo.province,
			place: geo.place
		});

		return {
			slug: run.slug,
			activity_type,
			distance_km: parsed.distanceKm,
			has_route: Boolean(route),
			duplicate: false
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

export const updateRun = createServerFn({ method: 'POST' })
	.validator((d: UpdateRunInput) => d)
	.handler(async ({ data }) => {
		const date = data.date.trim();
		const session = data.session.trim();
		if (!date || !session) throw new Error('Date and session are required.');
		const day = dayFromIsoDate(date);
		const week = weekNumberForDate(date);
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
		return { slug: run.slug };
	});

export const deleteRun = createServerFn({ method: 'POST' })
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
	for (const w of incoming) {
		if (typeof w.week !== 'number') throw new Error('Each week needs a numeric "week".');
		if (!Array.isArray(w.sessions)) throw new Error(`Week ${w.week} has no "sessions" array.`);
	}
	const current = await loadPlan();
	const byWeek = new Map<number, PlanWeek>(current.map((w) => [w.week, w]));
	for (const w of incoming) byWeek.set(w.week, w);
	const merged = [...byWeek.values()].sort((a, b) => a.week - b.week);
	await writeContextFile('plan.json', `${JSON.stringify(merged, null, 2)}\n`);
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
	const list = Array.isArray(o)
		? o
		: Array.isArray(o.activities)
			? o.activities
			: o.feelings && typeof o.feelings === 'object'
				? Array.isArray((o.feelings as { activities?: unknown }).activities)
					? (o.feelings as { activities: unknown[] }).activities
					: [o.feelings]
				: [];
	return list.filter(
		(a): a is Record<string, unknown> =>
			Boolean(a) && typeof a === 'object' && typeof (a as { slug?: unknown }).slug === 'string'
	);
}

/** Merge AI-returned plan week(s) into plan.json (replace by week number, keep the rest). */
export const savePlanWeeks = createServerFn({ method: 'POST' })
	.validator((jsonText: string) => jsonText)
	.handler(async ({ data: jsonText }) => {
		return mergePlanWeeks(asPlanWeeks(parseJsonPayload(jsonText)));
	});

/** Save a debrief reply: feelings for this run + an updated week plan. */
export const saveDebrief = createServerFn({ method: 'POST' })
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

		const prompt = `# The Long Run — capture how each activity felt

From our conversation, summarise how I felt for each activity below (${rangeLabel}). I describe things like the road/terrain, shin soreness, energy, whether I wanted to run more or faster, and how my legs felt.

Return ONLY a JSON block in exactly this shape — no prose before or after:

\`\`\`json
{
  "activities": [
    {
      "slug": "PASTE-EXACT-SLUG",
      "effort": 6,
      "shins": 3,
      "legs": 7,
      "energy": 7,
      "wanted_faster": true,
      "surface": "wet asphalt",
      "notes": "Shins tight the first 2 km, opened up after the turnaround."
    }
  ]
}
\`\`\`

Rules:
- Use the exact \`slug\` values from the table. Scores are 0–10 (effort/energy 1–10). \`wanted_faster\` is true/false.
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
export const saveFeelings = createServerFn({ method: 'POST' })
	.validator((jsonText: string) => jsonText)
	.handler(async ({ data: jsonText }) => {
		const rows = feelingsRowsFrom(parseJsonPayload(jsonText));
		if (!rows.length) throw new Error('No activities with a "slug" were found in that JSON.');
		return applyFeelingsRows(rows);
	});

export const saveShoes = createServerFn({ method: 'POST' })
	.validator((d: { active: string; rotation: string[]; notes: string }) => d)
	.handler(async ({ data }) => {
		if (!data.active.trim()) throw new Error('Active shoes required');
		await writeContextFile(
			'shoes.md',
			matter.stringify(data.notes ? `${data.notes}\n` : '', {
				active: data.active.trim(),
				rotation: data.rotation
			})
		);
		return { ok: true };
	});

const EDITABLE = new Set(CONTEXT_FILES.map((f) => f.name));

export const saveContextFile = createServerFn({ method: 'POST' })
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

// ---------- planned routes (BRouter exports) ----------

export const getPlannedRoutesData = createServerFn({ method: 'GET' }).handler(async () => {
	const [routes, tracks] = await Promise.all([listPlannedRoutes(), listPlannedRouteTracks()]);
	return { routes, tracks } satisfies { routes: PlannedRoute[]; tracks: RouteTrack[] };
});

export const getPlannedRouteDetail = createServerFn({ method: 'GET' })
	.validator((slug: string) => slug)
	.handler(async ({ data: slug }) => {
		return (await getPlannedRoute(slug)) ?? null;
	});

export const importPlannedRoute = createServerFn({ method: 'POST' })
	.validator((d: { text: string; filename: string }) => d)
	.handler(async ({ data }) => {
		const route = await savePlannedFromFile(data);
		return {
			slug: route.slug,
			name: route.name,
			distance_km: route.distance_km
		};
	});

export const updatePlannedRoute = createServerFn({ method: 'POST' })
	.validator((d: { slug: string; name?: string; notes?: string }) => d)
	.handler(async ({ data }) => {
		const route = await dbUpdatePlannedRoute(data.slug, { name: data.name, notes: data.notes });
		if (!route) throw new Error('Route not found.');
		return { slug: route.slug };
	});

export const deletePlannedRoute = createServerFn({ method: 'POST' })
	.validator((slug: string) => slug)
	.handler(async ({ data: slug }) => {
		return dbDeletePlannedRoute(slug);
	});
