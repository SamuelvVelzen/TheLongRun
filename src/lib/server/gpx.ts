import { computeBestEffortsFromTrack, type BestEffort } from '$lib/best-efforts';
import { formatDuration, formatPace } from '$lib/format';
import {
    computeRouteAnalytics,
    haversineMeters,
    type RouteAnalytics,
    type TrackSample
} from '$lib/splits';
import { timezoneForCoord } from './geo';

export interface ParsedGpx {
	/** YYYY-MM-DD taken from the first track time (as written in the file). */
	date: string;
	/** HH:mm from the first track time. */
	startClock: string;
	distanceKm: number | null;
	movingSeconds: number | null;
	time: string;
	elapsedTime: string;
	avgPace: string;
	avgHr: number | null;
	maxHr: number | null;
	elevGain: number | null;
	maxSpeed: number | null;
	points: { lat: number; lng: number; timeMs?: number; elev?: number }[];
	analytics: RouteAnalytics | null;
	/** Sport hint from the GPX `<type>` element, if any. */
	detectedType: string;
	/** Start coordinate (for reverse-geocoding the location), or null if none. */
	startLat: number | null;
	startLng: number | null;
	bestEfforts: BestEffort[];
}

const MAX_MOVING_GAP_S = 45;

function attr(tag: string, name: string): number | null {
	const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]+)"`, 'i'));
	if (!m) return null;
	const n = Number(m[1]);
	return Number.isFinite(n) ? n : null;
}

function child(block: string, name: string): string | null {
	// namespace-tolerant: matches <ele>, <gpxtpx:hr>, <ns3:hr>, etc.
	const m = block.match(new RegExp(`<(?:\\w+:)?${name}[^>]*>([^<]+)</(?:\\w+:)?${name}>`, 'i'));
	return m ? m[1]!.trim() : null;
}

function downsample<T>(items: T[], max: number): T[] {
	if (items.length <= max) return items;
	const out: T[] = [];
	const step = (items.length - 1) / (max - 1);
	for (let i = 0; i < max; i++) out.push(items[Math.round(i * step)]!);
	return out;
}

export function parseGpx(xml: string): ParsedGpx {
	const detectedType = child(xml, 'type') ?? '';

	const blocks = xml.match(/<trkpt\b[^>]*>[\s\S]*?<\/trkpt>|<trkpt\b[^>]*\/>/gi) ?? [];

	const track: TrackSample[] = [];
	for (const block of blocks) {
		const openTag = block.match(/<trkpt\b[^>]*?(?:\/?>)/i)?.[0] ?? block;
		const lat = attr(openTag, 'lat');
		const lon = attr(openTag, 'lon');
		if (lat == null || lon == null) continue;
		if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) continue;

		const sample: TrackSample = { lat, lng: lon };
		const timeStr = child(block, 'time');
		if (timeStr) {
			const ms = Date.parse(timeStr);
			if (!Number.isNaN(ms)) sample.timeMs = ms;
		}
		const hr = child(block, 'hr');
		if (hr != null) {
			const n = Number(hr);
			if (Number.isFinite(n) && n > 0) sample.hr = Math.round(n);
		}
		const ele = child(block, 'ele');
		if (ele != null) {
			const n = Number(ele);
			if (Number.isFinite(n)) sample.elev = n;
		}
		track.push(sample);
	}

	// Date / start clock from the first time. GPX times are UTC (…Z); convert to the activity's
	// LOCAL zone — resolved from its start coordinate — so a run in NL or Vietnam both read right.
	const firstPoint = track.find((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
	const TZ = (firstPoint && timezoneForCoord(firstPoint.lat, firstPoint.lng)) || 'Europe/Amsterdam';
	let date = '';
	let startClock = '';
	const firstTime = blocks.map((b) => child(b, 'time')).find(Boolean);
	if (firstTime) {
		const ms = Date.parse(firstTime);
		if (!Number.isNaN(ms)) {
			const d = new Date(ms);
			date = new Intl.DateTimeFormat('en-CA', {
				timeZone: TZ,
				year: 'numeric',
				month: '2-digit',
				day: '2-digit'
			}).format(d);
			startClock = new Intl.DateTimeFormat('en-GB', {
				timeZone: TZ,
				hour: '2-digit',
				minute: '2-digit',
				hour12: false
			}).format(d);
		}
	}

	const rollup = rollupTrack(track);
	return finishParsed(track, {
		date,
		startClock,
		detectedType,
		firstPoint,
		headlineDistanceMeters: rollup.distanceMeters
	}, rollup);
}

type TrackRollup = {
	distanceMeters: number;
	movingSeconds: number;
	elevGain: number;
	avgHr: number | null;
	maxHr: number | null;
	maxSpeedKmh: number;
	elapsedSeconds: number | null;
};

function rollupTrack(track: TrackSample[]): TrackRollup {
	let distanceMeters = 0;
	let movingSeconds = 0;
	let elevGain = 0;
	const hrs: number[] = [];
	const series: { t: number; d: number }[] = [];

	for (let i = 0; i < track.length; i++) {
		const p = track[i]!;
		if (p.hr != null) hrs.push(p.hr);
		if (i > 0) {
			const a = track[i - 1]!;
			const seg = haversineMeters(a.lat, a.lng, p.lat, p.lng);
			if (Number.isFinite(seg) && seg > 0 && seg <= 200) {
				distanceMeters += seg;
				if (a.timeMs != null && p.timeMs != null) {
					const dt = (p.timeMs - a.timeMs) / 1000;
					if (dt > 0 && dt <= MAX_MOVING_GAP_S) movingSeconds += dt;
				}
			}
			if (a.elev != null && p.elev != null) {
				const d = p.elev - a.elev;
				if (d > 0 && d < 50) elevGain += d;
			}
		}
		if (p.timeMs != null) series.push({ t: p.timeMs, d: distanceMeters });
	}

	let maxSpeedKmh = 0;
	const WIN_MS = 5000;
	for (let i = 0, j = 0; i < series.length; i++) {
		while (j < i && series[i]!.t - series[j]!.t > WIN_MS) j++;
		const dt = (series[i]!.t - series[j]!.t) / 1000;
		if (dt >= 2) {
			const kmh = ((series[i]!.d - series[j]!.d) / dt) * 3.6;
			if (Number.isFinite(kmh) && kmh > maxSpeedKmh && kmh < 120) maxSpeedKmh = kmh;
		}
	}

	const first = track.find((p) => p.timeMs != null)?.timeMs ?? null;
	const last = [...track].reverse().find((p) => p.timeMs != null)?.timeMs ?? null;
	const elapsedSeconds = first != null && last != null ? Math.max(0, (last - first) / 1000) : null;

	return {
		distanceMeters,
		movingSeconds,
		elevGain,
		avgHr: hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null,
		maxHr: hrs.length ? Math.max(...hrs) : null,
		maxSpeedKmh,
		elapsedSeconds
	};
}

function finishParsed(
	track: TrackSample[],
	meta: {
		date: string;
		startClock: string;
		detectedType: string;
		firstPoint: TrackSample | undefined;
		/** Watch / lap total when importing TCX; otherwise GPS rollup distance. */
		headlineDistanceMeters: number;
	},
	rollup: TrackRollup
): ParsedGpx {
	const gpsMeters = rollup.distanceMeters;
	const headlineMeters = meta.headlineDistanceMeters > 0 ? meta.headlineDistanceMeters : gpsMeters;
	const moving = rollup.movingSeconds > 0 ? Math.round(rollup.movingSeconds) : null;
	const distanceKm = headlineMeters > 0 ? Math.round((headlineMeters / 1000) * 100) / 100 : null;
	const { avgHr, maxHr } = rollup;

	const analytics = track.length >= 2 ? computeRouteAnalytics(track, { avgHr, maxHr }) : null;
	const bestEfforts = computeBestEffortsFromTrack(track);

	return {
		date: meta.date,
		startClock: meta.startClock,
		distanceKm,
		movingSeconds: moving,
		time: moving != null ? formatDuration(moving) : '',
		elapsedTime:
			rollup.elapsedSeconds != null ? formatDuration(rollup.elapsedSeconds) : '',
		avgPace: headlineMeters && moving ? formatPace(headlineMeters, moving) : '',
		avgHr,
		maxHr,
		elevGain: rollup.elevGain > 0 ? Math.round(rollup.elevGain * 10) / 10 : null,
		maxSpeed: rollup.maxSpeedKmh > 0 ? Math.round(rollup.maxSpeedKmh * 10) / 10 : null,
		points:
			gpsMeters > 50
				? downsample(
						track.map((p) => ({ lat: p.lat, lng: p.lng, timeMs: p.timeMs, elev: p.elev })),
						2500
					)
				: [],
		analytics,
		detectedType: meta.detectedType,
		startLat: meta.firstPoint?.lat ?? null,
		startLng: meta.firstPoint?.lng ?? null,
		bestEfforts
	};
}

/** Lap / device odometer totals from Garmin TCX (first DistanceMeters per Lap is the lap summary). */
function tcxDeviceDistanceMeters(xml: string): number {
	let fromLaps = 0;
	const lapRe = /<Lap\b[^>]*>([\s\S]*?)<\/Lap>/gi;
	let lapMatch: RegExpExecArray | null;
	while ((lapMatch = lapRe.exec(xml))) {
		const block = lapMatch[1]!;
		const m = block.match(/<DistanceMeters>([0-9.]+)<\/DistanceMeters>/);
		if (m) {
			const n = Number(m[1]);
			if (Number.isFinite(n) && n > 0) fromLaps += n;
		}
	}
	if (fromLaps > 0) return fromLaps;

	let max = 0;
	const tpRe = /<Trackpoint\b[^>]*>[\s\S]*?<\/Trackpoint>/gi;
	let tpMatch: RegExpExecArray | null;
	while ((tpMatch = tpRe.exec(xml))) {
		const m = tpMatch[0].match(/<DistanceMeters>([0-9.]+)<\/DistanceMeters>/);
		if (m) {
			const n = Number(m[1]);
			if (Number.isFinite(n) && n > max) max = n;
		}
	}
	return max;
}

function dateAndClockFromTrack(
	track: TrackSample[],
	firstTimeIso: string | null | undefined
): { date: string; startClock: string; TZ: string } {
	const firstPoint = track.find((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
	const TZ = (firstPoint && timezoneForCoord(firstPoint.lat, firstPoint.lng)) || 'Europe/Amsterdam';
	let date = '';
	let startClock = '';
	if (firstTimeIso) {
		const ms = Date.parse(firstTimeIso);
		if (!Number.isNaN(ms)) {
			const d = new Date(ms);
			date = new Intl.DateTimeFormat('en-CA', {
				timeZone: TZ,
				year: 'numeric',
				month: '2-digit',
				day: '2-digit'
			}).format(d);
			startClock = new Intl.DateTimeFormat('en-GB', {
				timeZone: TZ,
				hour: '2-digit',
				minute: '2-digit',
				hour12: false
			}).format(d);
		}
	}
	return { date, startClock, TZ };
}

export function parseTcx(xml: string): ParsedGpx {
	const sportMatch = xml.match(/<Activity\b[^>]*\bSport="([^"]+)"/i);
	const detectedType = sportMatch?.[1] ?? '';

	const blocks = xml.match(/<Trackpoint\b[^>]*>[\s\S]*?<\/Trackpoint>/gi) ?? [];
	const track: TrackSample[] = [];
	for (const block of blocks) {
		const latStr = child(block, 'LatitudeDegrees');
		const lngStr = child(block, 'LongitudeDegrees');
		if (!latStr || !lngStr) continue;
		const lat = Number(latStr);
		const lng = Number(lngStr);
		if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
		if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) continue;

		const sample: TrackSample = { lat, lng };
		const timeStr = child(block, 'Time');
		if (timeStr) {
			const ms = Date.parse(timeStr);
			if (!Number.isNaN(ms)) sample.timeMs = ms;
		}
		const hrBlock = block.match(/<HeartRateBpm\b[^>]*>[\s\S]*?<\/HeartRateBpm>/i);
		const hrRaw = hrBlock ? child(hrBlock[0], 'Value') : null;
		if (hrRaw != null) {
			const n = Number(hrRaw);
			if (Number.isFinite(n) && n > 0) sample.hr = Math.round(n);
		}
		const alt = child(block, 'AltitudeMeters');
		if (alt != null) {
			const n = Number(alt);
			if (Number.isFinite(n)) sample.elev = n;
		}
		track.push(sample);
	}

	const firstPoint = track.find((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
	const activityId = xml.match(/<Id>([^<]+)<\/Id>/i)?.[1]?.trim();
	const firstTime = child(blocks[0] ?? '', 'Time') ?? activityId ?? null;
	const { date, startClock } = dateAndClockFromTrack(track, firstTime);

	const rollup = rollupTrack(track);
	const deviceMeters = tcxDeviceDistanceMeters(xml);
	const headlineDistanceMeters = deviceMeters > 0 ? deviceMeters : rollup.distanceMeters;

	return finishParsed(
		track,
		{
			date,
			startClock,
			detectedType,
			firstPoint,
			headlineDistanceMeters
		},
		rollup
	);
}

/** GPX or Garmin TCX — TCX uses watch lap distance when present. */
export function parseActivityFile(xml: string): ParsedGpx {
	const t = xml.trim();
	if (
		/<TrainingCenterDatabase\b/i.test(t) ||
		(/<Activity\b/i.test(t) && /<Trackpoint\b/i.test(t))
	) {
		return parseTcx(t);
	}
	return parseGpx(t);
}
