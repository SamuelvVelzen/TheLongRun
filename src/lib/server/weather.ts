import type { RunRecord } from '$lib/types';
import { normalizeStartTime, parseDurationSeconds } from '$lib/format';
import { getRouteGeoJson, routeIdForRun } from './route-analytics';
import { getSql } from './db';

/** Athlete default from typical route centroid (Harderwijk / Flevoland area, NL). Override with DEFAULT_LAT / DEFAULT_LON. */
export const FALLBACK_LAT = 52.35;
export const FALLBACK_LON = 5.63;

/** Morning default when no start_time is known (prefer real clock times from Strava/FIT). */
export const DEFAULT_START_HHMM = '07:00';

const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

type LatLon = { lat: number; lon: number };

const WMO_LABEL: Record<number, string> = {
	0: 'clear',
	1: 'mainly clear',
	2: 'partly cloudy',
	3: 'cloudy',
	45: 'foggy',
	48: 'foggy',
	51: 'drizzle',
	53: 'drizzle',
	55: 'drizzle',
	56: 'freezing drizzle',
	57: 'freezing drizzle',
	61: 'rain',
	63: 'rain',
	65: 'heavy rain',
	66: 'freezing rain',
	67: 'freezing rain',
	71: 'snow',
	73: 'snow',
	75: 'heavy snow',
	77: 'snow',
	80: 'showers',
	81: 'showers',
	82: 'heavy showers',
	85: 'snow showers',
	86: 'snow showers',
	95: 'thunderstorms',
	96: 'thunderstorms',
	99: 'thunderstorms'
};

function envCoord(name: string): number | null {
	const n = Number(process.env[name]);
	return Number.isFinite(n) ? n : null;
}

/** Average of LineString coordinates → { lat, lon }. GeoJSON is [lon, lat]. */
export function centroidFromCoordinates(coordinates: unknown): LatLon | null {
	if (!Array.isArray(coordinates) || coordinates.length === 0) return null;
	let sumLon = 0;
	let sumLat = 0;
	let n = 0;
	for (const pt of coordinates) {
		if (!Array.isArray(pt) || pt.length < 2) continue;
		const lon = Number(pt[0]);
		const lat = Number(pt[1]);
		if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
		if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
		sumLon += lon;
		sumLat += lat;
		n++;
	}
	if (n === 0) return null;
	return { lat: sumLat / n, lon: sumLon / n };
}

function centroidFromGeoJson(raw: unknown): LatLon | null {
	const geo = raw as { geometry?: { coordinates?: unknown } } | null;
	if (!geo) return null;
	return centroidFromCoordinates(geo.geometry?.coordinates);
}

async function centroidFromAnyRoute(): Promise<LatLon | null> {
	const sql = getSql();
	const rows = (await sql`SELECT geojson FROM routes LIMIT 1`) as { geojson: unknown }[];
	if (!rows.length) return null;
	return centroidFromGeoJson(rows[0]!.geojson);
}

export async function getDefaultLocation(): Promise<LatLon> {
	const lat = envCoord('DEFAULT_LAT');
	const lon = envCoord('DEFAULT_LON');
	if (lat != null && lon != null) return { lat, lon };
	return (await centroidFromAnyRoute()) ?? { lat: FALLBACK_LAT, lon: FALLBACK_LON };
}

export async function locationForRun(
	run: Pick<RunRecord, 'route' | 'strava_id'>
): Promise<LatLon> {
	const id = routeIdForRun(run);
	if (id) {
		const c = centroidFromGeoJson(await getRouteGeoJson(id));
		if (c) return c;
	}
	return getDefaultLocation();
}

function weatherCodeLabel(code: number | null | undefined): string {
	if (code == null || !Number.isFinite(code)) return '';
	return WMO_LABEL[Math.round(code)] ?? 'mixed';
}

function humidityPhrase(rh: number | null | undefined): string {
	if (rh == null || !Number.isFinite(rh)) return '';
	if (rh >= 80) return 'humid';
	if (rh >= 65) return 'humid';
	return '';
}

/** Meteostat / Strava CSV Weather Condition codes → short labels. */
const STRAVA_CONDITION_LABEL: Record<number, string> = {
	1: 'clear',
	2: 'mainly clear',
	3: 'cloudy',
	4: 'cloudy',
	5: 'foggy',
	6: 'foggy',
	7: 'drizzle',
	8: 'rain',
	9: 'heavy rain',
	10: 'freezing rain',
	11: 'freezing rain',
	12: 'sleet',
	13: 'sleet',
	14: 'snow',
	15: 'snow',
	16: 'heavy snow',
	17: 'showers',
	18: 'heavy showers',
	19: 'sleet',
	20: 'sleet',
	21: 'snow showers',
	22: 'snow showers',
	23: 'thunderstorms',
	24: 'hail',
	25: 'thunderstorms',
	26: 'thunderstorms',
	27: 'storm'
};

export function stravaConditionLabel(code: number | null | undefined): string {
	if (code == null || !Number.isFinite(code)) return '';
	return STRAVA_CONDITION_LABEL[Math.round(code)] ?? '';
}

/** Humidity as 0–100 (%). Strava CSV often stores 0–1 fractions. */
export function normalizeHumidityPercent(raw: number | null | undefined): number | null {
	if (raw == null || !Number.isFinite(raw)) return null;
	if (raw >= 0 && raw <= 1) return raw * 100;
	if (raw > 1 && raw <= 100) return raw;
	return null;
}

/** Short human string matching seed style, e.g. `28°C humid / cloudy` or `27°C, partly cloudy`. */
export function formatWeatherString(opts: {
	tempC: number | null;
	weatherCode?: number | null;
	/** Pre-resolved sky label (e.g. from Strava); wins over weatherCode when set. */
	condition?: string | null;
	humidity?: number | null;
}): string {
	const temp =
		opts.tempC != null && Number.isFinite(opts.tempC) ? `${Math.round(opts.tempC)}°C` : '';
	const sky = (opts.condition?.trim() || weatherCodeLabel(opts.weatherCode));
	const humid = humidityPhrase(opts.humidity);

	if (!temp && !sky) return '';
	if (temp && humid && sky) return `${temp} ${humid} / ${sky}`;
	if (temp && humid) return `${temp} ${humid}`;
	if (temp && sky) return `${temp}, ${sky}`;
	return temp || sky;
}

/**
 * Build weather display string from Strava CSV / FIT device fields.
 * Only includes fields that are present — never invents empty placeholders.
 */
export function formatStravaDeviceWeather(opts: {
	tempC?: number | null;
	conditionCode?: number | null;
	condition?: string | null;
	humidity?: number | null;
}): string {
	const condition =
		opts.condition?.trim() || stravaConditionLabel(opts.conditionCode) || '';
	return formatWeatherString({
		tempC: opts.tempC ?? null,
		condition,
		humidity: normalizeHumidityPercent(opts.humidity)
	});
}

/**
 * Minutes from midnight for the weather sample.
 * Prefer start clock time; if duration is also known, use the run midpoint.
 * With only duration (no start), fall back to midday. Otherwise DEFAULT_START_HHMM.
 */
export function weatherSampleMinutes(
	startTimeHHmm: string | null | undefined,
	duration?: string | null
): number {
	const start = normalizeStartTime(startTimeHHmm ?? '');
	const durSec = parseDurationSeconds(duration);
	if (start) {
		const [hs, ms] = start.split(':').map(Number);
		let mins = hs * 60 + ms;
		if (durSec != null && durSec > 0) {
			mins += Math.round(durSec / 60 / 2);
		}
		return ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
	}
	if (durSec != null && durSec > 0) {
		// No start clock — sample around midday using half duration as offset toward noon.
		return 12 * 60;
	}
	const [dh, dm] = DEFAULT_START_HHMM.split(':').map(Number);
	return dh * 60 + dm;
}

export function formatMinutesAsHHmm(totalMinutes: number): string {
	const mins = ((Math.round(totalMinutes) % (24 * 60)) + 24 * 60) % (24 * 60);
	const h = Math.floor(mins / 60);
	const m = mins % 60;
	return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

interface OpenMeteoHourly {
	hourly?: {
		time?: string[];
		temperature_2m?: (number | null)[];
		relative_humidity_2m?: (number | null)[];
		weather_code?: (number | null)[];
	};
}

/**
 * Nearest hourly slot for `date` + sample minutes (timezone=auto local times from Open-Meteo).
 */
function parseOpenMeteoHourly(data: OpenMeteoHourly, date: string, sampleMinutes: number): string {
	const times = data.hourly?.time ?? [];
	if (!times.length) return '';

	const targetMins = sampleMinutes;
	let bestIdx = -1;
	let bestDist = Infinity;

	for (let i = 0; i < times.length; i++) {
		const t = times[i] ?? '';
		if (!t.startsWith(date)) continue;
		const hour = Number(t.slice(11, 13));
		const minute = Number(t.slice(14, 16) || '0');
		if (!Number.isFinite(hour)) continue;
		const mins = hour * 60 + (Number.isFinite(minute) ? minute : 0);
		const dist = Math.abs(mins - targetMins);
		if (dist < bestDist) {
			bestDist = dist;
			bestIdx = i;
		}
	}

	// If nothing matched the date prefix, pick globally nearest absolute hour string.
	if (bestIdx < 0) {
		const targetLabel = `${date}T${formatMinutesAsHHmm(targetMins)}`;
		for (let i = 0; i < times.length; i++) {
			const t = times[i] ?? '';
			const dist = Math.abs(Date.parse(t) - Date.parse(targetLabel));
			if (Number.isFinite(dist) && dist < bestDist) {
				bestDist = dist;
				bestIdx = i;
			}
		}
	}

	if (bestIdx < 0) return '';

	const temp = data.hourly?.temperature_2m?.[bestIdx] ?? null;
	const humidity = data.hourly?.relative_humidity_2m?.[bestIdx] ?? null;
	const code = data.hourly?.weather_code?.[bestIdx] ?? null;

	return formatWeatherString({
		tempC: temp == null ? null : Number(temp),
		weatherCode: code == null ? null : Number(code),
		humidity: humidity == null ? null : Number(humidity)
	});
}

function daysFromToday(isoDate: string): number {
	const today = new Date();
	const y = today.getUTCFullYear();
	const m = String(today.getUTCMonth() + 1).padStart(2, '0');
	const d = String(today.getUTCDate()).padStart(2, '0');
	const t0 = Date.parse(`${y}-${m}-${d}T00:00:00Z`);
	const t1 = Date.parse(`${isoDate}T00:00:00Z`);
	if (!Number.isFinite(t0) || !Number.isFinite(t1)) return 0;
	return Math.round((t1 - t0) / 86_400_000);
}

async function fetchJson(url: string): Promise<OpenMeteoHourly | null> {
	try {
		const res = await fetch(url);
		if (!res.ok) return null;
		return (await res.json()) as OpenMeteoHourly;
	} catch {
		return null;
	}
}

/**
 * Fetch weather at the nearest hourly Open-Meteo slot for date + local clock time.
 * `@param timeHHmm` Start clock (`HH:mm`); when omitted, uses DEFAULT_START_HHMM.
 * Temp / weather_code / humidity all come from that single hour — not daily max or afternoon average.
 */
export async function fetchWeatherForDateTime(
	date: string,
	timeHHmm?: string | null,
	lat?: number | null,
	lon?: number | null,
	duration?: string | null
): Promise<string> {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
	const def = await getDefaultLocation();
	const latitude = lat != null && Number.isFinite(lat) ? lat : def.lat;
	const longitude = lon != null && Number.isFinite(lon) ? lon : def.lon;
	const sampleMins = weatherSampleMinutes(timeHHmm, duration);

	const hourly = 'temperature_2m,relative_humidity_2m,weather_code';
	const common = `latitude=${latitude}&longitude=${longitude}&timezone=auto`;

	const offset = daysFromToday(date);
	const preferForecast = offset >= 0;

	const archiveUrl =
		`${ARCHIVE_URL}?${common}` +
		`&start_date=${date}&end_date=${date}` +
		`&hourly=${hourly}`;

	const forecastUrl =
		`${FORECAST_URL}?${common}` +
		`&start_date=${date}&end_date=${date}` +
		`&hourly=${hourly}`;

	const primary = preferForecast ? forecastUrl : archiveUrl;
	const secondary = preferForecast ? archiveUrl : forecastUrl;

	let data = await fetchJson(primary);
	let text = data ? parseOpenMeteoHourly(data, date, sampleMins) : '';
	if (!text) {
		data = await fetchJson(secondary);
		text = data ? parseOpenMeteoHourly(data, date, sampleMins) : '';
	}
	return text;
}

/** @deprecated Prefer fetchWeatherForDateTime — kept for callers that only have a date. */
export async function fetchWeatherForDate(
	date: string,
	lat?: number | null,
	lon?: number | null
): Promise<string> {
	return fetchWeatherForDateTime(date, DEFAULT_START_HHMM, lat, lon);
}

export async function weatherForRun(
	run: Pick<RunRecord, 'date' | 'route' | 'strava_id' | 'start_time' | 'time'>
): Promise<string> {
	const loc = await locationForRun(run);
	return fetchWeatherForDateTime(run.date, run.start_time, loc.lat, loc.lon, run.time);
}
