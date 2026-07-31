import { gunzipSync } from 'node:zlib';
import FitParser from 'fit-file-parser';
import {
	formatDuration,
	formatPace,
	formatClockTime,
	guessSession,
	dayFromIsoDate,
	roundKm,
	roundElev,
	mpsToKmh
} from '$lib/format';
import {
	computeRouteAnalytics,
	type RouteAnalytics,
	type TrackSample
} from '$lib/splits';

export interface FitTrackPoint {
	lat: number;
	lng: number;
}

export interface ParsedFitActivity {
	sport: string;
	isRun: boolean;
	startTime: Date | null;
	/** Local clock `HH:mm` when the activity started. */
	startClock: string;
	date: string;
	distanceKm: number | null;
	movingSeconds: number | null;
	time: string;
	elapsedTime: string;
	avgPace: string;
	avgHr: number | null;
	maxHr: number | null;
	elevGain: number | null;
	calories: number | null;
	maxSpeed: number | null;
	cadence: number | null;
	/** Session / record average temperature °C when the device recorded it. */
	avgTempC: number | null;
	/** Session max temperature °C when present. */
	maxTempC: number | null;
	/** Downsampled lat/lng for the map polyline. */
	points: FitTrackPoint[];
	/** Per-km splits / HR zones / km markers (from full GPS+time series). */
	analytics: RouteAnalytics | null;
}

const NON_RUN = [
	'walk',
	'hiking',
	'hike',
	'cycling',
	'cycling_indoor',
	'bike',
	'biking',
	'e_bike',
	'ebiking',
	'mountain_biking',
	'gravel_cycling',
	'virtual_ride',
	'swimming',
	'lap_swimming',
	'open_water_swimming',
	'workout',
	'training',
	'yoga',
	'elliptical',
	'rowing',
	'skiing',
	'snowboarding',
	'multi_sport',
	'transition'
];

export function isRunSport(sport: string): boolean {
	const t = String(sport || '')
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, '_');
	if (!t) return false;
	if (NON_RUN.some((x) => t === x || t.includes(x))) return false;
	if (t.includes('run') || t === 'trail_run' || t === 'treadmill') return true;
	return false;
}

function localIsoDate(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

function avg(nums: number[]): number | null {
	if (!nums.length) return null;
	return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function downsample<T>(items: T[], max: number): T[] {
	if (items.length <= max) return items;
	const out: T[] = [];
	const step = (items.length - 1) / (max - 1);
	for (let i = 0; i < max; i++) {
		out.push(items[Math.round(i * step)]);
	}
	return out;
}

export function decompressFit(buffer: Buffer, filename = ''): Buffer {
	const name = filename.toLowerCase();
	const looksGzip = name.endsWith('.gz') || (buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b);
	if (looksGzip) return gunzipSync(buffer);
	return buffer;
}

export async function parseFitBuffer(buffer: Buffer, filename = ''): Promise<ParsedFitActivity> {
	const raw = decompressFit(buffer, filename);
	const parser = new FitParser({
		force: true,
		speedUnit: 'km/h',
		lengthUnit: 'km',
		temperatureUnit: 'celsius',
		mode: 'list'
	});
	const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
	const data = await parser.parseAsync(ab);
	const session = (data.sessions?.[0] ?? {}) as Record<string, unknown>;
	const sport = String(
		session.sport || session.activity_type || data.sports?.[0]?.sport || ''
	);
	const records = Array.isArray(data.records) ? data.records : [];

	const startRaw = session.start_time || records[0]?.timestamp || data.activity?.timestamp;
	const startTime =
		startRaw instanceof Date
			? startRaw
			: startRaw
				? new Date(String(startRaw))
				: null;
	const date =
		startTime && !Number.isNaN(startTime.getTime()) ? localIsoDate(startTime) : '';

	let distanceKm: number | null = null;
	const dist = Number(session.total_distance);
	if (Number.isFinite(dist) && dist > 0) {
		// lengthUnit: 'km' → already km; if somehow meters (>100), convert
		distanceKm = dist > 100 ? roundKm(dist) : Math.round(dist * 100) / 100;
	}

	let movingSeconds: number | null = null;
	const timer = Number(session.total_timer_time ?? session.total_elapsed_time);
	if (Number.isFinite(timer) && timer > 0) movingSeconds = timer;

	let avgHr = Number(session.avg_heart_rate);
	if (!Number.isFinite(avgHr) || avgHr <= 0) {
		avgHr =
			avg(
				records
					.map((r) => Number(r.heart_rate))
					.filter((n) => Number.isFinite(n) && n > 0)
			) ?? NaN;
	}
	const avgHrOut = Number.isFinite(avgHr) && avgHr > 0 ? Math.round(avgHr) : null;

	let maxHr = Number(session.max_heart_rate);
	if (!Number.isFinite(maxHr) || maxHr <= 0) {
		const hrs = records
			.map((r) => Number(r.heart_rate))
			.filter((n) => Number.isFinite(n) && n > 0);
		maxHr = hrs.length ? Math.max(...hrs) : NaN;
	}
	const maxHrOut = Number.isFinite(maxHr) && maxHr > 0 ? Math.round(maxHr) : null;

	let elevGain: number | null = null;
	const ascent = Number(session.total_ascent ?? session.total_elevation_gain);
	if (Number.isFinite(ascent) && ascent > 0) {
		// lengthUnit km → ascent may be km; if small (<50) treat as km→m, else meters
		elevGain = ascent < 50 ? roundElev(ascent * 1000) : roundElev(ascent);
	}

	let calories: number | null = null;
	const cal = Number(session.total_calories);
	if (Number.isFinite(cal) && cal > 0) calories = Math.round(cal);

	let maxSpeed: number | null = null;
	const maxSp = Number(session.max_speed);
	if (Number.isFinite(maxSp) && maxSp > 0) {
		// fit-file-parser speedUnit km/h
		maxSpeed = maxSp > 60 ? mpsToKmh(maxSp) : Math.round(maxSp * 10) / 10;
	}

	const elapsedRaw = Number(session.total_elapsed_time);
	const elapsedTime =
		Number.isFinite(elapsedRaw) && elapsedRaw > 0 ? formatDuration(elapsedRaw) : '';

	let cadenceRaw = Number(session.avg_cadence ?? session.avg_running_cadence);
	if (!Number.isFinite(cadenceRaw) || cadenceRaw <= 0) {
		cadenceRaw =
			avg(
				records
					.map((r) => Number(r.cadence))
					.filter((n) => Number.isFinite(n) && n > 0)
			) ?? NaN;
	}
	let cadence: number | null = null;
	if (Number.isFinite(cadenceRaw) && cadenceRaw > 0) {
		// one-foot cadence typically ~80–95
		if (cadenceRaw < 120) cadenceRaw = cadenceRaw * 2;
		cadence = Math.round(cadenceRaw);
	}

	let avgTempC: number | null = null;
	const sessionAvgTemp = Number(session.avg_temperature);
	if (Number.isFinite(sessionAvgTemp)) {
		avgTempC = Math.round(sessionAvgTemp * 10) / 10;
	}
	let maxTempC: number | null = null;
	const sessionMaxTemp = Number(session.max_temperature);
	if (Number.isFinite(sessionMaxTemp)) {
		maxTempC = Math.round(sessionMaxTemp * 10) / 10;
	}
	if (avgTempC == null || maxTempC == null) {
		const recordTemps = records
			.map((r) => Number(r.temperature))
			.filter((n) => Number.isFinite(n));
		if (recordTemps.length) {
			if (avgTempC == null) {
				avgTempC =
					Math.round(
						(recordTemps.reduce((a, b) => a + b, 0) / recordTemps.length) * 10
					) / 10;
			}
			if (maxTempC == null) {
				maxTempC = Math.round(Math.max(...recordTemps) * 10) / 10;
			}
		}
	}

	const track: TrackSample[] = [];
	for (const r of records) {
		const lat = Number(r.position_lat);
		const lng = Number(r.position_long);
		if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
		if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
		if (lat === 0 && lng === 0) continue;

		const sample: TrackSample = { lat, lng };
		const ts: unknown = r.timestamp;
		if (ts instanceof Date && !Number.isNaN(ts.getTime())) {
			sample.timeMs = ts.getTime();
		} else if (ts != null && ts !== '') {
			const d = new Date(ts as string | number);
			if (!Number.isNaN(d.getTime())) sample.timeMs = d.getTime();
		}
		const hr = Number(r.heart_rate);
		if (Number.isFinite(hr) && hr > 0) sample.hr = Math.round(hr);
		const elev = Number(r.altitude ?? r.enhanced_altitude);
		if (Number.isFinite(elev)) {
			// lengthUnit km → altitude may be km; treat small values as km
			sample.elev = elev < 20 ? elev * 1000 : elev;
		}
		track.push(sample);
	}

	const analytics = computeRouteAnalytics(track, {
		avgHr: avgHrOut,
		maxHr: maxHrOut
	});

	const points: FitTrackPoint[] = downsample(
		track.map((p) => ({ lat: p.lat, lng: p.lng })),
		2500
	);

	const distanceMeters = distanceKm != null ? distanceKm * 1000 : 0;
	const time = movingSeconds != null ? formatDuration(movingSeconds) : '';
	const avgPace =
		distanceMeters && movingSeconds != null ? formatPace(distanceMeters, movingSeconds) : '';

	return {
		sport,
		isRun: isRunSport(sport),
		startTime,
		startClock: formatClockTime(startTime),
		date,
		distanceKm,
		movingSeconds,
		time,
		elapsedTime,
		avgPace,
		avgHr: avgHrOut,
		maxHr: maxHrOut,
		elevGain,
		calories,
		maxSpeed,
		cadence,
		avgTempC,
		maxTempC,
		points,
		analytics
	};
}

export function sessionGuessForFit(date: string, distanceKm: number | null): {
	day: string;
	session: string;
} {
	const day = dayFromIsoDate(date);
	return { day, session: guessSession(day, distanceKm) };
}
