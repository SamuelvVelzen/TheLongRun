import { readFileSync, readdirSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import type { RunRecord } from '$lib/types';
import { normalizeStartTime } from '$lib/format';
import { ensureDataDirs, routesDir, runsDir } from './paths';

function toBool(value: unknown): boolean | null {
	if (value === true || value === 'true' || value === 'Y' || value === 'y' || value === 'yes')
		return true;
	if (value === false || value === 'false' || value === 'N' || value === 'n' || value === 'no')
		return false;
	return null;
}

function toNum(value: unknown): number | null {
	if (value === null || value === undefined || value === '') return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

function toIsoDate(value: unknown): string {
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		const y = value.getUTCFullYear();
		const m = String(value.getUTCMonth() + 1).padStart(2, '0');
		const d = String(value.getUTCDate()).padStart(2, '0');
		return `${y}-${m}-${d}`;
	}
	const raw = String(value ?? '').trim();
	if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
	const parsed = new Date(raw);
	if (!Number.isNaN(parsed.getTime())) {
		const y = parsed.getUTCFullYear();
		const m = String(parsed.getUTCMonth() + 1).padStart(2, '0');
		const d = String(parsed.getUTCDate()).padStart(2, '0');
		return `${y}-${m}-${d}`;
	}
	return raw;
}

function parseRunFile(filepath: string, slug: string): RunRecord {
	const raw = readFileSync(filepath, 'utf8');
	const { data, content } = matter(raw);
	return {
		slug,
		date: toIsoDate(data.date),
		week: toNum(data.week),
		day: String(data.day ?? ''),
		session: String(data.session ?? 'other'),
		effort: toNum(data.effort),
		shins: toNum(data.shins),
		legs: toNum(data.legs),
		energy: toNum(data.energy),
		weather: String(data.weather ?? ''),
		surface: String(data.surface ?? ''),
		wanted_faster: toBool(data.wanted_faster),
		distance_km: toNum(data.distance_km),
		start_time: normalizeStartTime(String(data.start_time ?? '')),
		time: String(data.time ?? ''),
		elapsed_time: String(data.elapsed_time ?? ''),
		avg_pace: String(data.avg_pace ?? ''),
		avg_hr: toNum(data.avg_hr),
		max_hr: toNum(data.max_hr),
		elev_gain: toNum(data.elev_gain),
		calories: toNum(data.calories),
		kilojoules: toNum(data.kilojoules),
		max_speed: toNum(data.max_speed),
		cadence: toNum(data.cadence),
		shoes: String(data.shoes ?? ''),
		summary_image: String(data.summary_image ?? ''),
		splits_image: String(data.splits_image ?? ''),
		strava_id: String(data.strava_id ?? ''),
		route: String(data.route ?? ''),
		notes: content.trim(),
		filepath
	};
}

export function listRuns(): RunRecord[] {
	ensureDataDirs();
	if (!existsSync(runsDir)) return [];
	return readdirSync(runsDir)
		.filter((f) => f.endsWith('.md'))
		.map((f) => parseRunFile(path.join(runsDir, f), f.replace(/\.md$/, '')))
		.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function getRun(slug: string): RunRecord | null {
	ensureDataDirs();
	const filepath = path.join(runsDir, `${slug}.md`);
	if (!existsSync(filepath)) return null;
	return parseRunFile(filepath, slug);
}

export function runSlug(date: string, day: string) {
	const d = day.toLowerCase().replace(/\s+/g, '-');
	return `${date}-${d}`;
}

export interface SaveRunInput {
	date: string;
	week: number | null;
	day: string;
	session: string;
	effort: number | null;
	shins: number | null;
	legs: number | null;
	energy: number | null;
	weather: string;
	surface: string;
	wanted_faster: boolean | null;
	distance_km: number | null;
	start_time?: string;
	time: string;
	elapsed_time?: string;
	avg_pace: string;
	avg_hr: number | null;
	max_hr?: number | null;
	elev_gain?: number | null;
	calories?: number | null;
	kilojoules?: number | null;
	max_speed?: number | null;
	cadence: number | null;
	shoes: string;
	summary_image: string;
	splits_image: string;
	strava_id?: string;
	route?: string;
	notes: string;
}

export function findRunByStravaId(stravaId: string): RunRecord | null {
	if (!stravaId) return null;
	return listRuns().find((r) => r.strava_id === stravaId) ?? null;
}

export function findRunsByDate(date: string): RunRecord[] {
	return listRuns().filter((r) => r.date === date);
}

/** True if route frontmatter is set or a matching GeoJSON exists under data/routes/. */
export function runHasMap(run: Pick<RunRecord, 'route' | 'strava_id'>): boolean {
	const route = (run.route ?? '').trim();
	if (route) {
		const name = path.basename(route.split('?')[0] ?? route);
		if (name.endsWith('.json') && existsSync(path.join(routesDir, name))) return true;
		return true;
	}
	if (run.strava_id) {
		return existsSync(path.join(routesDir, `${run.strava_id}.json`));
	}
	return false;
}

export function saveRun(input: SaveRunInput): RunRecord {
	ensureDataDirs();
	const slug = runSlug(input.date, input.day);
	const filepath = path.join(runsDir, `${slug}.md`);
	const front = {
		date: input.date,
		week: input.week,
		day: input.day,
		session: input.session,
		effort: input.effort,
		shins: input.shins,
		legs: input.legs,
		energy: input.energy,
		weather: input.weather,
		surface: input.surface,
		wanted_faster: input.wanted_faster,
		distance_km: input.distance_km,
		start_time: normalizeStartTime(input.start_time || ''),
		time: input.time,
		elapsed_time: input.elapsed_time || '',
		avg_pace: input.avg_pace,
		avg_hr: input.avg_hr,
		max_hr: input.max_hr ?? null,
		elev_gain: input.elev_gain ?? null,
		calories: input.calories ?? null,
		kilojoules: input.kilojoules ?? null,
		max_speed: input.max_speed ?? null,
		cadence: input.cadence,
		shoes: input.shoes,
		summary_image: input.summary_image,
		splits_image: input.splits_image,
		strava_id: input.strava_id || '',
		route: input.route || ''
	};
	const body = `${matter.stringify(input.notes?.trim() ? `${input.notes.trim()}\n` : '', front)}`;
	writeFileSync(filepath, body, 'utf8');
	return parseRunFile(filepath, slug);
}

function isSafeSlug(slug: string): boolean {
	return Boolean(slug) && !slug.includes('..') && !slug.includes('/') && !slug.includes('\\');
}

function routeFilenamesForRun(run: Pick<RunRecord, 'route' | 'strava_id'>): string[] {
	const names = new Set<string>();
	const route = (run.route ?? '').trim();
	if (route) {
		const name = path.basename(route.split('?')[0] ?? route);
		if (name.endsWith('.json')) names.add(name);
	}
	if (run.strava_id) names.add(`${run.strava_id}.json`);
	return [...names];
}

/** Delete a run markdown file and its linked route JSON (if present). */
export function deleteRun(slug: string): boolean {
	ensureDataDirs();
	if (!isSafeSlug(slug)) return false;
	const run = getRun(slug);
	if (!run) return false;

	unlinkSync(run.filepath);

	const routesRoot = path.resolve(routesDir);
	for (const name of routeFilenamesForRun(run)) {
		if (!name || name.includes('..') || name.includes('/') || name.includes('\\')) continue;
		const filepath = path.resolve(path.join(routesDir, name));
		if (!filepath.startsWith(routesRoot + path.sep) && filepath !== routesRoot) continue;
		if (existsSync(filepath)) unlinkSync(filepath);
	}

	return true;
}

/** Overwrite an existing run file in place (keeps slug/path). */
export function writeRun(run: RunRecord): RunRecord {
	ensureDataDirs();
	const front = {
		date: run.date,
		week: run.week,
		day: run.day,
		session: run.session,
		effort: run.effort,
		shins: run.shins,
		legs: run.legs,
		energy: run.energy,
		weather: run.weather,
		surface: run.surface,
		wanted_faster: run.wanted_faster,
		distance_km: run.distance_km,
		start_time: normalizeStartTime(run.start_time || ''),
		time: run.time,
		elapsed_time: run.elapsed_time || '',
		avg_pace: run.avg_pace,
		avg_hr: run.avg_hr,
		max_hr: run.max_hr,
		elev_gain: run.elev_gain,
		calories: run.calories,
		kilojoules: run.kilojoules,
		max_speed: run.max_speed,
		cadence: run.cadence,
		shoes: run.shoes,
		summary_image: run.summary_image,
		splits_image: run.splits_image,
		strava_id: run.strava_id || '',
		route: run.route || ''
	};
	const body = `${matter.stringify(run.notes?.trim() ? `${run.notes.trim()}\n` : '', front)}`;
	writeFileSync(run.filepath, body, 'utf8');
	return parseRunFile(run.filepath, run.slug);
}

/** Editable fields for an existing run (preserves images, strava_id, route, FIT extras). */
export type UpdateRunFields = {
	date: string;
	week: number | null;
	day: string;
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

/**
 * Update a run in place. If date/day change the slug, writes the new file and removes the old
 * markdown (routes/images/strava_id are preserved on the record).
 */
export function updateRun(slug: string, fields: UpdateRunFields): RunRecord {
	ensureDataDirs();
	if (!isSafeSlug(slug)) throw new Error('Invalid run slug.');
	const existing = getRun(slug);
	if (!existing) throw new Error('Run not found.');

	const date = fields.date.trim();
	const day = fields.day.trim();
	const session = fields.session.trim();
	if (!date || !day || !session) throw new Error('Date, day and session are required.');

	const newSlug = runSlug(date, day);
	if (!isSafeSlug(newSlug)) throw new Error('Invalid date or day for slug.');
	if (newSlug !== slug && getRun(newSlug)) {
		throw new Error('A run already exists for that date and day.');
	}

	const saved = saveRun({
		date,
		week: fields.week,
		day,
		session,
		effort: fields.effort,
		shins: fields.shins,
		legs: fields.legs,
		energy: fields.energy,
		weather: fields.weather,
		surface: fields.surface,
		wanted_faster: fields.wanted_faster,
		distance_km: fields.distance_km,
		start_time: fields.start_time,
		time: fields.time,
		elapsed_time: existing.elapsed_time,
		avg_pace: fields.avg_pace,
		avg_hr: fields.avg_hr,
		max_hr: fields.max_hr,
		elev_gain: fields.elev_gain,
		calories: existing.calories,
		kilojoules: existing.kilojoules,
		max_speed: existing.max_speed,
		cadence: fields.cadence,
		shoes: fields.shoes,
		summary_image: existing.summary_image,
		splits_image: existing.splits_image,
		strava_id: existing.strava_id,
		route: existing.route,
		notes: fields.notes
	});

	if (newSlug !== slug && existsSync(existing.filepath)) {
		unlinkSync(existing.filepath);
	}

	return saved;
}
