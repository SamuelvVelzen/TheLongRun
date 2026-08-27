/**
 * One-shot Neon → D1 dump. Reads DATABASE_URL from .env (your machine only).
 * Computes heatmap polylines here so production never pulls full GeoJSON from Neon.
 *
 *   npm run d1:dump              # local Miniflare D1 (for vite dev)
 *   npm run d1:dump -- --remote  # Cloudflare D1 (for deploy)
 */
import { homedir } from 'node:os';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';
import { getPlatformProxy } from 'wrangler';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const remote = process.argv.includes('--remote');

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL is not set. Add the Neon pooled string to .env.');
	process.exit(1);
}

function loadWrangler() {
	const raw = readFileSync(path.join(root, 'wrangler.jsonc'), 'utf8').replace(/\/\/.*$/gm, '');
	return JSON.parse(raw);
}

const wranglerConfig = loadWrangler();
const accountId = wranglerConfig.account_id;
const d1 = wranglerConfig.d1_databases?.[0];
if (!accountId || !d1?.database_id) {
	console.error('wrangler.jsonc is missing account_id or d1_databases[0].database_id.');
	process.exit(1);
}

const POLYLINE_MAX_POINTS = 180;

function downsampleCoords(coords, maxPoints = POLYLINE_MAX_POINTS) {
	if (coords.length <= maxPoints) return coords;
	const out = [];
	const last = coords.length - 1;
	const step = last / (maxPoints - 1);
	for (let i = 0; i < maxPoints - 1; i++) out.push(coords[Math.round(i * step)]);
	out.push(coords[last]);
	return out;
}

function coordsFromGeoJson(raw) {
	if (typeof raw === 'string') {
		try {
			raw = JSON.parse(raw);
		} catch {
			return [];
		}
	}
	if (!raw || typeof raw !== 'object') return [];
	const coordinates = raw.geometry?.coordinates ?? raw.coordinates;
	const geomType = raw.geometry?.type ?? raw.type;
	if (geomType === 'MultiLineString' && Array.isArray(coordinates)) {
		const flat = [];
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
	const out = [];
	for (const c of coordinates) {
		if (Array.isArray(c) && c.length >= 2) {
			const lng = Number(c[0]);
			const lat = Number(c[1]);
			if (Number.isFinite(lat) && Number.isFinite(lng)) out.push([lat, lng]);
		}
	}
	return out;
}

function polylineFromGeoJson(raw) {
	return downsampleCoords(coordsFromGeoJson(raw));
}

function jsonText(value) {
	if (value == null) return null;
	if (typeof value === 'string') return value;
	return JSON.stringify(value);
}

function polylineText(geojson, stored) {
	if (stored != null && stored !== '') {
		const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
		if (Array.isArray(parsed) && parsed.length >= 2) return JSON.stringify(parsed);
	}
	return JSON.stringify(polylineFromGeoJson(geojson));
}

function str(value) {
	return value == null ? '' : String(value);
}

function num(value) {
	if (value == null || value === '') return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

function intBool(value) {
	if (value === true || value === 1 || value === 't' || value === 'true' || value === '1') return 1;
	if (value === false || value === 0 || value === 'f' || value === 'false' || value === '0') return 0;
	return null;
}

function oauthToken() {
	const fromEnv = process.env.CLOUDFLARE_API_TOKEN;
	if (fromEnv) return fromEnv;
	const candidates = [
		path.join(homedir(), 'Library/Preferences/.wrangler/config/default.toml'),
		path.join(homedir(), '.wrangler/config/default.toml'),
		path.join(homedir(), '.config/.wrangler/config/default.toml')
	];
	for (const file of candidates) {
		if (!existsSync(file)) continue;
		const txt = readFileSync(file, 'utf8');
		const m = txt.match(/oauth_token\s*=\s*"([^"]+)"/);
		if (m) return m[1];
	}
	throw new Error('No Cloudflare token. Run npx wrangler login, or set CLOUDFLARE_API_TOKEN.');
}

async function remoteExec(sql, params) {
	const res = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${d1.database_id}/query`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${oauthToken()}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ sql, params })
		}
	);
	const body = await res.json();
	if (!res.ok || !body.success) {
		const detail = JSON.stringify(body.errors ?? body, null, 2);
		throw new Error(`D1 API ${res.status}: ${detail}`);
	}
	return body;
}

function bind(value) {
	if (value === undefined || value === null) return null;
	if (typeof value === 'boolean') return value ? 1 : 0;
	if (typeof value === 'number') return Number.isFinite(value) ? value : null;
	if (typeof value === 'string') return value;
	throw new Error(`Unsupported bind: ${typeof value}`);
}

async function main() {
	const neonSql = neon(url);
	console.log(`Dumping Neon → D1 (${remote ? 'remote' : 'local'})…`);

	const [runs, routes, context, planned, links] = await Promise.all([
		neonSql`SELECT * FROM runs`,
		neonSql`SELECT * FROM routes`,
		neonSql`SELECT * FROM context`,
		neonSql`SELECT * FROM planned_routes`.catch(() => []),
		neonSql`SELECT * FROM planned_route_links`.catch(() => [])
	]);
	console.log(
		`  neon: runs ${runs.length}, routes ${routes.length}, context ${context.length}, planned ${planned.length}, links ${links.length}`
	);

	let localProxy = null;
	let localDb = null;
	if (!remote) {
		localProxy = await getPlatformProxy({ persist: true });
		localDb = localProxy.env.DB;
		if (!localDb) throw new Error('getPlatformProxy did not provide env.DB.');
	}

	const exec = async (sql, params = []) => {
		const bound = params.map(bind);
		if (remote) {
			await remoteExec(sql, bound);
			return;
		}
		const stmt = bound.length ? localDb.prepare(sql).bind(...bound) : localDb.prepare(sql);
		await stmt.run();
	};

	for (const r of runs) {
		await exec(
			`INSERT INTO runs (
				slug, date, week, day, activity_type, session, effort, shins, legs, energy, weather, surface,
				wanted_faster, distance_km, start_time, "time", elapsed_time, avg_pace, avg_hr, max_hr,
				elev_gain, calories, kilojoules, max_speed, cadence, shoes, summary_image, splits_image,
				strava_id, route, notes, country, province, place, best_efforts
			) VALUES (${Array(35).fill('?').join(',')})
			ON CONFLICT (slug) DO UPDATE SET
				date = excluded.date, week = excluded.week, day = excluded.day,
				activity_type = excluded.activity_type, session = excluded.session,
				effort = excluded.effort, shins = excluded.shins, legs = excluded.legs, energy = excluded.energy,
				weather = excluded.weather, surface = excluded.surface, wanted_faster = excluded.wanted_faster,
				distance_km = excluded.distance_km, start_time = excluded.start_time, "time" = excluded."time",
				elapsed_time = excluded.elapsed_time, avg_pace = excluded.avg_pace, avg_hr = excluded.avg_hr,
				max_hr = excluded.max_hr, elev_gain = excluded.elev_gain, calories = excluded.calories,
				kilojoules = excluded.kilojoules, max_speed = excluded.max_speed, cadence = excluded.cadence,
				shoes = excluded.shoes, summary_image = excluded.summary_image, splits_image = excluded.splits_image,
				strava_id = excluded.strava_id, route = excluded.route, notes = excluded.notes,
				country = excluded.country, province = excluded.province, place = excluded.place,
				best_efforts = excluded.best_efforts`,
			[
				str(r.slug),
				str(r.date),
				num(r.week),
				str(r.day),
				str(r.activity_type) || 'run',
				str(r.session) || 'other',
				num(r.effort),
				num(r.shins),
				num(r.legs),
				num(r.energy),
				str(r.weather),
				str(r.surface),
				intBool(r.wanted_faster),
				num(r.distance_km),
				str(r.start_time),
				str(r.time),
				str(r.elapsed_time),
				str(r.avg_pace),
				num(r.avg_hr),
				num(r.max_hr),
				num(r.elev_gain),
				num(r.calories),
				num(r.kilojoules),
				num(r.max_speed),
				num(r.cadence),
				str(r.shoes),
				str(r.summary_image),
				str(r.splits_image),
				str(r.strava_id),
				str(r.route),
				str(r.notes),
				str(r.country),
				str(r.province),
				str(r.place),
				jsonText(r.best_efforts) ?? '[]'
			]
		);
	}
	console.log(`  wrote runs ${runs.length}`);

	let polylineFilled = 0;
	for (const r of routes) {
		const stored = r.polyline;
		const empty =
			stored == null ||
			stored === '' ||
			(Array.isArray(stored) && stored.length < 2) ||
			(typeof stored === 'string' && stored === '[]');
		if (empty) polylineFilled++;
		await exec(
			`INSERT INTO routes (id, geojson, polyline) VALUES (?, ?, ?)
			ON CONFLICT (id) DO UPDATE SET geojson = excluded.geojson, polyline = excluded.polyline`,
			[str(r.id), jsonText(r.geojson) ?? '{}', polylineText(r.geojson, stored)]
		);
	}
	console.log(`  wrote routes ${routes.length} (polylines computed: ${polylineFilled})`);

	for (const r of context) {
		await exec(
			`INSERT INTO context (name, content) VALUES (?, ?)
			ON CONFLICT (name) DO UPDATE SET content = excluded.content`,
			[str(r.name), str(r.content)]
		);
	}
	console.log(`  wrote context ${context.length}`);

	let plannedPolylines = 0;
	for (const r of planned) {
		const stored = r.polyline;
		const empty =
			stored == null ||
			stored === '' ||
			(Array.isArray(stored) && stored.length < 2) ||
			(typeof stored === 'string' && stored === '[]');
		if (empty) plannedPolylines++;
		await exec(
			`INSERT INTO planned_routes (
				slug, name, notes, distance_km, elev_gain, elev_loss, elev_min, elev_max,
				point_count, est_time, saved_on, country, province, place, waypoints, geojson, polyline
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT (slug) DO UPDATE SET
				name = excluded.name, notes = excluded.notes, distance_km = excluded.distance_km,
				elev_gain = excluded.elev_gain, elev_loss = excluded.elev_loss,
				elev_min = excluded.elev_min, elev_max = excluded.elev_max,
				point_count = excluded.point_count, est_time = excluded.est_time, saved_on = excluded.saved_on,
				country = excluded.country, province = excluded.province, place = excluded.place,
				waypoints = excluded.waypoints, geojson = excluded.geojson, polyline = excluded.polyline`,
			[
				str(r.slug),
				str(r.name),
				str(r.notes),
				num(r.distance_km),
				num(r.elev_gain),
				num(r.elev_loss),
				num(r.elev_min),
				num(r.elev_max),
				num(r.point_count) ?? 0,
				str(r.est_time),
				str(r.saved_on),
				str(r.country),
				str(r.province),
				str(r.place),
				jsonText(r.waypoints) ?? '[]',
				jsonText(r.geojson) ?? '{}',
				polylineText(r.geojson, stored)
			]
		);
	}
	console.log(`  wrote planned ${planned.length} (polylines computed: ${plannedPolylines})`);

	for (const r of links) {
		await exec(
			`INSERT INTO planned_route_links (
				id, route_slug, kind, activity_slug, plan_week, plan_day, created_on
			) VALUES (?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT (id) DO UPDATE SET
				route_slug = excluded.route_slug, kind = excluded.kind,
				activity_slug = excluded.activity_slug, plan_week = excluded.plan_week,
				plan_day = excluded.plan_day, created_on = excluded.created_on`,
			[
				num(r.id),
				str(r.route_slug),
				str(r.kind),
				r.activity_slug == null || r.activity_slug === '' ? null : str(r.activity_slug),
				num(r.plan_week),
				r.plan_day == null || r.plan_day === '' ? null : str(r.plan_day),
				str(r.created_on)
			]
		);
	}
	console.log(`  wrote links ${links.length}`);

	if (localProxy) await localProxy.dispose();
	console.log('Done.');
}

main().catch((err) => {
	console.error(err instanceof Error ? err.message : err);
	process.exit(1);
});
