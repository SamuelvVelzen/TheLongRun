import { writeFileSync } from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import {
	findRunByStravaId,
	findRunsByDate,
	listRuns,
	runSlug,
	saveRun,
	writeRun
} from './runs';
import { ensureDataDirs, routesDir, runsDir } from './paths';
import { parseFitBuffer, sessionGuessForFit, type ParsedFitActivity } from './fit';
import { formatStravaDeviceWeather, weatherForRun } from './weather';
import { parseActivitiesCsvMetrics } from './strava-csv';
import { analyticsToProperties } from '$lib/splits';
import type { RunRecord } from '$lib/types';

export interface ImportResultItem {
	filename: string;
	status: 'created' | 'updated' | 'skipped' | 'error';
	reason?: string;
	slug?: string;
	strava_id?: string;
	sport?: string;
	points?: number;
}

export interface ImportSummary {
	items: ImportResultItem[];
	created: number;
	updated: number;
	skipped: number;
	errors: number;
}

function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let field = '';
	let row: string[] = [];
	let inQuotes = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (inQuotes) {
			if (c === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
					continue;
				}
				inQuotes = false;
				continue;
			}
			field += c;
			continue;
		}
		if (c === '"') {
			inQuotes = true;
			continue;
		}
		if (c === ',') {
			row.push(field);
			field = '';
			continue;
		}
		if (c === '\r') continue;
		if (c === '\n') {
			row.push(field);
			rows.push(row);
			field = '';
			row = [];
			continue;
		}
		field += c;
	}
	if (field.length || row.length) {
		row.push(field);
		rows.push(row);
	}
	return rows;
}

/** Map FIT basename (without .fit/.gz) → Strava Activity ID from activities.csv. */
export function parseActivitiesCsv(text: string): Map<string, string> {
	const map = new Map<string, string>();
	const rows = parseCsv(text);
	if (!rows.length) return map;
	const headers = rows[0];
	const idxId = headers.indexOf('Activity ID');
	const idxFile = headers.indexOf('Filename');
	if (idxId < 0 || idxFile < 0) return map;
	for (let i = 1; i < rows.length; i++) {
		const id = String(rows[i][idxId] ?? '').trim();
		const file = String(rows[i][idxFile] ?? '')
			.trim()
			.replace(/\\/g, '/');
		if (!id || !file) continue;
		const base = path.basename(file).replace(/\.fit(\.gz)?$/i, '');
		if (base) map.set(base, id);
	}
	return map;
}

/** Map Strava Activity ID → formatted weather string from CSV (when present). */
export function parseActivitiesCsvWeatherById(text: string): Map<string, string> {
	const map = new Map<string, string>();
	for (const [id, m] of parseActivitiesCsvMetrics(text)) {
		if (m.weather) map.set(id, m.weather);
	}
	return map;
}

function deviceWeatherFromFit(activity: ParsedFitActivity): string {
	return formatStravaDeviceWeather({
		tempC: activity.avgTempC ?? activity.maxTempC ?? null
	});
}

function fitBasename(filename: string): string {
	return path.basename(filename).replace(/\.fit(\.gz)?$/i, '');
}

export function isFitFilename(name: string): boolean {
	return /\.fit(\.gz)?$/i.test(name);
}

export function saveRouteGeoJson(stravaId: string, activity: ParsedFitActivity): string {
	ensureDataDirs();
	const filename = `${stravaId}.json`;
	const filepath = path.join(routesDir, filename);
	const coordinates = activity.points.map((p) => [p.lng, p.lat]);
	const analyticsProps = activity.analytics ? analyticsToProperties(activity.analytics) : {};
	const geojson = {
		type: 'Feature',
		properties: {
			strava_id: stravaId,
			sport: activity.sport,
			date: activity.date,
			distance_km: activity.distanceKm,
			point_count: activity.points.length,
			...analyticsProps
		},
		geometry: {
			type: 'LineString',
			coordinates
		}
	};
	writeFileSync(filepath, JSON.stringify(geojson), 'utf8');
	return `/routes/${filename}`;
}

function resolveStravaId(fitId: string, csvMap: Map<string, string>): string {
	return csvMap.get(fitId) || fitId;
}

function matchExisting(
	stravaId: string,
	date: string,
	distanceKm: number | null
): RunRecord | null {
	const byId = findRunByStravaId(stravaId);
	if (byId) return byId;

	if (!date) return null;
	const sameDay = findRunsByDate(date);
	if (sameDay.length === 1) return sameDay[0];
	if (sameDay.length > 1 && distanceKm != null) {
		let best: RunRecord | null = null;
		let bestDiff = Infinity;
		for (const r of sameDay) {
			if (r.distance_km == null) continue;
			const diff = Math.abs(r.distance_km - distanceKm);
			if (diff < bestDiff) {
				bestDiff = diff;
				best = r;
			}
		}
		if (best && bestDiff <= 0.35) return best;
	}
	return null;
}

function uniqueSlug(date: string, day: string, stravaId: string): string {
	const base = runSlug(date, day);
	const known = new Set(listRuns().map((r) => r.slug));
	if (!known.has(base)) return base;
	const withId = `${base}-${stravaId}`;
	if (!known.has(withId)) return withId;
	let i = 2;
	while (known.has(`${withId}-${i}`)) i++;
	return `${withId}-${i}`;
}

function createRunRecord(
	slug: string,
	activity: ParsedFitActivity,
	stravaId: string,
	routePath: string,
	day: string,
	session: string
): RunRecord {
	return {
		slug,
		date: activity.date,
		week: null,
		day,
		session,
		effort: null,
		shins: null,
		legs: null,
		energy: null,
		weather: '',
		surface: '',
		wanted_faster: null,
		distance_km: activity.distanceKm,
		start_time: activity.startClock,
		time: activity.time,
		elapsed_time: activity.elapsedTime || '',
		avg_pace: activity.avgPace,
		avg_hr: activity.avgHr,
		max_hr: activity.maxHr,
		elev_gain: activity.elevGain,
		calories: activity.calories,
		kilojoules: null,
		max_speed: activity.maxSpeed,
		cadence: activity.cadence,
		shoes: '',
		summary_image: '',
		splits_image: '',
		strava_id: stravaId,
		route: routePath,
		notes: `Imported from Strava FIT (strava:${stravaId}).`,
		filepath: path.join(runsDir, `${slug}.md`)
	};
}

/**
 * Prefer Strava CSV / FIT device weather when present; Open-Meteo only as fallback.
 * When `deviceWeather` is provided, it replaces any existing Open-Meteo string.
 */
async function ensureWeather(
	run: RunRecord,
	deviceWeather?: string
): Promise<RunRecord> {
	const device = deviceWeather?.trim() ?? '';
	if (device) {
		if (run.weather?.trim() === device) return run;
		run.weather = device;
		return writeRun(run);
	}
	if (run.weather?.trim()) return run;
	const weather = await weatherForRun(run);
	if (!weather) return run;
	run.weather = weather;
	return writeRun(run);
}

export async function importParsedFit(opts: {
	filename: string;
	activity: ParsedFitActivity;
	csvMap: Map<string, string>;
	csvWeatherById?: Map<string, string>;
	runsOnly: boolean;
}): Promise<ImportResultItem> {
	const { filename, activity, csvMap, csvWeatherById, runsOnly } = opts;
	const fitId = fitBasename(filename);

	if (runsOnly && !activity.isRun) {
		return {
			filename,
			status: 'skipped',
			reason: `Not a run (${activity.sport || 'unknown sport'})`,
			sport: activity.sport
		};
	}

	if (!activity.date) {
		return {
			filename,
			status: 'error',
			reason: 'Could not read activity date',
			sport: activity.sport
		};
	}

	const stravaId = resolveStravaId(fitId, csvMap);
	const existing = matchExisting(stravaId, activity.date, activity.distanceKm);
	const routePath = activity.points.length >= 2 ? saveRouteGeoJson(stravaId, activity) : '';
	const deviceWeather =
		csvWeatherById?.get(stravaId)?.trim() || deviceWeatherFromFit(activity) || '';

	if (existing) {
		existing.route = routePath || existing.route;
		if (!existing.strava_id) existing.strava_id = stravaId;
		if (existing.distance_km == null && activity.distanceKm != null) {
			existing.distance_km = activity.distanceKm;
		}
		if (!existing.time && activity.time) existing.time = activity.time;
		if (!existing.elapsed_time && activity.elapsedTime) existing.elapsed_time = activity.elapsedTime;
		if (!existing.start_time && activity.startClock) existing.start_time = activity.startClock;
		if (!existing.avg_pace && activity.avgPace) existing.avg_pace = activity.avgPace;
		if (existing.avg_hr == null && activity.avgHr != null) existing.avg_hr = activity.avgHr;
		if (existing.max_hr == null && activity.maxHr != null) existing.max_hr = activity.maxHr;
		if (existing.elev_gain == null && activity.elevGain != null) existing.elev_gain = activity.elevGain;
		if (existing.calories == null && activity.calories != null) existing.calories = activity.calories;
		if (existing.max_speed == null && activity.maxSpeed != null) existing.max_speed = activity.maxSpeed;
		if (existing.cadence == null && activity.cadence != null) existing.cadence = activity.cadence;
		let saved = writeRun(existing);
		saved = await ensureWeather(saved, deviceWeather);
		return {
			filename,
			status: 'updated',
			slug: saved.slug,
			strava_id: stravaId,
			sport: activity.sport,
			points: activity.points.length,
			reason: routePath ? 'Attached route' : 'Matched run (no GPS track)'
		};
	}

	const { day, session } = sessionGuessForFit(activity.date, activity.distanceKm);
	const slug = uniqueSlug(activity.date, day, stravaId);
	const baseSlug = runSlug(activity.date, day);

	if (slug === baseSlug) {
		let saved = saveRun({
			date: activity.date,
			week: null,
			day,
			session,
			effort: null,
			shins: null,
			legs: null,
			energy: null,
			weather: deviceWeather,
			surface: '',
			wanted_faster: null,
			distance_km: activity.distanceKm,
			start_time: activity.startClock,
			time: activity.time,
			elapsed_time: activity.elapsedTime || '',
			avg_pace: activity.avgPace,
			avg_hr: activity.avgHr,
			max_hr: activity.maxHr,
			elev_gain: activity.elevGain,
			calories: activity.calories,
			max_speed: activity.maxSpeed,
			cadence: activity.cadence,
			shoes: '',
			summary_image: '',
			splits_image: '',
			strava_id: stravaId,
			route: routePath,
			notes: `Imported from Strava FIT (strava:${stravaId}).`
		});
		saved = await ensureWeather(saved, deviceWeather);
		return {
			filename,
			status: 'created',
			slug: saved.slug,
			strava_id: stravaId,
			sport: activity.sport,
			points: activity.points.length
		};
	}

	const created = createRunRecord(slug, activity, stravaId, routePath, day, session);
	if (deviceWeather) created.weather = deviceWeather;
	let saved = writeRun(created);
	saved = await ensureWeather(saved, deviceWeather);
	return {
		filename,
		status: 'created',
		slug: saved.slug,
		strava_id: stravaId,
		sport: activity.sport,
		points: activity.points.length
	};
}

function summarize(items: ImportResultItem[]): ImportSummary {
	return {
		items,
		created: items.filter((i) => i.status === 'created').length,
		updated: items.filter((i) => i.status === 'updated').length,
		skipped: items.filter((i) => i.status === 'skipped').length,
		errors: items.filter((i) => i.status === 'error').length
	};
}

export async function importFitFiles(opts: {
	files: { name: string; buffer: Buffer }[];
	csvText?: string;
	runsOnly?: boolean;
}): Promise<ImportSummary> {
	const runsOnly = opts.runsOnly !== false;
	const csvMap = opts.csvText ? parseActivitiesCsv(opts.csvText) : new Map<string, string>();
	const csvWeatherById = opts.csvText
		? parseActivitiesCsvWeatherById(opts.csvText)
		: new Map<string, string>();
	const items: ImportResultItem[] = [];

	for (const file of opts.files) {
		try {
			const activity = await parseFitBuffer(file.buffer, file.name);
			items.push(
				await importParsedFit({
					filename: file.name,
					activity,
					csvMap,
					csvWeatherById,
					runsOnly
				})
			);
		} catch (e) {
			items.push({
				filename: file.name,
				status: 'error',
				reason: e instanceof Error ? e.message : String(e)
			});
		}
	}

	return summarize(items);
}

export async function extractFitFromZip(buffer: Buffer): Promise<{
	files: { name: string; buffer: Buffer }[];
	csvText?: string;
}> {
	const zip = await JSZip.loadAsync(buffer);
	const files: { name: string; buffer: Buffer }[] = [];
	let csvText: string | undefined;

	for (const [name, entry] of Object.entries(zip.files)) {
		if (entry.dir) continue;
		const base = path.basename(name);
		if (/^activities\.csv$/i.test(base)) {
			csvText = await entry.async('string');
			continue;
		}
		if (!isFitFilename(base)) continue;
		const ab = await entry.async('nodebuffer');
		files.push({ name: base, buffer: Buffer.from(ab) });
	}

	return { files, csvText };
}
