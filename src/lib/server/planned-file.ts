/**
 * Parse a BRouter (or similar) planned-route export.
 * GPX is the primary format; GeoJSON is also accepted.
 *
 * Geometry comes from the track (`trkpt` / LineString), never from waypoints.
 * Waypoints are optional named via points (`wpt` / Point features).
 */
import { haversineMeters, type KmMarker } from '$lib/splits';
import type { PlannedWaypoint } from '$lib/types';

export type ParsedPlannedRoute = {
	name: string;
	distanceKm: number | null;
	elevGain: number | null;
	elevLoss: number | null;
	elevMin: number | null;
	elevMax: number | null;
	points: { lat: number; lng: number; elev?: number }[];
	waypoints: PlannedWaypoint[];
	kmMarkers: KmMarker[];
	startLat: number | null;
	startLng: number | null;
	estTime: string;
};

const MAX_SEG_M = 5000;
const MAX_POINTS = 2500;

function attr(tag: string, name: string): number | null {
	const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]+)"`, 'i'));
	if (!m) return null;
	const n = Number(m[1]);
	return Number.isFinite(n) ? n : null;
}

function child(block: string, name: string): string | null {
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

function decodeXml(s: string): string {
	return s
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'");
}

function round1(n: number): number {
	return Math.round(n * 10) / 10;
}

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}

/** BRouter writes `<!-- track-length = 3958 filtered ascend = 8 … time=11m 9s -->`. */
function parseBrouterComment(xml: string): {
	lengthM: number | null;
	ascend: number | null;
	estTime: string;
} {
	const comment = xml.match(/<!--([\s\S]*?)-->/);
	if (!comment) return { lengthM: null, ascend: null, estTime: '' };
	const body = comment[1]!;
	const len = body.match(/track-length\s*=\s*([\d.]+)/i);
	const asc = body.match(/filtered\s+ascend\s*=\s*([\d.]+)/i);
	const time = body.match(/\btime\s*=\s*((?:\d+\s*h\s*)?(?:\d+\s*m\s*)?(?:\d+\s*s)?)/i);
	return {
		lengthM: len ? Number(len[1]) : null,
		ascend: asc ? Number(asc[1]) : null,
		estTime: time ? formatBrouterTime(time[1]!.trim()) : ''
	};
}

function formatBrouterTime(raw: string): string {
	if (!raw) return '';
	const h = Number(raw.match(/(\d+)\s*h/i)?.[1] ?? 0);
	const m = Number(raw.match(/(\d+)\s*m/i)?.[1] ?? 0);
	const s = Number(raw.match(/(\d+)\s*s/i)?.[1] ?? 0);
	if (!h && !m && !s) return '';
	if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	return `${m}:${String(s).padStart(2, '0')}`;
}

function statsFromPoints(points: { lat: number; lng: number; elev?: number }[]): {
	distanceKm: number | null;
	elevGain: number | null;
	elevLoss: number | null;
	elevMin: number | null;
	elevMax: number | null;
	kmMarkers: KmMarker[];
} {
	let distanceMeters = 0;
	let elevGain = 0;
	let elevLoss = 0;
	const elevs = points
		.map((p) => p.elev)
		.filter((n): n is number => n != null && Number.isFinite(n));
	const kmMarkers: KmMarker[] = [];
	let nextKm = 1000;

	for (let i = 1; i < points.length; i++) {
		const a = points[i - 1]!;
		const b = points[i]!;
		const seg = haversineMeters(a.lat, a.lng, b.lat, b.lng);
		if (!Number.isFinite(seg) || seg <= 0 || seg > MAX_SEG_M) continue;
		const startCum = distanceMeters;
		const endCum = distanceMeters + seg;
		while (nextKm <= endCum) {
			const t = seg > 0 ? (nextKm - startCum) / seg : 0;
			kmMarkers.push({
				km: nextKm / 1000,
				lat: a.lat + (b.lat - a.lat) * t,
				lng: a.lng + (b.lng - a.lng) * t
			});
			nextKm += 1000;
		}
		distanceMeters = endCum;
		if (a.elev != null && b.elev != null) {
			const d = b.elev - a.elev;
			if (d > 0 && d < 50) elevGain += d;
			else if (d < 0 && d > -50) elevLoss += -d;
		}
	}

	return {
		distanceKm: distanceMeters > 0 ? round2(distanceMeters / 1000) : null,
		elevGain: elevGain > 0 ? round1(elevGain) : null,
		elevLoss: elevLoss > 0 ? round1(elevLoss) : null,
		elevMin: elevs.length ? round1(Math.min(...elevs)) : null,
		elevMax: elevs.length ? round1(Math.max(...elevs)) : null,
		kmMarkers
	};
}

function gpxName(xml: string, fallback: string): string {
	const meta = xml.match(/<metadata\b[\s\S]*?<\/metadata>/i)?.[0];
	const fromMeta = meta ? child(meta, 'name') : null;
	if (fromMeta) return decodeXml(fromMeta);
	const trk = xml.match(/<trk\b[\s\S]*?<\/trk>/i)?.[0];
	const fromTrk = trk ? child(trk, 'name') : null;
	if (fromTrk) return decodeXml(fromTrk);
	return fallback;
}

function parseGpxPoints(
	xml: string,
	tag: 'trkpt' | 'rtept'
): { lat: number; lng: number; elev?: number }[] {
	const blocks =
		xml.match(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>|<${tag}\\b[^>]*/>`, 'gi')) ?? [];
	const points: { lat: number; lng: number; elev?: number }[] = [];
	for (const block of blocks) {
		const openTag = block.match(new RegExp(`<${tag}\\b[^>]*?(?:/?>)`, 'i'))?.[0] ?? block;
		const lat = attr(openTag, 'lat');
		const lon = attr(openTag, 'lon');
		if (lat == null || lon == null) continue;
		if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) continue;
		const pt: { lat: number; lng: number; elev?: number } = { lat, lng: lon };
		const ele = child(block, 'ele');
		if (ele != null) {
			const n = Number(ele);
			if (Number.isFinite(n)) pt.elev = n;
		}
		points.push(pt);
	}
	return points;
}

function parseNamedGpxPoints(xml: string, tag: 'wpt' | 'rtept'): PlannedWaypoint[] {
	const blocks =
		xml.match(
			new RegExp(
				`<(?:\\w+:)?${tag}\\b[^>]*>[\\s\\S]*?</(?:\\w+:)?${tag}>|<(?:\\w+:)?${tag}\\b[^>]*/>`,
				'gi'
			)
		) ?? [];
	const out: PlannedWaypoint[] = [];
	for (const block of blocks) {
		const openTag = block.match(new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*?(?:/?>)`, 'i'))?.[0] ?? block;
		const lat = attr(openTag, 'lat');
		const lon = attr(openTag, 'lon');
		if (lat == null || lon == null) continue;
		if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
		const name = child(block, 'name');
		out.push({ name: name ? decodeXml(name) : `Waypoint ${out.length + 1}`, lat, lng: lon });
	}
	return out;
}

function parseGpxWaypoints(xml: string, trackPointCount: number): PlannedWaypoint[] {
	const named = parseNamedGpxPoints(xml, 'wpt');
	if (named.length) return named;
	// BRouter (and similar) often put via points in <rtept> and the dense line in <trkpt>.
	const via = parseNamedGpxPoints(xml, 'rtept');
	const cap = Math.min(40, Math.max(3, Math.floor(trackPointCount * 0.15)));
	if (via.length > 0 && via.length <= cap && via.length < trackPointCount) return via;
	return [];
}

function parsePlannedGpx(xml: string, filename: string): ParsedPlannedRoute {
	let points = parseGpxPoints(xml, 'trkpt');
	if (points.length < 2) points = parseGpxPoints(xml, 'rtept');
	if (points.length < 2) {
		throw new Error(
			'No route track found in that GPX — export the track from BRouter, not just waypoints.'
		);
	}
	points = downsample(points, MAX_POINTS);
	const waypoints = parseGpxWaypoints(xml, points.length);
	const stats = statsFromPoints(points);
	const brouter = parseBrouterComment(xml);
	if (stats.distanceKm == null && brouter.lengthM != null && brouter.lengthM > 0) {
		stats.distanceKm = round2(brouter.lengthM / 1000);
	}
	if (brouter.ascend != null && brouter.ascend > 0) {
		stats.elevGain = round1(brouter.ascend);
	}
	const fallback = filename.replace(/\.[^.]+$/, '').trim() || 'Planned route';
	return {
		name: gpxName(xml, fallback),
		...stats,
		points,
		waypoints,
		startLat: points[0]?.lat ?? null,
		startLng: points[0]?.lng ?? null,
		estTime: brouter.estTime
	};
}

function asNum(v: unknown): number | null {
	const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN;
	return Number.isFinite(n) ? n : null;
}

function coordPoint(c: unknown): { lat: number; lng: number; elev?: number } | null {
	if (!Array.isArray(c) || c.length < 2) return null;
	const lng = Number(c[0]);
	const lat = Number(c[1]);
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
	if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
	const pt: { lat: number; lng: number; elev?: number } = { lat, lng };
	if (c.length >= 3) {
		const ele = Number(c[2]);
		if (Number.isFinite(ele)) pt.elev = ele;
	}
	return pt;
}

function flattenLine(coords: unknown): { lat: number; lng: number; elev?: number }[] {
	if (!Array.isArray(coords)) return [];
	const out: { lat: number; lng: number; elev?: number }[] = [];
	for (const c of coords) {
		if (Array.isArray(c) && Array.isArray(c[0])) {
			out.push(...flattenLine(c));
		} else {
			const pt = coordPoint(c);
			if (pt) out.push(pt);
		}
	}
	return out;
}

function parsePlannedGeoJson(text: string, filename: string): ParsedPlannedRoute {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		throw new Error('That GeoJSON file is not valid JSON.');
	}
	const features: Record<string, unknown>[] = [];
	if (raw && typeof raw === 'object') {
		const obj = raw as {
			type?: string;
			features?: unknown;
			geometry?: unknown;
			properties?: unknown;
		};
		if (obj.type === 'FeatureCollection' && Array.isArray(obj.features)) {
			for (const f of obj.features) {
				if (f && typeof f === 'object') features.push(f as Record<string, unknown>);
			}
		} else if (obj.type === 'Feature' || obj.geometry) {
			features.push(obj as Record<string, unknown>);
		} else if (obj.type === 'LineString' || obj.type === 'MultiLineString') {
			features.push({ type: 'Feature', geometry: obj, properties: {} });
		}
	}

	const points: { lat: number; lng: number; elev?: number }[] = [];
	const waypoints: PlannedWaypoint[] = [];
	let name = '';
	let brouterLenM: number | null = null;
	let brouterAscend: number | null = null;
	let brouterTime = '';

	for (const f of features) {
		const geom = (f.geometry ?? f) as { type?: string; coordinates?: unknown };
		const props = (f.properties && typeof f.properties === 'object' ? f.properties : {}) as Record<
			string,
			unknown
		>;
		const gType = geom.type ?? '';
		if (gType === 'LineString' || gType === 'MultiLineString') {
			points.push(...flattenLine(geom.coordinates));
			if (!name && typeof props.name === 'string') name = props.name.trim();
			brouterLenM = brouterLenM ?? asNum(props['track-length'] ?? props.trackLength);
			brouterAscend = brouterAscend ?? asNum(props['filtered-ascend'] ?? props.filteredAscend);
			if (!brouterTime && typeof props['total-time'] === 'number') {
				const sec = Math.round(props['total-time'] as number);
				if (sec > 0) {
					const h = Math.floor(sec / 3600);
					const m = Math.floor((sec % 3600) / 60);
					const s = sec % 60;
					brouterTime = h
						? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
						: `${m}:${String(s).padStart(2, '0')}`;
				}
			}
		} else if (gType === 'Point') {
			const pt = coordPoint(geom.coordinates);
			if (pt) {
				waypoints.push({
					name:
						typeof props.name === 'string' && props.name.trim()
							? props.name.trim()
							: `Waypoint ${waypoints.length + 1}`,
					lat: pt.lat,
					lng: pt.lng
				});
			}
		}
	}

	if (points.length < 2) {
		throw new Error('No LineString track found in that GeoJSON.');
	}

	const slim = downsample(points, MAX_POINTS);
	const stats = statsFromPoints(slim);
	if (stats.distanceKm == null && brouterLenM != null && brouterLenM > 0) {
		stats.distanceKm = round2(brouterLenM / 1000);
	}
	if (brouterAscend != null && brouterAscend > 0) {
		stats.elevGain = round1(brouterAscend);
	}

	const fallback = filename.replace(/\.[^.]+$/, '').trim() || 'Planned route';
	return {
		name: name || fallback,
		...stats,
		points: slim,
		waypoints,
		startLat: slim[0]?.lat ?? null,
		startLng: slim[0]?.lng ?? null,
		estTime: brouterTime
	};
}

/** Parse a BRouter GPX or GeoJSON export into a planned route. */
export function parsePlannedFile(text: string, filename: string): ParsedPlannedRoute {
	const trimmed = text.trim();
	if (!trimmed) throw new Error('That file is empty.');
	const lower = filename.toLowerCase();
	if (lower.endsWith('.csv') || lower.endsWith('.kml')) {
		throw new Error('Use GPX (preferred) or GeoJSON — CSV and KML are not supported.');
	}
	if (
		trimmed.startsWith('{') ||
		trimmed.startsWith('[') ||
		lower.endsWith('.json') ||
		lower.endsWith('.geojson')
	) {
		return parsePlannedGeoJson(trimmed, filename);
	}
	return parsePlannedGpx(trimmed, filename);
}
