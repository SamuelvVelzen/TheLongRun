import { createServerFn } from '@tanstack/react-start';
import matter from 'gray-matter';
import type { Goals, PlanWeek, RouteTrack, RunRecord, RunWithMap } from '$lib/types';
import { analyticsToProperties, type RouteAnalytics } from '$lib/splits';
import {
	dayFromIsoDate,
	formatDuration,
	guessSession,
	normalizeStartTime,
	parseDurationSeconds
} from '$lib/format';
import { weekNumberForDate } from '$lib/plan';
import { activityLabel, metricText, normalizeActivityType } from '$lib/activity';
import { renderJsonPretty, renderMarkdown } from '$lib/markdown';
import {
	deleteRun as dbDeleteRun,
	getRun,
	listRouteIds,
	listRuns,
	runHasMap,
	saveRun,
	updateRun as dbUpdateRun,
	type UpdateRunFields
} from './runs';
import { listRouteTracks } from './routes';
import { getRouteGeoJson, loadRouteAnalytics, saveRouteGeoJson } from './route-analytics';
import {
	currentPlanWeek,
	loadGoals,
	loadPlan,
	loadShoes,
	readContextFile,
	writeContextFile
} from './context';
import { fetchWeatherForDateTime } from './weather';
import { parseGpx } from './gpx';

const withMap = (runs: RunRecord[], routeIds: Set<string>): RunWithMap[] =>
	runs.map((r) => ({ ...r, has_map: runHasMap(r, routeIds) }));

// ---------- reads ----------

export const getDashboardData = createServerFn({ method: 'GET' }).handler(async () => {
	const [runs, tracks, routeIds, week, goals, shoes] = await Promise.all([
		listRuns(),
		listRouteTracks(),
		listRouteIds(),
		currentPlanWeek(),
		loadGoals(),
		loadShoes()
	]);
	return {
		runs: withMap(runs, routeIds),
		tracks,
		week,
		goals,
		shoes
	} satisfies {
		runs: RunWithMap[];
		tracks: RouteTrack[];
		week: PlanWeek | null;
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
		const [analytics, routeIds] = await Promise.all([loadRouteAnalytics(run), listRouteIds()]);
		return {
			run: { ...run, has_map: runHasMap(run, routeIds) } as RunWithMap,
			analytics: analytics as RouteAnalytics | null
		};
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

export const getContextData = createServerFn({ method: 'GET' }).handler(async () => {
	const shoes = await loadShoes();
	const raw = await Promise.all(
		CONTEXT_FILES.map((f) => (f.name === 'shoes.md' ? Promise.resolve('') : readContextFile(f.name)))
	);
	const files: ContextFile[] = CONTEXT_FILES.map((f, i) => {
		const body = f.name === 'shoes.md' ? shoesAsMarkdown(shoes) : raw[i]!;
		const html = f.name.endsWith('.json') ? renderJsonPretty(body) : renderMarkdown(body);
		return { name: f.name, title: f.title, body, html };
	});
	const allContext = files.map((f) => `# ===== ${f.name} =====\n\n${f.body.trim()}`).join('\n\n');
	return { shoes, files, allContext };
});

export const getCoachBrief = createServerFn({ method: 'GET' })
	.validator((weeks: number) => (Number.isFinite(weeks) && weeks > 0 ? Math.floor(weeks) : 10))
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
		const windowRuns = allRuns
			.filter((r) => r.date >= cutoffIso)
			.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

		const raceDate = new Date(`${goals.race_date}T00:00:00`);
		const weeksToRace = Number.isNaN(raceDate.getTime())
			? null
			: Math.max(0, Math.ceil((raceDate.getTime() - today.getTime()) / (7 * 86_400_000)));

		// Plan block is Mon-anchored from 2026-08-03 (matches weekNumberForDate / currentPlanWeek).
		const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
		const planAnchor = new Date('2026-08-03T00:00:00');
		const weekRange = (n: number) => {
			const s = new Date(planAnchor);
			s.setDate(s.getDate() + (n - 1) * 7);
			const e = new Date(s);
			e.setDate(e.getDate() + 6);
			const f = (d: Date) => `${String(d.getDate()).padStart(2, '0')} ${MON[d.getMonth()]}`;
			return `${f(s)}–${f(e)} ${e.getFullYear()}`;
		};
		const curWeek = Math.min(
			8,
			Math.max(1, Math.floor((today.getTime() - planAnchor.getTime()) / (7 * 86_400_000)) + 1)
		);
		const nextWeek = Math.min(8, curWeek + 1);
		const todayIso = today.toISOString().slice(0, 10);

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
		const shinRuns = runsAll
			.filter((r) => r.shins != null)
			.sort((a, b) => (a.date < b.date ? 1 : -1));
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
				.sort((a, b) => (a[0] < b[0] ? -1 : 1))
				.map(
					([wk, e]) =>
						`- Week of ${wk}: ${e.runs} runs (${Math.round(e.runKm * 10) / 10} km run)${
							e.other ? `, ${e.other} cross-training` : ''
						}`
				)
				.join('\n') || '- (no activities in window)';

		const rows =
			windowRuns
				.map((r) => {
					const feel = [r.effort, r.shins, r.legs, r.energy]
						.map((v) => (v == null ? '–' : v))
						.join('/');
					const notes = (r.notes || '')
						.replace(/\s+/g, ' ')
						.replace(/\|/g, '/')
						.trim()
						.slice(0, 140);
					return `| ${r.date} | ${activityLabel(r.activity_type)} | ${r.distance_km ?? '–'} | ${metricText(r)} | ${r.avg_hr ?? '–'}/${r.max_hr ?? '–'} | ${feel} | ${notes} |`;
				})
				.join('\n') || '| – | – | – | – | – | – | – |';

		return `# The Long Run — training context

## Coaching brief
You are my running coach. I'm training toward **${goals.race_name}** (${goals.race_distance_km} km) on **${goals.race_date}**${
			weeksToRace != null ? ` — about **${weeksToRace} weeks** away` : ''
		}. My run days are Tuesday / Friday / Sunday, and I cross-train by bike and walk. Below is my plan, my recent training with how each session felt (effort / shins / legs / energy, each 0–10), my weekly running volume, and my constraints.

Please assess how my training is going and give me a concrete plan for **next week** — specific Tuesday / Friday / Sunday sessions with distance and intent — adjusted for how I've been recovering and laddering toward the race. Flag any red flags (injury risk, overtraining, under-recovery).

## Goal
- Race: ${goals.race_name} — ${goals.race_distance_km} km on ${goals.race_date}${weeksToRace != null ? ` (~${weeksToRace} weeks to go)` : ''}
- Time goal: ${goals.time_goal || '—'}
${(goals.primary ?? []).map((p) => `- Priority: ${p}`).join('\n')}
${goals.notes ? `\n${goals.notes}\n` : ''}
## Timing (use these exact values — do not guess dates)
- Today: ${todayIso}.
- Plan block: Monday–Sunday, 8 weeks, from 2026-08-03 to race day ${goals.race_date}.
- Current week: **week ${curWeek}** (${weekRange(curWeek)}).
- The week to plan is **week ${nextWeek}** (${weekRange(nextWeek)}). In the JSON you return, set exactly \`"week": ${nextWeek}\` and \`"dates": "${weekRange(nextWeek)}"\`.

## All-time summary (auto-computed from all logged activities — current, not hand-maintained)
- Logged since ${firstDate}: ${byType.run} runs, ${byType.ride} rides, ${byType.walk} walks${byType.swim ? `, ${byType.swim} swims` : ''}${byType.strength ? `, ${byType.strength} strength sessions` : ''}.
- Running: ${totalRunKm} km total across ${runsAll.length} runs; typical pace ~${avgRunPace}/km.
- Longest run: ${longest ? `${longest.distance_km} km (${longest.avg_pace || '—'}/km) on ${longest.date}` : '—'}.
- Shin trend (0–10, lower = better): last 4 runs avg ${shinsRecent ?? '—'} vs prior 4 ${shinsPrior ?? '—'}.

## Weekly running volume (last ${weeks} weeks)
${weekLines}

## Activity log (last ${weeks} weeks, oldest first)
Feel = effort/shins/legs/energy (0–10, – = not recorded).

| Date | Type | km | pace/speed | HR avg/max | Feel | Notes |
|------|------|----|-----------|-----------|------|-------|
${rows}

## Training plan
${plan.length ? '```json\n' + JSON.stringify(plan, null, 2) + '\n```' : '(no plan set)'}

## Shoes
- Active: ${shoes.active || '—'}${shoes.rotation?.length ? `\n- Rotation: ${shoes.rotation.join(', ')}` : ''}${shoes.notes ? `\n\n${shoes.notes}` : ''}

## Runner profile
${profile.trim() || '(none)'}

## Injury rules
${injury.trim() || '(none)'}

## Gear & fueling
${gear.trim() || '(none)'}

## Race strategy
${raceStrategy.trim() || '(none)'}

## When you reply
Give your assessment and next week's sessions in prose. Then, so I can save it straight back into my app, also output **next week as one JSON object** in exactly this shape (real values, same keys):

\`\`\`json
{
  "week": ${nextWeek},
  "dates": "${weekRange(nextWeek)}",
  "phase": "base | build | peak | taper",
  "focus": "one-line focus for the week",
  "sessions": [
    { "day": "Tuesday", "label": "Easy", "distance_km": 6, "detail": "how + why" },
    { "day": "Friday", "label": "Tempo", "distance_km": 8, "detail": "how + why" },
    { "day": "Sunday", "label": "Long", "distance_km": 14, "detail": "how + why" }
  ]
}
\`\`\`
`;
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
		if (!parsed.date) throw new Error('Could not read a date/time from that GPX file.');

		const activity_type = normalizeActivityType(data.activityType || parsed.detectedType);
		const day = dayFromIsoDate(parsed.date);
		const week = weekNumberForDate(parsed.date);
		const session = guessSession(day, parsed.distanceKm);

		let route = '';
		if (parsed.points.length >= 2) {
			const id = crypto.randomUUID();
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
			route = `/routes/${id}.json`;
		}

		const weather = await fetchWeatherForDateTime(
			parsed.date,
			parsed.startClock || null,
			null,
			null,
			parsed.time || null
		);

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
			notes: 'Imported from GPX.'
		});

		return {
			slug: run.slug,
			activity_type,
			distance_km: parsed.distanceKm,
			has_route: Boolean(route)
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

/** Merge AI-returned plan week(s) into plan.json (replace by week number, keep the rest). */
export const savePlanWeeks = createServerFn({ method: 'POST' })
	.validator((jsonText: string) => jsonText)
	.handler(async ({ data: jsonText }) => {
		let parsed: unknown;
		try {
			parsed = JSON.parse(jsonText);
		} catch {
			throw new Error('That is not valid JSON — paste just the JSON block your AI returned.');
		}
		const incoming = (Array.isArray(parsed) ? parsed : [parsed]).filter(
			(w): w is PlanWeek => Boolean(w) && typeof w === 'object'
		);
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
