import { createServerFn } from '@tanstack/react-start';
import matter from 'gray-matter';
import type { Goals, PlanWeek, RouteTrack, RunRecord, RunWithMap } from '$lib/types';
import type { RouteAnalytics } from '$lib/splits';
import { dayFromIsoDate, normalizeStartTime } from '$lib/format';
import { weekNumberForDate } from '$lib/plan';
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
import { getRouteGeoJson, loadRouteAnalytics } from './route-analytics';
import { currentPlanWeek, loadGoals, loadShoes, readContextFile, writeContextFile } from './context';
import { fetchWeatherForDateTime } from './weather';

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

// ---------- mutations ----------

export type CreateRunInput = {
	date: string;
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

export type UpdateRunInput = {
	slug: string;
	date: string;
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
