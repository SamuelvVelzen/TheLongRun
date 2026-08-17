import {
	computeRouteAnalytics,
	haversineMeters,
	type RouteAnalytics,
	type TrackSample
} from '$lib/splits';
import { formatDuration, formatPace } from '$lib/format';
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
	points: { lat: number; lng: number }[];
	analytics: RouteAnalytics | null;
	/** Sport hint from the GPX `<type>` element, if any. */
	detectedType: string;
	/** Start coordinate (for reverse-geocoding the location), or null if none. */
	startLat: number | null;
	startLng: number | null;
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

	const blocks =
		xml.match(/<trkpt\b[^>]*>[\s\S]*?<\/trkpt>|<trkpt\b[^>]*\/>/gi) ?? [];

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
	const firstTime = blocks.map((b) => child(b, 'time')).find(Boolean) ?? child(xml, 'time');
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

	// Aggregate distance / moving time / elevation from the track.
	let distanceMeters = 0;
	let movingSeconds = 0;
	let elevGain = 0;
	const hrs: number[] = [];
	// (time, cumulative distance) samples for a smoothed max-speed pass.
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

	// Max speed over a rolling ~5s window — single-point GPS jitter no longer spikes it.
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

	const distanceKm = distanceMeters > 0 ? Math.round((distanceMeters / 1000) * 100) / 100 : null;
	const moving = movingSeconds > 0 ? Math.round(movingSeconds) : null;
	const avgHr = hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null;
	const maxHr = hrs.length ? Math.max(...hrs) : null;

	const analytics =
		track.length >= 2 ? computeRouteAnalytics(track, { avgHr, maxHr }) : null;

	return {
		date,
		startClock,
		distanceKm,
		movingSeconds: moving,
		time: moving != null ? formatDuration(moving) : '',
		elapsedTime: elapsedSeconds != null ? formatDuration(elapsedSeconds) : '',
		avgPace: distanceMeters && moving ? formatPace(distanceMeters, moving) : '',
		avgHr,
		maxHr,
		elevGain: elevGain > 0 ? Math.round(elevGain * 10) / 10 : null,
		maxSpeed: maxSpeedKmh > 0 ? Math.round(maxSpeedKmh * 10) / 10 : null,
		// A treadmill/indoor run is a single static point repeated — no real route. Skip the track
		// so no bogus one-point map gets stored.
		points:
			distanceMeters > 50
				? downsample(
						track.map((p) => ({ lat: p.lat, lng: p.lng })),
						2500
					)
				: [],
		analytics,
		detectedType,
		startLat: firstPoint?.lat ?? null,
		startLng: firstPoint?.lng ?? null
	};
}
