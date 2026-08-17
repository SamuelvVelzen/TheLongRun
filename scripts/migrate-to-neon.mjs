/**
 * One-time migration: load data/runs/*.md, data/routes/*.json and data/context/*
 * into Neon Postgres. Idempotent (upserts by primary key) — safe to re-run.
 *
 *   npm run migrate            # uses DATABASE_URL from .env (node --env-file=.env)
 *
 * Requires DATABASE_URL to be the Neon *pooled* connection string.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';
import matter from 'gray-matter';

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL is not set. Add it to .env (Neon pooled connection string).');
	process.exit(1);
}
const sql = neon(url);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataRoot = process.env.DATA_DIR
	? path.resolve(process.env.DATA_DIR)
	: path.join(root, 'data');
const runsDir = path.join(dataRoot, 'runs');
const routesDir = path.join(dataRoot, 'routes');
const contextDir = path.join(dataRoot, 'context');

function toBool(value) {
	if (value === true || value === 'true' || value === 'Y' || value === 'y' || value === 'yes')
		return true;
	if (value === false || value === 'false' || value === 'N' || value === 'n' || value === 'no')
		return false;
	return null;
}

function toNum(value) {
	if (value === null || value === undefined || value === '') return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

function toIsoDate(value) {
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		const y = value.getUTCFullYear();
		const m = String(value.getUTCMonth() + 1).padStart(2, '0');
		const d = String(value.getUTCDate()).padStart(2, '0');
		return `${y}-${m}-${d}`;
	}
	const raw = String(value ?? '').trim();
	if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
	const parsed = new Date(raw);
	if (!Number.isNaN(parsed.getTime())) {
		const y = parsed.getUTCFullYear();
		const m = String(parsed.getUTCMonth() + 1).padStart(2, '0');
		const d = String(parsed.getUTCDate()).padStart(2, '0');
		return `${y}-${m}-${d}`;
	}
	return raw;
}

function str(value) {
	return value === null || value === undefined ? '' : String(value);
}

async function createSchema() {
	await sql`
		CREATE TABLE IF NOT EXISTS runs (
			slug text PRIMARY KEY,
			date text NOT NULL,
			week integer,
			day text NOT NULL DEFAULT '',
			activity_type text NOT NULL DEFAULT 'run',
			session text NOT NULL DEFAULT 'other',
			effort integer, shins integer, legs integer, energy integer,
			weather text NOT NULL DEFAULT '',
			surface text NOT NULL DEFAULT '',
			wanted_faster boolean,
			distance_km double precision,
			start_time text NOT NULL DEFAULT '',
			"time" text NOT NULL DEFAULT '',
			elapsed_time text NOT NULL DEFAULT '',
			avg_pace text NOT NULL DEFAULT '',
			avg_hr integer, max_hr integer,
			elev_gain double precision,
			calories integer,
			kilojoules double precision,
			max_speed double precision,
			cadence integer,
			shoes text NOT NULL DEFAULT '',
			summary_image text NOT NULL DEFAULT '',
			splits_image text NOT NULL DEFAULT '',
			strava_id text NOT NULL DEFAULT '',
			route text NOT NULL DEFAULT '',
			notes text NOT NULL DEFAULT ''
		)
	`;
	// Additive columns for already-migrated databases (idempotent).
	await sql`ALTER TABLE runs ADD COLUMN IF NOT EXISTS activity_type text NOT NULL DEFAULT 'run'`;
	await sql`CREATE INDEX IF NOT EXISTS runs_date_idx ON runs (date DESC)`;
	await sql`CREATE INDEX IF NOT EXISTS runs_strava_id_idx ON runs (strava_id)`;
	await sql`CREATE TABLE IF NOT EXISTS routes (id text PRIMARY KEY, geojson jsonb NOT NULL)`;
	await sql`CREATE TABLE IF NOT EXISTS context (name text PRIMARY KEY, content text NOT NULL DEFAULT '')`;
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
}

async function upsertRun(r) {
	await sql`
		INSERT INTO runs (
			slug, date, week, day, activity_type, session, effort, shins, legs, energy, weather, surface,
			wanted_faster, distance_km, start_time, "time", elapsed_time, avg_pace, avg_hr, max_hr,
			elev_gain, calories, kilojoules, max_speed, cadence, shoes, summary_image, splits_image,
			strava_id, route, notes
		) VALUES (
			${r.slug}, ${r.date}, ${r.week}, ${r.day}, ${r.activity_type}, ${r.session}, ${r.effort}, ${r.shins},
			${r.legs}, ${r.energy}, ${r.weather}, ${r.surface}, ${r.wanted_faster}, ${r.distance_km},
			${r.start_time}, ${r.time}, ${r.elapsed_time}, ${r.avg_pace}, ${r.avg_hr}, ${r.max_hr},
			${r.elev_gain}, ${r.calories}, ${r.kilojoules}, ${r.max_speed}, ${r.cadence}, ${r.shoes},
			${r.summary_image}, ${r.splits_image}, ${r.strava_id}, ${r.route}, ${r.notes}
		)
		ON CONFLICT (slug) DO UPDATE SET
			date = EXCLUDED.date, week = EXCLUDED.week, day = EXCLUDED.day,
			activity_type = EXCLUDED.activity_type, session = EXCLUDED.session,
			effort = EXCLUDED.effort, shins = EXCLUDED.shins, legs = EXCLUDED.legs, energy = EXCLUDED.energy,
			weather = EXCLUDED.weather, surface = EXCLUDED.surface, wanted_faster = EXCLUDED.wanted_faster,
			distance_km = EXCLUDED.distance_km, start_time = EXCLUDED.start_time, "time" = EXCLUDED."time",
			elapsed_time = EXCLUDED.elapsed_time, avg_pace = EXCLUDED.avg_pace, avg_hr = EXCLUDED.avg_hr,
			max_hr = EXCLUDED.max_hr, elev_gain = EXCLUDED.elev_gain, calories = EXCLUDED.calories,
			kilojoules = EXCLUDED.kilojoules, max_speed = EXCLUDED.max_speed, cadence = EXCLUDED.cadence,
			shoes = EXCLUDED.shoes, summary_image = EXCLUDED.summary_image, splits_image = EXCLUDED.splits_image,
			strava_id = EXCLUDED.strava_id, route = EXCLUDED.route, notes = EXCLUDED.notes
	`;
}

async function migrateRuns() {
	if (!existsSync(runsDir)) return 0;
	const files = readdirSync(runsDir).filter((f) => f.endsWith('.md'));
	let n = 0;
	for (const f of files) {
		const raw = readFileSync(path.join(runsDir, f), 'utf8');
		const { data, content } = matter(raw);
		await upsertRun({
			slug: f.replace(/\.md$/, ''),
			date: toIsoDate(data.date),
			week: toNum(data.week),
			day: str(data.day),
			activity_type: str(data.activity_type) || 'run',
			session: str(data.session) || 'other',
			effort: toNum(data.effort),
			shins: toNum(data.shins),
			legs: toNum(data.legs),
			energy: toNum(data.energy),
			weather: str(data.weather),
			surface: str(data.surface),
			wanted_faster: toBool(data.wanted_faster),
			distance_km: toNum(data.distance_km),
			start_time: str(data.start_time),
			time: str(data.time),
			elapsed_time: str(data.elapsed_time),
			avg_pace: str(data.avg_pace),
			avg_hr: toNum(data.avg_hr),
			max_hr: toNum(data.max_hr),
			elev_gain: toNum(data.elev_gain),
			calories: toNum(data.calories),
			kilojoules: toNum(data.kilojoules),
			max_speed: toNum(data.max_speed),
			cadence: toNum(data.cadence),
			shoes: str(data.shoes),
			summary_image: str(data.summary_image),
			splits_image: str(data.splits_image),
			strava_id: str(data.strava_id),
			route: str(data.route),
			notes: content.trim()
		});
		n++;
	}
	return n;
}

async function migrateRoutes() {
	if (!existsSync(routesDir)) return 0;
	const files = readdirSync(routesDir).filter((f) => f.endsWith('.json'));
	let n = 0;
	for (const f of files) {
		const id = f.replace(/\.json$/, '');
		let geo;
		try {
			geo = JSON.parse(readFileSync(path.join(routesDir, f), 'utf8'));
		} catch {
			console.warn(`  skipped invalid GeoJSON: ${f}`);
			continue;
		}
		await sql`
			INSERT INTO routes (id, geojson) VALUES (${id}, ${JSON.stringify(geo)}::jsonb)
			ON CONFLICT (id) DO UPDATE SET geojson = EXCLUDED.geojson
		`;
		n++;
	}
	return n;
}

async function migrateContext() {
	if (!existsSync(contextDir)) return 0;
	const files = readdirSync(contextDir).filter((f) => !f.startsWith('.'));
	let n = 0;
	for (const f of files) {
		const content = readFileSync(path.join(contextDir, f), 'utf8');
		await sql`
			INSERT INTO context (name, content) VALUES (${f}, ${content})
			ON CONFLICT (name) DO UPDATE SET content = EXCLUDED.content
		`;
		n++;
	}
	return n;
}

console.log(`Migrating from ${dataRoot} → Neon…`);
await createSchema();
console.log('  schema ready');
const runs = await migrateRuns();
console.log(`  runs:    ${runs}`);
const routes = await migrateRoutes();
console.log(`  routes:  ${routes}`);
const context = await migrateContext();
console.log(`  context: ${context}`);
console.log('Done.');
