import { showsField } from '$lib/activity';
import { haversineMeters } from '$lib/splits';
import type { RunRecord } from '$lib/types';
import { getRouteGeoJson, routeIdForRun, trackSamplesFromGeoJson } from './route-analytics';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const TIMEOUT_MS = 25000;
const USER_AGENT = 'the-long-run/1.0 (personal training tracker)';
const SAMPLE_STEP_M = 80;
const MAX_SAMPLES = 100;
const MATCH_MAX_M = 35;

type SurfaceBucket = 'asphalt' | 'gravel' | 'trail' | 'cobblestone';

type LatLng = { lat: number; lng: number };

type OsmWay = {
	id: number;
	tags: Record<string, string>;
	pts: LatLng[];
	minLat: number;
	maxLat: number;
	minLng: number;
	maxLng: number;
};

function sampleTrackEveryMeters(points: LatLng[], stepM: number, maxSamples: number): LatLng[] {
	if (points.length < 2) return points.slice(0, maxSamples);
	const out: LatLng[] = [points[0]!];
	let sinceLast = 0;
	for (let i = 1; i < points.length && out.length < maxSamples; i++) {
		const a = points[i - 1]!;
		const b = points[i]!;
		const seg = haversineMeters(a.lat, a.lng, b.lat, b.lng);
		if (!Number.isFinite(seg) || seg <= 0) continue;
		sinceLast += seg;
		if (sinceLast >= stepM) {
			out.push(b);
			sinceLast = 0;
		}
	}
	const last = points[points.length - 1]!;
	if (out[out.length - 1] !== last && out.length < maxSamples) out.push(last);
	return out;
}

function pointToSegmentDistanceM(p: LatLng, a: LatLng, b: LatLng): number {
	const seg = haversineMeters(a.lat, a.lng, b.lat, b.lng);
	if (!Number.isFinite(seg) || seg < 0.5) return haversineMeters(p.lat, p.lng, a.lat, a.lng);
	let lo = 0;
	let hi = 1;
	for (let i = 0; i < 12; i++) {
		const t1 = lo + (hi - lo) / 3;
		const t2 = hi - (hi - lo) / 3;
		const p1 = {
			lat: a.lat + (b.lat - a.lat) * t1,
			lng: a.lng + (b.lng - a.lng) * t1
		};
		const p2 = {
			lat: a.lat + (b.lat - a.lat) * t2,
			lng: a.lng + (b.lng - a.lng) * t2
		};
		if (haversineMeters(p.lat, p.lng, p1.lat, p1.lng) < haversineMeters(p.lat, p.lng, p2.lat, p2.lng)) {
			hi = t2;
		} else {
			lo = t1;
		}
	}
	const t = (lo + hi) / 2;
	const closest = {
		lat: a.lat + (b.lat - a.lat) * t,
		lng: a.lng + (b.lng - a.lng) * t
	};
	return haversineMeters(p.lat, p.lng, closest.lat, closest.lng);
}

function bucketFromTags(tags: Record<string, string>): SurfaceBucket | null {
	const surface = (tags.surface ?? tags['surface:note'] ?? '').toLowerCase();
	if (surface) {
		if (/asphalt|paved|concrete|paving_stones|metal|tartan|rubber/.test(surface)) return 'asphalt';
		if (/cobblestone|sett|unhewn_cobblestone|paving_stones/.test(surface) && !/asphalt/.test(surface)) {
			return 'cobblestone';
		}
		if (/gravel|fine_gravel|compacted|pebblestone|shell/.test(surface)) return 'gravel';
		if (/unpaved|dirt|ground|grass|mud|sand|woodchips|earth|soil|rock/.test(surface)) return 'trail';
		if (surface === 'wood') return 'trail';
	}
	const highway = (tags.highway ?? '').toLowerCase();
	if (!highway) return null;
	if (/^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|road)$/.test(highway)) {
		return 'asphalt';
	}
	if (highway === 'cycleway' || highway === 'pedestrian') return 'asphalt';
	if (highway === 'track') {
		const tt = (tags.tracktype ?? '').toLowerCase();
		if (tt === 'grade1') return 'asphalt';
		if (tt === 'grade2') return 'gravel';
		return 'trail';
	}
	if (/^(path|footway|bridleway|steps|corridor|hiking)$/.test(highway)) return 'trail';
	return null;
}

function wayNearPoint(way: OsmWay, p: LatLng, padDeg: number): boolean {
	return (
		p.lat >= way.minLat - padDeg &&
		p.lat <= way.maxLat + padDeg &&
		p.lng >= way.minLng - padDeg &&
		p.lng <= way.maxLng + padDeg
	);
}

function nearestBucket(point: LatLng, ways: OsmWay[]): SurfaceBucket | null {
	const padDeg = 0.0004;
	let bestM = MATCH_MAX_M;
	let best: SurfaceBucket | null = null;
	for (const way of ways) {
		if (!wayNearPoint(way, point, padDeg)) continue;
		const bucket = bucketFromTags(way.tags);
		if (!bucket) continue;
		for (let i = 1; i < way.pts.length; i++) {
			const d = pointToSegmentDistanceM(point, way.pts[i - 1]!, way.pts[i]!);
			if (d < bestM) {
				bestM = d;
				best = bucket;
			}
		}
	}
	return best;
}

function summaryFromWeights(weights: Record<SurfaceBucket, number>): string {
	const entries = (Object.entries(weights) as [SurfaceBucket, number][]).filter(([, w]) => w > 0);
	if (!entries.length) return '';
	const total = entries.reduce((s, [, w]) => s + w, 0);
	if (total <= 0) return '';
	entries.sort((a, b) => b[1] - a[1]);
	const [top, topW] = entries[0]!;
	if (topW / total >= 0.72) return top;
	if (entries.length === 1) return top;
	return 'mixed';
}

function parseOverpassWays(raw: unknown): OsmWay[] {
	const elements = (raw as { elements?: unknown })?.elements;
	if (!Array.isArray(elements)) return [];
	const out: OsmWay[] = [];
	for (const el of elements) {
		if (!el || typeof el !== 'object') continue;
		const e = el as {
			type?: string;
			id?: number;
			tags?: Record<string, string>;
			geometry?: { lat?: number; lon?: number }[];
		};
		if (e.type !== 'way' || !e.tags?.highway || !Array.isArray(e.geometry) || e.geometry.length < 2) {
			continue;
		}
		const pts: LatLng[] = [];
		let minLat = Infinity;
		let maxLat = -Infinity;
		let minLng = Infinity;
		let maxLng = -Infinity;
		for (const n of e.geometry) {
			const lat = Number(n.lat);
			const lng = Number(n.lon);
			if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
			pts.push({ lat, lng });
			minLat = Math.min(minLat, lat);
			maxLat = Math.max(maxLat, lat);
			minLng = Math.min(minLng, lng);
			maxLng = Math.max(maxLng, lng);
		}
		if (pts.length < 2) continue;
		out.push({
			id: Number(e.id) || 0,
			tags: e.tags,
			pts,
			minLat,
			maxLat,
			minLng,
			maxLng
		});
	}
	return out;
}

async function fetchHighwaysInBbox(south: number, west: number, north: number, east: number): Promise<OsmWay[]> {
	const query = `[out:json][timeout:25];
(
  way["highway"](${south},${west},${north},${east});
);
out geom;`;
	const ac = new AbortController();
	const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
	try {
		const res = await fetch(OVERPASS_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'User-Agent': USER_AGENT
			},
			body: `data=${encodeURIComponent(query)}`,
			signal: ac.signal
		});
		if (!res.ok) return [];
		const data = await res.json();
		return parseOverpassWays(data);
	} catch {
		return [];
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Infer a short surface label (asphalt / gravel / trail / cobblestone / mixed) by matching GPS
 * samples to OpenStreetMap highways and their `surface` tags (Overpass, best-effort).
 */
export async function inferSurfaceFromTrack(points: LatLng[]): Promise<string> {
	const clean = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
	if (clean.length < 2) return '';
	const samples = sampleTrackEveryMeters(clean, SAMPLE_STEP_M, MAX_SAMPLES);
	if (samples.length < 2) return '';

	let south = Infinity;
	let north = -Infinity;
	let west = Infinity;
	let east = -Infinity;
	for (const p of samples) {
		south = Math.min(south, p.lat);
		north = Math.max(north, p.lat);
		west = Math.min(west, p.lng);
		east = Math.max(east, p.lng);
	}
	const pad = 0.00035;
	south -= pad;
	north += pad;
	west -= pad;
	east += pad;

	const ways = await fetchHighwaysInBbox(south, west, north, east);
	if (!ways.length) return '';

	const weights: Record<SurfaceBucket, number> = {
		asphalt: 0,
		gravel: 0,
		trail: 0,
		cobblestone: 0
	};
	for (const sample of samples) {
		const bucket = nearestBucket(sample, ways);
		if (bucket) weights[bucket] += 1;
	}
	return summaryFromWeights(weights);
}

/** Load the stored route track and infer surface when the activity type supports it. */
export async function inferSurfaceForRun(
	run: Pick<RunRecord, 'route' | 'strava_id' | 'activity_type'>
): Promise<string> {
	if (!showsField(run.activity_type, 'surface')) return '';
	const id = routeIdForRun(run);
	if (!id) return '';
	const geo = await getRouteGeoJson(id);
	if (!geo) return '';
	const samples = trackSamplesFromGeoJson(geo);
	const points =
		samples.length >= 2
			? samples.map((s) => ({ lat: s.lat, lng: s.lng }))
			: coordsFromGeoJson(geo);
	return inferSurfaceFromTrack(points);
}

function coordsFromGeoJson(geo: unknown): LatLng[] {
	const g = geo as { geometry?: { coordinates?: unknown } };
	const coords = g.geometry?.coordinates;
	if (!Array.isArray(coords)) return [];
	const out: LatLng[] = [];
	for (const c of coords) {
		if (!Array.isArray(c) || c.length < 2) continue;
		const lng = Number(c[0]);
		const lat = Number(c[1]);
		if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
		out.push({ lat, lng });
	}
	return out;
}
