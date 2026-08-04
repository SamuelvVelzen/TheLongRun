import type { RouteTrack } from '$lib/types';
import { getSql } from './db';

export type { RouteTrack };

const MAX_POINTS = 180;

function downsample(coords: [number, number][], maxPoints: number): [number, number][] {
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

function coordsFromGeoJson(raw: unknown): [number, number][] {
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

/** Read every stored GeoJSON track; return downsampled lat/lng polylines. */
export async function listRouteTracks(): Promise<RouteTrack[]> {
	const sql = getSql();
	const rows = (await sql`SELECT id, geojson FROM routes`) as {
		id: string;
		geojson: unknown;
	}[];

	const tracks: RouteTrack[] = [];
	for (const row of rows) {
		try {
			const coords = downsample(coordsFromGeoJson(row.geojson), MAX_POINTS);
			if (coords.length >= 2) {
				tracks.push({ id: String(row.id), coords });
			}
		} catch {
			// skip corrupt / non-geojson rows
		}
	}
	return tracks;
}
