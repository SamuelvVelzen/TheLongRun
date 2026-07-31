import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { RouteTrack } from '$lib/types';
import { ensureDataDirs, routesDir } from './paths';

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

	let coordinates: unknown = geo.geometry?.coordinates ?? geo.coordinates;
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

/** Read every GeoJSON under data/routes/ once; return downsampled lat/lng tracks. */
export function listRouteTracks(): RouteTrack[] {
	ensureDataDirs();
	if (!existsSync(routesDir)) return [];

	const tracks: RouteTrack[] = [];
	for (const file of readdirSync(routesDir)) {
		if (!file.endsWith('.json')) continue;
		try {
			const raw = JSON.parse(readFileSync(path.join(routesDir, file), 'utf8'));
			const coords = downsample(coordsFromGeoJson(raw), MAX_POINTS);
			if (coords.length >= 2) {
				tracks.push({ id: file.replace(/\.json$/, ''), coords });
			}
		} catch {
			// skip corrupt / non-geojson files
		}
	}
	return tracks;
}
