import { parseBestEfforts, type BestEffort } from '$lib/best-efforts';
import { normalizeStartTime } from '$lib/format';
import type { RunRecord } from '$lib/types';
import { getSql } from './db';

function toNum(value: unknown): number | null {
	if (value === null || value === undefined || value === '') return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

function toStr(value: unknown): string {
	return value === null || value === undefined ? '' : String(value);
}

function toBoolOrNull(value: unknown): boolean | null {
	if (value === true || value === 1 || value === 'true' || value === 't' || value === '1') return true;
	if (value === false || value === 0 || value === 'false' || value === 'f' || value === '0') return false;
	return null;
}

/** Map a DB row to a RunRecord. */
function rowToRun(row: Record<string, unknown>): RunRecord {
	return {
		slug: toStr(row.slug),
		date: toStr(row.date),
		week: toNum(row.week),
		day: toStr(row.day),
		activity_type: toStr(row.activity_type) || 'run',
		session: toStr(row.session) || 'other',
		effort: toNum(row.effort),
		shins: toNum(row.shins),
		legs: toNum(row.legs),
		energy: toNum(row.energy),
		weather: toStr(row.weather),
		surface: toStr(row.surface),
		wanted_faster: toBoolOrNull(row.wanted_faster),
		distance_km: toNum(row.distance_km),
		start_time: normalizeStartTime(toStr(row.start_time)),
		time: toStr(row.time),
		elapsed_time: toStr(row.elapsed_time),
		avg_pace: toStr(row.avg_pace),
		avg_hr: toNum(row.avg_hr),
		max_hr: toNum(row.max_hr),
		elev_gain: toNum(row.elev_gain),
		calories: toNum(row.calories),
		kilojoules: toNum(row.kilojoules),
		max_speed: toNum(row.max_speed),
		cadence: toNum(row.cadence),
		shoes: toStr(row.shoes),
		summary_image: toStr(row.summary_image),
		splits_image: toStr(row.splits_image),
		strava_id: toStr(row.strava_id),
		route: toStr(row.route),
		notes: toStr(row.notes),
		country: toStr(row.country),
		province: toStr(row.province),
		place: toStr(row.place),
		best_efforts: parseBestEfforts(row.best_efforts)
	};
}

/** Full record used by the internal upsert (everything except the derived slug helpers). */
type RunColumns = Omit<RunRecord, 'filepath'>;

function effortsJson(efforts: BestEffort[] | undefined | null): string {
	return JSON.stringify(efforts ?? []);
}

async function upsertRun(r: RunColumns): Promise<RunRecord> {
	const sql = getSql();
	const efforts = effortsJson(r.best_efforts);
	const rows = (await sql`
		INSERT INTO runs (
			slug, date, week, day, activity_type, session, effort, shins, legs, energy, weather, surface,
			wanted_faster, distance_km, start_time, "time", elapsed_time, avg_pace, avg_hr, max_hr,
			elev_gain, calories, kilojoules, max_speed, cadence, shoes, summary_image, splits_image,
			strava_id, route, notes, country, province, place, best_efforts
		) VALUES (
			${r.slug}, ${r.date}, ${r.week}, ${r.day}, ${r.activity_type}, ${r.session}, ${r.effort}, ${r.shins},
			${r.legs}, ${r.energy}, ${r.weather}, ${r.surface}, ${r.wanted_faster}, ${r.distance_km},
			${r.start_time}, ${r.time}, ${r.elapsed_time}, ${r.avg_pace}, ${r.avg_hr}, ${r.max_hr},
			${r.elev_gain}, ${r.calories}, ${r.kilojoules}, ${r.max_speed}, ${r.cadence}, ${r.shoes},
			${r.summary_image}, ${r.splits_image}, ${r.strava_id}, ${r.route}, ${r.notes}, ${r.country},
			${r.province}, ${r.place}, ${efforts}
		)
		ON CONFLICT (slug) DO UPDATE SET
			date = EXCLUDED.date, week = EXCLUDED.week, day = EXCLUDED.day,
			activity_type = EXCLUDED.activity_type, session = EXCLUDED.session,
			effort = EXCLUDED.effort, shins = EXCLUDED.shins, legs = EXCLUDED.legs, energy = EXCLUDED.energy,
			weather = EXCLUDED.weather, surface = EXCLUDED.surface, wanted_faster = EXCLUDED.wanted_faster,
			distance_km = EXCLUDED.distance_km, start_time = EXCLUDED.start_time, "time" = EXCLUDED."time",
			elapsed_time = EXCLUDED.elapsed_time, avg_pace = EXCLUDED.avg_pace, avg_hr = EXCLUDED.avg_hr,
			max_hr = EXCLUDED.max_hr, elev_gain = EXCLUDED.elev_gain, calories = EXCLUDED.calories,
			kilojoules = EXCLUDED.kilojoules, max_speed = EXCLUDED.max_speed, cadence = EXCLUDED.cadence,
			shoes = EXCLUDED.shoes, summary_image = EXCLUDED.summary_image, splits_image = EXCLUDED.splits_image,
			strava_id = EXCLUDED.strava_id, route = EXCLUDED.route, notes = EXCLUDED.notes,
			country = EXCLUDED.country, province = EXCLUDED.province, place = EXCLUDED.place,
			best_efforts = EXCLUDED.best_efforts
		RETURNING *
	`) as Record<string, unknown>[];
	return rowToRun(rows[0]!);
}

export async function listRuns(): Promise<RunRecord[]> {
	const sql = getSql();
	const rows = (await sql`SELECT * FROM runs ORDER BY date DESC, slug DESC`) as Record<
		string,
		unknown
	>[];
	return rows.map(rowToRun);
}

/** Highest observed max HR across all activities — the "dynamic" HRmax fallback. */
export async function getMaxHrAllTime(): Promise<number | null> {
	const sql = getSql();
	const rows = (await sql`SELECT MAX(max_hr) AS m FROM runs`) as { m: number | null }[];
	const m = rows[0]?.m;
	return m != null && Number.isFinite(Number(m)) ? Number(m) : null;
}

export async function getRun(slug: string): Promise<RunRecord | null> {
	const sql = getSql();
	const rows = (await sql`SELECT * FROM runs WHERE slug = ${slug} LIMIT 1`) as Record<
		string,
		unknown
	>[];
	return rows.length ? rowToRun(rows[0]!) : null;
}

export function runSlug(date: string, day: string) {
	const d = day.toLowerCase().replace(/\s+/g, '-');
	return `${date}-${d}`;
}

export interface SaveRunInput {
	date: string;
	week: number | null;
	day: string;
	activity_type?: string;
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
	country?: string;
	province?: string;
	place?: string;
	best_efforts?: BestEffort[];
}

export async function findRunByStravaId(stravaId: string): Promise<RunRecord | null> {
	if (!stravaId) return null;
	const sql = getSql();
	const rows = (await sql`
		SELECT * FROM runs WHERE strava_id = ${stravaId} ORDER BY date DESC LIMIT 1
	`) as Record<string, unknown>[];
	return rows.length ? rowToRun(rows[0]!) : null;
}

/** Point a run at a route track (used when import attaches/refreshes a map). */
export async function setRunRoute(slug: string, route: string): Promise<void> {
	const sql = getSql();
	await sql`UPDATE runs SET route = ${route} WHERE slug = ${slug}`;
}

export async function setRunBestEfforts(slug: string, efforts: BestEffort[]): Promise<void> {
	const sql = getSql();
	const json = effortsJson(efforts);
	await sql`UPDATE runs SET best_efforts = ${json} WHERE slug = ${slug}`;
}

export type FeelingsPatch = {
	effort?: number | null;
	shins?: number | null;
	legs?: number | null;
	energy?: number | null;
	wanted_faster?: boolean | null;
	surface?: string;
	notes?: string;
};

/**
 * Update only the subjective "feel" columns of a run, leaving device data untouched. Fields not
 * present in the patch keep their current value. Returns false if the slug does not exist.
 */
export async function updateRunFeelings(slug: string, p: FeelingsPatch): Promise<boolean> {
	const run = await getRun(slug);
	if (!run) return false;
	const pick = <T>(v: T | undefined, cur: T): T => (v === undefined ? cur : v);
	const merged = {
		effort: pick(p.effort, run.effort),
		shins: pick(p.shins, run.shins),
		legs: pick(p.legs, run.legs),
		energy: pick(p.energy, run.energy),
		wanted_faster: pick(p.wanted_faster, run.wanted_faster),
		surface: pick(p.surface, run.surface),
		notes: pick(p.notes, run.notes)
	};
	const sql = getSql();
	await sql`
		UPDATE runs SET
			effort = ${merged.effort},
			shins = ${merged.shins},
			legs = ${merged.legs},
			energy = ${merged.energy},
			wanted_faster = ${merged.wanted_faster},
			surface = ${merged.surface},
			notes = ${merged.notes}
		WHERE slug = ${slug}
	`;
	return true;
}

export async function findRunsByDate(date: string): Promise<RunRecord[]> {
	const sql = getSql();
	const rows = (await sql`SELECT * FROM runs WHERE date = ${date} ORDER BY slug`) as Record<
		string,
		unknown
	>[];
	return rows.map(rowToRun);
}

/** Route ids that have a stored GeoJSON track (used to derive has_map without per-run queries). */
export async function listRouteIds(): Promise<Set<string>> {
	const sql = getSql();
	const rows = (await sql`SELECT id FROM routes`) as Record<string, unknown>[];
	return new Set(rows.map((r) => toStr(r.id)));
}

/** True when a run has a map: an explicit route link, or a stored track keyed by strava_id. */
export function runHasMap(
	run: Pick<RunRecord, 'route' | 'strava_id'>,
	routeIds: Set<string>
): boolean {
	if ((run.route ?? '').trim()) return true;
	if (run.strava_id && routeIds.has(run.strava_id)) return true;
	return false;
}

/** First unused slug: base, then base-2, base-3… so same-day activities never overwrite. */
async function nextFreeSlug(base: string): Promise<string> {
	if (!(await getRun(base))) return base;
	for (let i = 2; i < 50; i++) {
		const candidate = `${base}-${i}`;
		if (!(await getRun(candidate))) return candidate;
	}
	return `${base}-${Date.now()}`;
}

export async function saveRun(input: SaveRunInput): Promise<RunRecord> {
	const slug = await nextFreeSlug(runSlug(input.date, input.day));
	return upsertRun({
		slug,
		date: input.date,
		week: input.week,
		day: input.day,
		activity_type: input.activity_type || 'run',
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
		route: input.route || '',
		notes: input.notes?.trim() ?? '',
		country: input.country || '',
		province: input.province || '',
		place: input.place || '',
		best_efforts: input.best_efforts ?? []
	});
}

function isSafeSlug(slug: string): boolean {
	return Boolean(slug) && !slug.includes('..') && !slug.includes('/') && !slug.includes('\\');
}

/** Route ids linked to a run (explicit `route` field and/or `{strava_id}.json`). */
function routeIdsForRun(run: Pick<RunRecord, 'route' | 'strava_id'>): string[] {
	const ids = new Set<string>();
	const route = (run.route ?? '').trim();
	if (route) {
		const name = route.split('?')[0]!.split('/').pop() ?? route;
		if (name.endsWith('.json')) ids.add(name.replace(/\.json$/, ''));
	}
	if (run.strava_id) ids.add(run.strava_id);
	return [...ids];
}

/** Delete a run and its linked route track(s). */
export async function deleteRun(slug: string): Promise<boolean> {
	if (!isSafeSlug(slug)) return false;
	const run = await getRun(slug);
	if (!run) return false;

	const sql = getSql();
	await sql`DELETE FROM runs WHERE slug = ${slug}`;

	for (const id of routeIdsForRun(run)) {
		await sql`DELETE FROM routes WHERE id = ${id}`;
	}
	return true;
}

/** Overwrite an existing run (keeps slug). */
export async function writeRun(run: RunRecord): Promise<RunRecord> {
	return upsertRun({
		slug: run.slug,
		date: run.date,
		week: run.week,
		day: run.day,
		activity_type: run.activity_type || 'run',
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
		route: run.route || '',
		notes: run.notes?.trim() ?? '',
		country: run.country || '',
		province: run.province || '',
		place: run.place || '',
		best_efforts: run.best_efforts ?? []
	});
}

/** Editable fields for an existing run (preserves images, strava_id, route, FIT extras). */
export type UpdateRunFields = {
	date: string;
	week: number | null;
	day: string;
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

/**
 * Update a run in place. Same-day extras keep their `-2`/`-3` slug; a date change mints a
 * free slug instead of colliding. Routes/images/strava_id stay on the record.
 */
export async function updateRun(slug: string, fields: UpdateRunFields): Promise<RunRecord> {
	if (!isSafeSlug(slug)) throw new Error('Invalid run slug.');
	const existing = await getRun(slug);
	if (!existing) throw new Error('Run not found.');

	const date = fields.date.trim();
	const day = fields.day.trim();
	const session = fields.session.trim();
	if (!date || !day || !session) throw new Error('Date, day and session are required.');

	const baseSlug = runSlug(date, day);
	if (!isSafeSlug(baseSlug)) throw new Error('Invalid date or day for slug.');
	const newSlug = existing.date === date ? slug : await nextFreeSlug(baseSlug);

	const saved = await upsertRun({
		slug: newSlug,
		date,
		week: fields.week,
		day,
		activity_type: fields.activity_type || 'run',
		session,
		effort: fields.effort,
		shins: fields.shins,
		legs: fields.legs,
		energy: fields.energy,
		weather: fields.weather,
		surface: fields.surface,
		wanted_faster: fields.wanted_faster,
		distance_km: fields.distance_km,
		start_time: normalizeStartTime(fields.start_time),
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
		notes: fields.notes,
		country: existing.country,
		province: existing.province,
		place: existing.place,
		best_efforts: existing.best_efforts ?? []
	});

	if (newSlug !== slug) {
		const sql = getSql();
		await sql`DELETE FROM runs WHERE slug = ${slug}`;
	}

	return saved;
}
