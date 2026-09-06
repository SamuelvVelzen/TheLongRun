import { trackFromGeoJson } from '$lib/combine-track';
import { haversineMeters, type TrackSample } from '$lib/splits';

export type GpsPoint = TrackSample;

export type GpsIssue = 'missing';

export type GpsHealth = {
	pointCount: number;
	timedCount: number;
	issues: GpsIssue[];
	summary: string;
};

export type GpsWaypoint = { lat: number; lng: number };

export type GpsContextTrack = {
	slug: string;
	label: string;
	coords: [number, number][];
};

export const MAX_WAYPOINTS = 80;
/** BRouter via lists get slow/fragile; densify the pins instead. */
export const MAX_NETWORK_VIAS = 12;

const FILL_STEP_M = 22;
const MAX_STORE_POINTS = 4000;

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

export function normalizeWaypoints(raw: unknown): GpsWaypoint[] {
	if (!Array.isArray(raw)) return [];
	const out: GpsWaypoint[] = [];
	for (const w of raw) {
		if (!w || typeof w !== 'object') continue;
		const lat = Number((w as { lat?: unknown }).lat);
		const lng = Number((w as { lng?: unknown }).lng);
		if (!isValidCoord(lat, lng)) continue;
		out.push({ lat, lng });
		if (out.length >= MAX_WAYPOINTS) break;
	}
	return out;
}

export function isValidCoord(lat: number, lng: number): boolean {
	return (
		Number.isFinite(lat) &&
		Number.isFinite(lng) &&
		Math.abs(lat) <= 90 &&
		Math.abs(lng) <= 180 &&
		!(lat === 0 && lng === 0)
	);
}

export function cleanPoints(samples: GpsPoint[]): GpsPoint[] {
	return samples.filter((p) => isValidCoord(p.lat, p.lng));
}

export function trackDistanceMeters(samples: GpsPoint[]): number {
	let d = 0;
	for (let i = 1; i < samples.length; i++) {
		const a = samples[i - 1]!;
		const b = samples[i]!;
		const seg = haversineMeters(a.lat, a.lng, b.lat, b.lng);
		if (Number.isFinite(seg) && seg > 0) d += seg;
	}
	return d;
}

/** Snap a tap onto a sibling track’s start or finish so parts can meet. */
export function snapToTrackEnds(
	lat: number,
	lng: number,
	tracks: GpsContextTrack[],
	maxM = 90
): GpsWaypoint | null {
	let best: { p: GpsWaypoint; d: number } | null = null;
	for (const t of tracks) {
		if (!t.coords.length) continue;
		const ends = [t.coords[0]!, t.coords[t.coords.length - 1]!];
		for (const [elat, elng] of ends) {
			const d = haversineMeters(lat, lng, elat, elng);
			if (!Number.isFinite(d) || d > maxM) continue;
			if (!best || d < best.d) best = { p: { lat: elat, lng: elng }, d };
		}
	}
	return best?.p ?? null;
}

export function diagnoseGps(samples: GpsPoint[]): GpsHealth {
	const pts = cleanPoints(samples);
	const timedCount = pts.filter((p) => p.timeMs != null && Number.isFinite(p.timeMs)).length;
	if (pts.length < 2) {
		return { pointCount: pts.length, timedCount, issues: ['missing'], summary: 'No GPS track' };
	}
	return { pointCount: pts.length, timedCount, issues: [], summary: 'Has GPS' };
}

function lerpPoint(a: GpsPoint, b: GpsPoint, t: number): GpsPoint {
	return {
		lat: lerp(a.lat, b.lat, t),
		lng: lerp(a.lng, b.lng, t),
		timeMs:
			a.timeMs != null && b.timeMs != null ? Math.round(lerp(a.timeMs, b.timeMs, t)) : undefined,
		elev: a.elev != null && b.elev != null ? lerp(a.elev, b.elev, t) : (b.elev ?? a.elev)
	};
}

function densifyPair(a: GpsPoint, b: GpsPoint): GpsPoint[] {
	const dist = haversineMeters(a.lat, a.lng, b.lat, b.lng);
	if (!Number.isFinite(dist) || dist < FILL_STEP_M * 1.4) return [a];
	const n = Math.max(1, Math.round(dist / FILL_STEP_M) - 1);
	const out: GpsPoint[] = [a];
	for (let i = 1; i <= n; i++) out.push(lerpPoint(a, b, i / (n + 1)));
	return out;
}

/** Straight line through pins, densified so the GPX has a continuous track. */
export function densifyWaypoints(waypoints: GpsWaypoint[]): GpsPoint[] {
	const pts = waypoints.filter((p) => isValidCoord(p.lat, p.lng)).map((p) => ({ lat: p.lat, lng: p.lng }));
	if (pts.length < 2) return pts;
	const out: GpsPoint[] = [];
	for (let i = 0; i < pts.length - 1; i++) {
		out.push(...densifyPair(pts[i]!, pts[i + 1]!));
	}
	out.push(pts[pts.length - 1]!);
	return downsample(out);
}

export function stampAlongDistance(
	samples: GpsPoint[],
	startMs: number,
	durationMs: number
): GpsPoint[] {
	if (samples.length < 2 || !(durationMs > 0)) return samples;
	const cum = [0];
	for (let i = 1; i < samples.length; i++) {
		cum[i] =
			cum[i - 1]! +
			haversineMeters(samples[i - 1]!.lat, samples[i - 1]!.lng, samples[i]!.lat, samples[i]!.lng);
	}
	const total = cum[cum.length - 1] || 1;
	return samples.map((p, i) => ({
		...p,
		timeMs: Math.round(startMs + (cum[i]! / total) * durationMs)
	}));
}

function downsample(samples: GpsPoint[], max = MAX_STORE_POINTS): GpsPoint[] {
	if (samples.length <= max) return samples;
	const out: GpsPoint[] = [];
	const step = (samples.length - 1) / (max - 1);
	for (let i = 0; i < max; i++) out.push(samples[Math.round(i * step)]!);
	return out;
}

/** Same reader as grouped export. */
export function samplesFromGeoJson(geo: unknown): GpsPoint[] {
	return trackFromGeoJson(geo).points;
}

export function attachHrSeries(
	samples: GpsPoint[],
	series: { t: number; hr: number }[]
): GpsPoint[] {
	if (!samples.length || !series.length) return samples;
	const pts = [...series].sort((a, b) => a.t - b.t);
	return samples.map((p) => {
		if (p.hr != null || p.timeMs == null) return p;
		const t = p.timeMs / 1000;
		let lo = 0;
		let hi = pts.length - 1;
		if (t <= pts[0]!.t) return { ...p, hr: pts[0]!.hr };
		if (t >= pts[hi]!.t) return { ...p, hr: pts[hi]!.hr };
		while (hi - lo > 1) {
			const mid = (lo + hi) >> 1;
			if (pts[mid]!.t <= t) lo = mid;
			else hi = mid;
		}
		const a = pts[lo]!;
		const b = pts[hi]!;
		const span = b.t - a.t;
		const f = span > 0 ? (t - a.t) / span : 0;
		return { ...p, hr: Math.round(lerp(a.hr, b.hr, f)) };
	});
}
