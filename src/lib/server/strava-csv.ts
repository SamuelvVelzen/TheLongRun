import {
	formatDuration,
	formatPace,
	formatPaceFromSpeedMps,
	mpsToKmh,
	normalizeStartTime,
	roundElev,
	roundKm
} from '$lib/format';
import type { RunRecord } from '$lib/types';
import { listRuns, writeRun } from './runs';
import { formatStravaDeviceWeather } from './weather';

export interface StravaCsvMetrics {
	strava_id: string;
	activity_type: string;
	name: string;
	date: string;
	start_time: string;
	distance_km: number | null;
	time: string;
	elapsed_time: string;
	avg_pace: string;
	avg_hr: number | null;
	max_hr: number | null;
	elev_gain: number | null;
	calories: number | null;
	kilojoules: number | null;
	max_speed: number | null;
	cadence: number | null;
	/** Formatted weather from Strava CSV columns when present; empty otherwise. */
	weather: string;
}

export interface BackfillResultItem {
	slug: string;
	strava_id: string;
	status: 'updated' | 'skipped' | 'missing_csv';
	fields?: string[];
}

export interface BackfillSummary {
	items: BackfillResultItem[];
	updated: number;
	skipped: number;
	missing: number;
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

function getField(headers: string[], row: string[], name: string, occurrence = 0): string {
	let seen = 0;
	for (let i = 0; i < headers.length; i++) {
		if (headers[i] === name) {
			if (seen === occurrence) return row[i] ?? '';
			seen++;
		}
	}
	return '';
}

function numOrNull(raw: string): number | null {
	const n = Number(String(raw ?? '').trim());
	return Number.isFinite(n) && n > 0 ? n : null;
}

/** Numeric field that may be zero or negative (temps, humidity fractions). */
function numAny(raw: string): number | null {
	const s = String(raw ?? '').trim();
	if (s === '') return null;
	const n = Number(s);
	return Number.isFinite(n) ? n : null;
}

/**
 * Prefer Strava weather-service columns, then device Average/Max Temperature.
 * Returns '' when nothing useful is present.
 */
export function weatherFromCsvRow(headers: string[], row: string[]): string {
	const weatherTemp = numAny(getField(headers, row, 'Weather Temperature'));
	const avgTemp = numAny(getField(headers, row, 'Average Temperature'));
	const maxTemp = numAny(getField(headers, row, 'Max Temperature'));
	const condition = numAny(getField(headers, row, 'Weather Condition'));
	const humidity = numAny(getField(headers, row, 'Humidity'));

	const tempC = weatherTemp ?? avgTemp ?? maxTemp ?? null;
	const hasSky = condition != null || humidity != null;
	if (tempC == null && !hasSky) return '';

	return formatStravaDeviceWeather({
		tempC,
		conditionCode: condition,
		humidity
	});
}

function parseActivityLocal(raw: string): { date: string; start_time: string } {
	const d = new Date(raw);
	if (Number.isNaN(d.getTime())) return { date: '', start_time: '' };
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	const hh = String(d.getHours()).padStart(2, '0');
	const mm = String(d.getMinutes()).padStart(2, '0');
	return { date: `${y}-${m}-${day}`, start_time: `${hh}:${mm}` };
}

function distanceKmFromRow(headers: string[], row: string[]): number | null {
	const dist0 = Number(getField(headers, row, 'Distance', 0));
	const dist1 = Number(getField(headers, row, 'Distance', 1));
	if (Number.isFinite(dist1) && dist1 > 100) return roundKm(dist1);
	if (Number.isFinite(dist0) && dist0 > 0) {
		return dist0 > 100 ? roundKm(dist0) : Math.round(dist0 * 100) / 100;
	}
	return null;
}

function cadenceFromRow(headers: string[], row: string[]): number | null {
	let cadenceRaw = Number(getField(headers, row, 'Average Cadence'));
	if (!Number.isFinite(cadenceRaw) || cadenceRaw <= 0) return null;
	if (cadenceRaw < 120) cadenceRaw = cadenceRaw * 2;
	return Math.round(cadenceRaw);
}

function kilojoulesFromRow(headers: string[], row: string[]): number | null {
	const work = Number(getField(headers, row, 'Total Work'));
	if (!Number.isFinite(work) || work <= 0) return null;
	// Strava Total Work is typically joules
	const kj = work >= 1000 ? work / 1000 : work;
	return Math.round(kj * 10) / 10;
}

export function rowToMetrics(headers: string[], row: string[]): StravaCsvMetrics | null {
	const strava_id = String(getField(headers, row, 'Activity ID')).trim();
	if (!strava_id) return null;

	const { date, start_time } = parseActivityLocal(getField(headers, row, 'Activity Date'));
	const distance_km = distanceKmFromRow(headers, row);
	const moving =
		numOrNull(getField(headers, row, 'Moving Time', 0)) ??
		numOrNull(getField(headers, row, 'Moving Time', 1)) ??
		null;
	const elapsed =
		numOrNull(getField(headers, row, 'Elapsed Time', 1)) ??
		numOrNull(getField(headers, row, 'Elapsed Time', 0)) ??
		null;

	const avgSpeed = numOrNull(getField(headers, row, 'Average Speed'));
	let avg_pace = avgSpeed != null ? formatPaceFromSpeedMps(avgSpeed) : '';
	if (!avg_pace && distance_km != null && moving != null) {
		avg_pace = formatPace(distance_km * 1000, moving);
	}

	const avgHr = numOrNull(getField(headers, row, 'Average Heart Rate'));
	const maxHr =
		numOrNull(getField(headers, row, 'Max Heart Rate', 1)) ??
		numOrNull(getField(headers, row, 'Max Heart Rate', 0));
	const elev = numOrNull(getField(headers, row, 'Elevation Gain'));
	const calories = numOrNull(getField(headers, row, 'Calories'));
	const maxSpeedMps = numOrNull(getField(headers, row, 'Max Speed'));

	return {
		strava_id,
		activity_type: getField(headers, row, 'Activity Type'),
		name: getField(headers, row, 'Activity Name') || 'Run',
		date,
		start_time: normalizeStartTime(start_time),
		distance_km,
		time: moving != null ? formatDuration(moving) : '',
		elapsed_time: elapsed != null ? formatDuration(elapsed) : '',
		avg_pace,
		avg_hr: avgHr != null ? Math.round(avgHr) : null,
		max_hr: maxHr != null ? Math.round(maxHr) : null,
		elev_gain: elev != null ? roundElev(elev) : null,
		calories: calories != null ? Math.round(calories) : null,
		kilojoules: kilojoulesFromRow(headers, row),
		max_speed: maxSpeedMps != null ? mpsToKmh(maxSpeedMps) : null,
		cadence: cadenceFromRow(headers, row),
		weather: weatherFromCsvRow(headers, row)
	};
}

/** Parse Strava activities.csv → metrics keyed by Activity ID. */
export function parseActivitiesCsvMetrics(text: string): Map<string, StravaCsvMetrics> {
	const map = new Map<string, StravaCsvMetrics>();
	const rows = parseCsv(text);
	if (!rows.length) return map;
	const headers = rows[0];
	for (let i = 1; i < rows.length; i++) {
		const metrics = rowToMetrics(headers, rows[i]);
		if (metrics) map.set(metrics.strava_id, metrics);
	}
	return map;
}

function applyMetrics(run: RunRecord, m: StravaCsvMetrics): string[] {
	const changed: string[] = [];

	const setStr = (key: keyof RunRecord, value: string, force = false) => {
		if (!value) return;
		const cur = String(run[key] ?? '');
		if (force || !cur) {
			if (cur !== value) {
				(run as unknown as Record<string, unknown>)[key] = value;
				changed.push(String(key));
			}
		}
	};

	const setNum = (key: keyof RunRecord, value: number | null, force = false) => {
		if (value == null) return;
		const cur = run[key] as number | null;
		if (force || cur == null) {
			if (cur !== value) {
				(run as unknown as Record<string, unknown>)[key] = value;
				changed.push(String(key));
			}
		}
	};

	// Always refresh pace / HR from Strava when present
	setStr('avg_pace', m.avg_pace, true);
	setNum('avg_hr', m.avg_hr, true);
	setNum('max_hr', m.max_hr, true);

	setStr('time', m.time);
	setStr('elapsed_time', m.elapsed_time, true);
	setStr('start_time', m.start_time);
	setNum('distance_km', m.distance_km);
	setNum('elev_gain', m.elev_gain, true);
	setNum('calories', m.calories, true);
	setNum('kilojoules', m.kilojoules, true);
	setNum('max_speed', m.max_speed, true);
	setNum('cadence', m.cadence);
	// Prefer Strava/device weather over Open-Meteo when CSV has real values
	setStr('weather', m.weather, true);

	return [...new Set(changed)];
}

/**
 * Backfill run frontmatter from Strava activities.csv by matching `strava_id`.
 * Overwrites pace/HR/elev/calories when CSV has values; fills empty other fields.
 */
export function backfillRunsFromCsv(csvText: string): BackfillSummary {
	const byId = parseActivitiesCsvMetrics(csvText);
	const items: BackfillResultItem[] = [];

	for (const run of listRuns()) {
		const id = (run.strava_id || '').trim();
		if (!id) {
			items.push({ slug: run.slug, strava_id: '', status: 'skipped' });
			continue;
		}
		const metrics = byId.get(id);
		if (!metrics) {
			items.push({ slug: run.slug, strava_id: id, status: 'missing_csv' });
			continue;
		}
		const fields = applyMetrics(run, metrics);
		if (!fields.length) {
			items.push({ slug: run.slug, strava_id: id, status: 'skipped', fields: [] });
			continue;
		}
		writeRun(run);
		items.push({ slug: run.slug, strava_id: id, status: 'updated', fields });
	}

	return {
		items,
		updated: items.filter((i) => i.status === 'updated').length,
		skipped: items.filter((i) => i.status === 'skipped').length,
		missing: items.filter((i) => i.status === 'missing_csv').length
	};
}
