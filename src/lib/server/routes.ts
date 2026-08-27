import type { RouteTrack } from '$lib/types';
import { getSql } from './db';

export type { RouteTrack };

/** Heatmap / list maps use this many points. Detail maps still load full GeoJSON. */
export const POLYLINE_MAX_POINTS = 180;

export function downsample(coords: [number, number][], maxPoints: number): [number, number][] {
	if (coords.length <= maxPoints) return coords;
	const out: [number, number][] = [];
	const last = coords.length - 1;
	const step = last / (maxPoints - 1);
	for (let i = 0; i < maxPoints - 1; i++) {
		out.push(coords[Math.round(i * step)]!);
	}
	out.push(coords[last]!);
	return out;
}

export function coordsFromGeoJson(raw: unknown): [number, number][] {
	if (typeof raw === 'string') {
		try {
			raw = JSON.parse(raw);
		} catch {
			return [];
		}
	}
	if (!raw || typeof raw !== 'object') return [];
	const geo = raw as {
		type?: string;
		geometry?: { type?: string; coordinates?: unknown };
		coordinates?: unknown;
	};

	const coordinates: unknown = geo.geometry?.coordinates ?? geo.coordinates;
	const geomType = geo.geometry?.type ?? geo.type;

	if (geomType === 'MultiLineString' && Array.isArray(coordinates)) {
		const flat: [number, number][] = [];
		for (const line of coordinates) {
			if (!Array.isArray(line)) continue;
			for (const c of line) {
				if (Array.isArray(c) && c.length >= 2) {
					const lng = Number(c[0]);
					const lat = Number(c[1]);
					if (Number.isFinite(lat) && Number.isFinite(lng)) flat.push([lat, lng]);
				}
			}
		}
		return flat;
	}

	if (!Array.isArray(coordinates)) return [];
	const out: [number, number][] = [];
	for (const c of coordinates) {
		if (Array.isArray(c) && c.length >= 2 && typeof c[0] === 'number') {
			const lng = Number(c[0]);
			const lat = Number(c[1]);
			if (Number.isFinite(lat) && Number.isFinite(lng)) out.push([lat, lng]);
		}
	}
	return out;
}

/** Downsampled lat/lng polyline from a GeoJSON Feature / geometry. */
export function polylineFromGeoJson(
	raw: unknown,
	maxPoints = POLYLINE_MAX_POINTS
): [number, number][] {
	return downsample(coordsFromGeoJson(raw), maxPoints);
}

export function polylineJson(coords: [number, number][]): string {
	return JSON.stringify(coords);
}

/** Stored heatmap polyline: `[[lat, lng], …]`. */
export function parsePolyline(raw: unknown): [number, number][] {
	let value = raw;
	if (typeof value === 'string') {
		try {
			value = JSON.parse(value);
		} catch {
			return [];
		}
	}
	if (!Array.isArray(value)) return [];
	const out: [number, number][] = [];
	for (const c of value) {
		if (!Array.isArray(c) || c.length < 2) continue;
		const lat = Number(c[0]);
		const lng = Number(c[1]);
		if (Number.isFinite(lat) && Number.isFinite(lng)) out.push([lat, lng]);
	}
	return out;
}

/** Read stored heatmap polylines (not full GeoJSON). */
export async function listRouteTracks(): Promise<RouteTrack[]> {
	const sql = getSql();
	const rows = (await sql`SELECT id, polyline FROM routes`) as {
		id: string;
		polyline: unknown;
	}[];

	const tracks: RouteTrack[] = [];
	for (const row of rows) {
		const coords = parsePolyline(row.polyline);
		if (coords.length >= 2) tracks.push({ id: String(row.id), coords });
	}
	return tracks;
}
