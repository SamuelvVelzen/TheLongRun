import type { PlannedRoute, PlannedWaypoint, RouteTrack } from '$lib/types';
import type { KmMarker } from '$lib/splits';
import { getSql } from './db';
import { polylineFromGeoJson } from './routes';
import { parsePlannedFile } from './planned-file';
import { reverseGeocode } from './geo';
import { analyticsToProperties } from '$lib/splits';

export type PlannedRouteDetail = PlannedRoute & {
	geojson: {
		type?: string;
		properties?: { km_markers?: KmMarker[] };
		geometry?: { type?: string; coordinates?: number[][] };
	};
	kmMarkers: KmMarker[];
};

function toNum(value: unknown): number | null {
	if (value === null || value === undefined || value === '') return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

function toStr(value: unknown): string {
	return value === null || value === undefined ? '' : String(value);
}

function parseWaypoints(raw: unknown): PlannedWaypoint[] {
	if (!Array.isArray(raw)) return [];
	const out: PlannedWaypoint[] = [];
	for (const w of raw) {
		if (!w || typeof w !== 'object') continue;
		const o = w as Record<string, unknown>;
		const lat = Number(o.lat);
		const lng = Number(o.lng);
		if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
		out.push({ name: toStr(o.name) || `Waypoint ${out.length + 1}`, lat, lng });
	}
	return out;
}

function rowToRoute(row: Record<string, unknown>): PlannedRoute {
	return {
		slug: toStr(row.slug),
		name: toStr(row.name),
		notes: toStr(row.notes),
		distance_km: toNum(row.distance_km),
		elev_gain: toNum(row.elev_gain),
		elev_loss: toNum(row.elev_loss),
		elev_min: toNum(row.elev_min),
		elev_max: toNum(row.elev_max),
		point_count: toNum(row.point_count) ?? 0,
		est_time: toStr(row.est_time),
		saved_on: toStr(row.saved_on),
		country: toStr(row.country),
		province: toStr(row.province),
		place: toStr(row.place),
		waypoints: parseWaypoints(row.waypoints)
	};
}

let ensured = false;

async function ensureTable(): Promise<void> {
	if (ensured) return;
	const sql = getSql();
	await sql`
		CREATE TABLE IF NOT EXISTS planned_routes (
			slug text PRIMARY KEY,
			name text NOT NULL,
			notes text NOT NULL DEFAULT '',
			distance_km double precision,
			elev_gain double precision,
			elev_loss double precision,
			elev_min double precision,
			elev_max double precision,
			point_count integer NOT NULL DEFAULT 0,
			est_time text NOT NULL DEFAULT '',
			saved_on text NOT NULL,
			country text NOT NULL DEFAULT '',
			province text NOT NULL DEFAULT '',
			place text NOT NULL DEFAULT '',
			waypoints jsonb NOT NULL DEFAULT '[]'::jsonb,
			geojson jsonb NOT NULL
		)
	`;
	await sql`ALTER TABLE planned_routes ADD COLUMN IF NOT EXISTS est_time text NOT NULL DEFAULT ''`;
	ensured = true;
}

function slugify(name: string): string {
	const s = name
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60);
	return s || 'route';
}

function isoDateLocal(d = new Date()): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

async function slugTaken(slug: string): Promise<boolean> {
	const sql = getSql();
	const rows = (await sql`SELECT 1 FROM planned_routes WHERE slug = ${slug} LIMIT 1`) as unknown[];
	return rows.length > 0;
}

async function nextFreeSlug(base: string): Promise<string> {
	if (!(await slugTaken(base))) return base;
	for (let i = 2; i < 50; i++) {
		const candidate = `${base}-${i}`;
		if (!(await slugTaken(candidate))) return candidate;
	}
	return `${base}-${Date.now()}`;
}

export async function listPlannedRoutes(): Promise<PlannedRoute[]> {
	await ensureTable();
	const sql = getSql();
	const rows = (await sql`
		SELECT slug, name, notes, distance_km, elev_gain, elev_loss, elev_min, elev_max,
			point_count, est_time, saved_on, country, province, place, waypoints
		FROM planned_routes
		ORDER BY saved_on DESC, name ASC
	`) as Record<string, unknown>[];
	return rows.map(rowToRoute);
}

export async function listPlannedRouteTracks(): Promise<RouteTrack[]> {
	await ensureTable();
	const sql = getSql();
	const rows = (await sql`SELECT slug, geojson FROM planned_routes`) as {
		slug: string;
		geojson: unknown;
	}[];
	const tracks: RouteTrack[] = [];
	for (const row of rows) {
		try {
			const coords = polylineFromGeoJson(row.geojson, 180);
			if (coords.length >= 2) tracks.push({ id: row.slug, coords });
		} catch {
			// skip corrupt rows
		}
	}
	return tracks;
}

export async function getPlannedRoute(slug: string): Promise<PlannedRouteDetail | null> {
	await ensureTable();
	if (!slug || slug.includes('..') || slug.includes('/') || slug.includes('\\')) return null;
	const sql = getSql();
	const rows = (await sql`SELECT * FROM planned_routes WHERE slug = ${slug} LIMIT 1`) as Record<
		string,
		unknown
	>[];
	if (!rows.length) return null;
	const row = rows[0]!;
	const route = rowToRoute(row);
	const geojson = (row.geojson ?? {}) as PlannedRouteDetail['geojson'];
	const props =
		geojson && typeof geojson === 'object'
			? ((geojson as { properties?: { km_markers?: KmMarker[] } }).properties ?? null)
			: null;
	const kmMarkers = Array.isArray(props?.km_markers) ? props.km_markers : [];
	return { ...route, geojson, kmMarkers };
}

export async function savePlannedFromFile(input: {
	text: string;
	filename: string;
	notes?: string;
}): Promise<PlannedRoute> {
	await ensureTable();
	const parsed = parsePlannedFile(input.text, input.filename);
	const slug = await nextFreeSlug(slugify(parsed.name));
	const geo =
		parsed.startLat != null && parsed.startLng != null
			? await reverseGeocode(parsed.startLat, parsed.startLng)
			: { country: '', province: '', place: '' };

	const geojson = {
		type: 'Feature',
		properties: {
			name: parsed.name,
			kind: 'planned',
			distance_km: parsed.distanceKm,
			point_count: parsed.points.length,
			waypoints: parsed.waypoints,
			...analyticsToProperties({
				splits: [],
				hrZones: null,
				kmMarkers: parsed.kmMarkers
			})
		},
		geometry: {
			type: 'LineString',
			coordinates: parsed.points.map((p) =>
				p.elev != null ? [p.lng, p.lat, p.elev] : [p.lng, p.lat]
			)
		}
	};

	const sql = getSql();
	const saved_on = isoDateLocal();
	const rows = (await sql`
		INSERT INTO planned_routes (
			slug, name, notes, distance_km, elev_gain, elev_loss, elev_min, elev_max,
			point_count, est_time, saved_on, country, province, place, waypoints, geojson
		) VALUES (
			${slug}, ${parsed.name}, ${input.notes?.trim() ?? ''}, ${parsed.distanceKm},
			${parsed.elevGain}, ${parsed.elevLoss}, ${parsed.elevMin}, ${parsed.elevMax},
			${parsed.points.length}, ${parsed.estTime}, ${saved_on}, ${geo.country}, ${geo.province}, ${geo.place},
			${JSON.stringify(parsed.waypoints)}::jsonb, ${JSON.stringify(geojson)}::jsonb
		)
		RETURNING slug, name, notes, distance_km, elev_gain, elev_loss, elev_min, elev_max,
			point_count, est_time, saved_on, country, province, place, waypoints
	`) as Record<string, unknown>[];
	return rowToRoute(rows[0]!);
}

export async function updatePlannedRoute(
	slug: string,
	fields: { name?: string; notes?: string }
): Promise<PlannedRoute | null> {
	await ensureTable();
	const current = await getPlannedRoute(slug);
	if (!current) return null;
	const name = fields.name != null ? fields.name.trim() : current.name;
	const notes = fields.notes != null ? fields.notes : current.notes;
	if (!name) throw new Error('Name is required.');
	const sql = getSql();
	const rows = (await sql`
		UPDATE planned_routes SET name = ${name}, notes = ${notes}
		WHERE slug = ${slug}
		RETURNING slug, name, notes, distance_km, elev_gain, elev_loss, elev_min, elev_max,
			point_count, est_time, saved_on, country, province, place, waypoints
	`) as Record<string, unknown>[];
	return rows.length ? rowToRoute(rows[0]!) : null;
}

export async function deletePlannedRoute(slug: string): Promise<boolean> {
	await ensureTable();
	if (!slug || slug.includes('..') || slug.includes('/') || slug.includes('\\')) return false;
	const sql = getSql();
	const rows =
		(await sql`DELETE FROM planned_routes WHERE slug = ${slug} RETURNING slug`) as unknown[];
	return rows.length > 0;
}
