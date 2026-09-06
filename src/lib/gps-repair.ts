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
	return normalizeTrackPoints(raw, MAX_WAYPOINTS);
}

export function normalizeTrackPoints(raw: unknown, max = MAX_STORE_POINTS): GpsPoint[] {
	if (!Array.isArray(raw)) return [];
	const out: GpsPoint[] = [];
	for (const w of raw) {
		if (!w || typeof w !== 'object') continue;
		const lat = Number((w as { lat?: unknown }).lat);
		const lng = Number((w as { lng?: unknown }).lng);
		if (!isValidCoord(lat, lng)) continue;
		const elev = Number((w as { elev?: unknown }).elev);
		out.push(Number.isFinite(elev) ? { lat, lng, elev } : { lat, lng });
		if (out.length >= max) break;
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

function closestOnSegment(
	lat: number,
	lng: number,
	a: GpsWaypoint,
	b: GpsWaypoint
): { lat: number; lng: number; distM: number } {
	const toRad = Math.PI / 180;
	const cos = Math.cos(((a.lat + b.lat) / 2) * toRad);
	const bx = (b.lng - a.lng) * cos;
	const by = b.lat - a.lat;
	const px = (lng - a.lng) * cos;
	const py = lat - a.lat;
	const len2 = bx * bx + by * by;
	const t = len2 < 1e-18 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len2));
	const q = { lat: a.lat + t * (b.lat - a.lat), lng: a.lng + t * (b.lng - a.lng) };
	return { ...q, distM: haversineMeters(lat, lng, q.lat, q.lng) };
}

function closestOnPolyline(
	lat: number,
	lng: number,
	line: GpsWaypoint[]
): { lat: number; lng: number; distM: number } | null {
	if (line.length < 2) return null;
	let best: { lat: number; lng: number; distM: number } | null = null;
	for (let i = 0; i < line.length - 1; i++) {
		const hit = closestOnSegment(lat, lng, line[i]!, line[i + 1]!);
		if (!best || hit.distM < best.distM) best = hit;
	}
	return best;
}

function nearestIndex(line: GpsWaypoint[], pin: GpsWaypoint): number {
	let best = 0;
	let bestD = Infinity;
	for (let i = 0; i < line.length; i++) {
		const d = haversineMeters(pin.lat, pin.lng, line[i]!.lat, line[i]!.lng);
		if (d < bestD) {
			bestD = d;
			best = i;
		}
	}
	return best;
}

function hopPath(a: GpsWaypoint, b: GpsWaypoint, preview?: GpsWaypoint[] | null): GpsWaypoint[] {
	if (!preview || preview.length < 2) return [a, b];
	let ia = nearestIndex(preview, a);
	let ib = nearestIndex(preview, b);
	if (ib < ia) [ia, ib] = [ib, ia];
	const slice = preview.slice(ia, ib + 1);
	return slice.length >= 2 ? slice : [a, b];
}

/** Insert a pin on the closest hop of the drawn/routed line. */
export function insertPinOnLine(
	pins: GpsWaypoint[],
	click: GpsWaypoint,
	preview?: GpsWaypoint[] | null,
	maxM = 150
): GpsWaypoint[] | null {
	if (pins.length < 2 || pins.length >= MAX_WAYPOINTS) return null;
	let best: { insertAt: number; point: GpsWaypoint; distM: number } | null = null;
	for (let i = 0; i < pins.length - 1; i++) {
		const path = hopPath(pins[i]!, pins[i + 1]!, preview);
		const hit = closestOnPolyline(click.lat, click.lng, path);
		if (!hit) continue;
		if (!best || hit.distM < best.distM) {
			best = { insertAt: i + 1, point: { lat: hit.lat, lng: hit.lng }, distM: hit.distM };
		}
	}
	if (!best || best.distM > maxM) return null;
	const nearPin = pins.some(
		(p) => haversineMeters(p.lat, p.lng, best.point.lat, best.point.lng) < 15
	);
	if (nearPin) return null;
	const next = pins.slice();
	next.splice(best.insertAt, 0, best.point);
	return next;
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
