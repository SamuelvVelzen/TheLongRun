import type { PlannedRoute, PlannedWaypoint, RouteTrack, SessionRouteRef } from '$lib/types';
import type { KmMarker } from '$lib/splits';
import { WEEKDAYS } from '$lib/week-mix';
import { getSql } from './db';
import { parsePolyline, polylineFromGeoJson, polylineJson } from './routes';
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
		waypoints: parseWaypoints(row.waypoints),
		plan_link_count: toNum(row.plan_link_count) ?? 0,
		activity_link_count: toNum(row.activity_link_count) ?? 0
	};
}

let ensured = false;
let ensuring: Promise<void> | null = null;

function isAlreadyExists(error: unknown): boolean {
	const msg = error instanceof Error ? error.message : String(error);
	return /already exists|duplicate key value/i.test(msg);
}

async function ensureTable(): Promise<void> {
	if (ensured) return;
	if (!ensuring) {
		ensuring = (async () => {
			const sql = getSql();
			const ignoreDup = async (fn: () => Promise<unknown>) => {
				try {
					await fn();
				} catch (error) {
					if (!isAlreadyExists(error)) throw error;
				}
			};
			await ignoreDup(
				() => sql`
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
						geojson jsonb NOT NULL,
						polyline jsonb
					)
				`
			);
			await ignoreDup(
				() => sql`ALTER TABLE planned_routes ADD COLUMN IF NOT EXISTS est_time text NOT NULL DEFAULT ''`
			);
			await ignoreDup(() => sql`ALTER TABLE planned_routes ADD COLUMN IF NOT EXISTS polyline jsonb`);
			const missing = (await sql`
				SELECT slug, geojson FROM planned_routes WHERE polyline IS NULL
			`) as { slug: string; geojson: unknown }[];
			for (const row of missing) {
				const json = polylineJson(polylineFromGeoJson(row.geojson));
				await sql`UPDATE planned_routes SET polyline = ${json}::jsonb WHERE slug = ${row.slug}`;
			}
			await ignoreDup(
				() => sql`
					CREATE TABLE IF NOT EXISTS planned_route_links (
						id serial PRIMARY KEY,
						route_slug text NOT NULL REFERENCES planned_routes(slug) ON DELETE CASCADE,
						kind text NOT NULL,
						activity_slug text REFERENCES runs(slug) ON DELETE CASCADE,
						plan_week integer,
						plan_day text,
						created_on text NOT NULL
					)
				`
			);
			await ignoreDup(
				() => sql`
					CREATE UNIQUE INDEX IF NOT EXISTS planned_route_links_plan_uniq
					ON planned_route_links (plan_week, plan_day)
					WHERE kind = 'plan'
				`
			);
			await ignoreDup(
				() => sql`
					CREATE UNIQUE INDEX IF NOT EXISTS planned_route_links_activity_uniq
					ON planned_route_links (activity_slug)
					WHERE kind = 'activity'
				`
			);
			ensured = true;
		})();
	}
	await ensuring;
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
		SELECT r.slug, r.name, r.notes, r.distance_km, r.elev_gain, r.elev_loss, r.elev_min, r.elev_max,
			r.point_count, r.est_time, r.saved_on, r.country, r.province, r.place, r.waypoints,
			COALESCE(p.plan_link_count, 0) AS plan_link_count,
			COALESCE(a.activity_link_count, 0) AS activity_link_count
		FROM planned_routes r
		LEFT JOIN (
			SELECT route_slug, COUNT(*)::int AS plan_link_count
			FROM planned_route_links WHERE kind = 'plan' GROUP BY route_slug
		) p ON p.route_slug = r.slug
		LEFT JOIN (
			SELECT route_slug, COUNT(*)::int AS activity_link_count
			FROM planned_route_links WHERE kind = 'activity' GROUP BY route_slug
		) a ON a.route_slug = r.slug
		ORDER BY r.saved_on DESC, r.name ASC
	`) as Record<string, unknown>[];
	return rows.map(rowToRoute);
}

export async function listPlannedRouteTracks(): Promise<RouteTrack[]> {
	await ensureTable();
	const sql = getSql();
	const rows = (await sql`SELECT slug, polyline FROM planned_routes`) as {
		slug: string;
		polyline: unknown;
	}[];
	const tracks: RouteTrack[] = [];
	for (const row of rows) {
		const coords = parsePolyline(row.polyline);
		if (coords.length >= 2) tracks.push({ id: row.slug, coords });
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
			point_count, est_time, saved_on, country, province, place, waypoints, geojson, polyline
		) VALUES (
			${slug}, ${parsed.name}, ${input.notes?.trim() ?? ''}, ${parsed.distanceKm},
			${parsed.elevGain}, ${parsed.elevLoss}, ${parsed.elevMin}, ${parsed.elevMax},
			${parsed.points.length}, ${parsed.estTime}, ${saved_on}, ${geo.country}, ${geo.province}, ${geo.place},
			${JSON.stringify(parsed.waypoints)}::jsonb, ${JSON.stringify(geojson)}::jsonb,
			${polylineJson(polylineFromGeoJson(geojson))}::jsonb
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

export type RouteLinkRow = {
	id: number;
	route_slug: string;
	kind: 'plan' | 'activity';
	activity_slug: string | null;
	plan_week: number | null;
	plan_day: string | null;
};

export type PlanRouteRef = SessionRouteRef & { week: number; day: string };

function canonicalDay(day: string): string {
	const found = WEEKDAYS.find((d) => d.toLowerCase() === day.trim().toLowerCase());
	if (!found) throw new Error('Unknown weekday.');
	return found;
}

function rowToLink(row: Record<string, unknown>): RouteLinkRow {
	const kind = toStr(row.kind) === 'activity' ? 'activity' : 'plan';
	return {
		id: toNum(row.id) ?? 0,
		route_slug: toStr(row.route_slug),
		kind,
		activity_slug: toStr(row.activity_slug) || null,
		plan_week: toNum(row.plan_week),
		plan_day: toStr(row.plan_day) || null
	};
}

export async function listRouteLinks(routeSlug?: string): Promise<RouteLinkRow[]> {
	await ensureTable();
	const sql = getSql();
	const rows = (
		routeSlug
			? await sql`
				SELECT id, route_slug, kind, activity_slug, plan_week, plan_day
				FROM planned_route_links
				WHERE route_slug = ${routeSlug}
				ORDER BY kind, plan_week, plan_day, activity_slug
			`
			: await sql`
				SELECT id, route_slug, kind, activity_slug, plan_week, plan_day
				FROM planned_route_links
				ORDER BY kind, plan_week, plan_day, activity_slug
			`
	) as Record<string, unknown>[];
	return rows.map(rowToLink);
}

export async function listPlanRouteRefs(): Promise<PlanRouteRef[]> {
	await ensureTable();
	const sql = getSql();
	const rows = (await sql`
		SELECT l.plan_week, l.plan_day, r.slug, r.name, r.distance_km
		FROM planned_route_links l
		JOIN planned_routes r ON r.slug = l.route_slug
		WHERE l.kind = 'plan'
	`) as Record<string, unknown>[];
	return rows
		.map((row) => ({
			week: toNum(row.plan_week) ?? 0,
			day: toStr(row.plan_day),
			slug: toStr(row.slug),
			name: toStr(row.name),
			distance_km: toNum(row.distance_km)
		}))
		.filter((r) => r.week > 0 && r.day);
}

export async function getActivityRouteRef(activitySlug: string): Promise<SessionRouteRef | null> {
	await ensureTable();
	if (!activitySlug) return null;
	const sql = getSql();
	const rows = (await sql`
		SELECT r.slug, r.name, r.distance_km
		FROM planned_route_links l
		JOIN planned_routes r ON r.slug = l.route_slug
		WHERE l.kind = 'activity' AND l.activity_slug = ${activitySlug}
		LIMIT 1
	`) as Record<string, unknown>[];
	if (!rows.length) return null;
	const row = rows[0]!;
	return { slug: toStr(row.slug), name: toStr(row.name), distance_km: toNum(row.distance_km) };
}

export async function attachRouteToPlan(
	routeSlug: string,
	week: number,
	day: string
): Promise<RouteLinkRow> {
	await ensureTable();
	const route = await getPlannedRoute(routeSlug);
	if (!route) throw new Error('Route not found.');
	const planDay = canonicalDay(day);
	const sql = getSql();
	await sql`
		DELETE FROM planned_route_links
		WHERE kind = 'plan' AND plan_week = ${week} AND plan_day = ${planDay}
	`;
	const rows = (await sql`
		INSERT INTO planned_route_links (route_slug, kind, activity_slug, plan_week, plan_day, created_on)
		VALUES (${routeSlug}, 'plan', NULL, ${week}, ${planDay}, ${isoDateLocal()})
		RETURNING id, route_slug, kind, activity_slug, plan_week, plan_day
	`) as Record<string, unknown>[];
	return rowToLink(rows[0]!);
}

export async function attachRouteToActivity(
	routeSlug: string,
	activitySlug: string
): Promise<RouteLinkRow> {
	await ensureTable();
	const route = await getPlannedRoute(routeSlug);
	if (!route) throw new Error('Route not found.');
	const sql = getSql();
	await sql`
		DELETE FROM planned_route_links
		WHERE kind = 'activity' AND activity_slug = ${activitySlug}
	`;
	const rows = (await sql`
		INSERT INTO planned_route_links (route_slug, kind, activity_slug, plan_week, plan_day, created_on)
		VALUES (${routeSlug}, 'activity', ${activitySlug}, NULL, NULL, ${isoDateLocal()})
		RETURNING id, route_slug, kind, activity_slug, plan_week, plan_day
	`) as Record<string, unknown>[];
	return rowToLink(rows[0]!);
}

export async function detachRouteLink(id: number, routeSlug: string): Promise<boolean> {
	await ensureTable();
	if (!Number.isFinite(id) || id < 1) return false;
	const sql = getSql();
	const rows = (await sql`
		DELETE FROM planned_route_links
		WHERE id = ${id} AND route_slug = ${routeSlug}
		RETURNING id
	`) as unknown[];
	return rows.length > 0;
}
