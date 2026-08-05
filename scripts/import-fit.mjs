/**
 * LOCAL one-time import of GPS routes from a Strava export's .fit.gz files into Neon.
 * Runs on Node (uses node:zlib to gunzip — no Cloudflare DecompressionStream). For each FIT it
 * builds the route GeoJSON (reusing computeRouteAnalytics for splits/HR zones/km markers) and
 * attaches it to the existing run matched by Strava Activity ID. Runs that already have a route
 * are left untouched, so subjective data and existing maps are never overwritten.
 *
 *   node --env-file=.env scripts/import-fit.mjs                 # dry run
 *   node --env-file=.env scripts/import-fit.mjs --commit
 *   node --env-file=.env scripts/import-fit.mjs --export="C:/path/to/export_dir" --commit
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { neon } from '@neondatabase/serverless';
import { build } from 'esbuild';
import FitParser from 'fit-file-parser';

const args = process.argv.slice(2);
const commit = args.includes('--commit');
const exportArg = args.find((a) => a.startsWith('--export='));
const exportDir = exportArg?.slice('--export='.length) || 'C:/Users/svanvelzen/Downloads/export_1838793734_5119';
const activitiesDir = path.join(exportDir, 'activities');
const csvPath = path.join(exportDir, 'activities.csv');

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL is not set.');
	process.exit(1);
}
const sql = neon(url);

// ---------- reuse the app's analytics engine (bundled from $lib) ----------
await build({
	stdin: {
		contents: `export { computeRouteAnalytics, analyticsToProperties } from '${path
			.resolve('src/lib/splits.ts')
			.replace(/\\/g, '/')}';`,
		resolveDir: process.cwd(),
		loader: 'ts'
	},
	bundle: true,
	format: 'esm',
	platform: 'node',
	outfile: '_analytics.mjs',
	alias: { $lib: path.resolve('src/lib') }
});
const { computeRouteAnalytics, analyticsToProperties } = await import(
	pathToFileURL(path.resolve('_analytics.mjs')).href
);

// ---------- CSV filename -> Activity ID ----------
function parseCsv(text) {
	const rows = [];
	let field = '',
		row = [],
		q = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (q) {
			if (c === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
					continue;
				}
				q = false;
				continue;
			}
			field += c;
			continue;
		}
		if (c === '"') {
			q = true;
			continue;
		}
		if (c === ',') {
			row.push(field);
			field = '';
			continue;
		}
		if (c === '\r') continue;
		if (c === '\n') {
			row.push(field);
			rows.push(row);
			field = '';
			row = [];
			continue;
		}
		field += c;
	}
	if (field.length || row.length) {
		row.push(field);
		rows.push(row);
	}
	return rows;
}

function fitBase(name) {
	return path.basename(name).replace(/\.fit(\.gz)?$/i, '');
}

const csvMap = new Map();
if (existsSync(csvPath)) {
	const rows = parseCsv(readFileSync(csvPath, 'utf8'));
	const headers = rows[0];
	const idIdx = headers.indexOf('Activity ID');
	const fileIdx = headers.indexOf('Filename');
	for (let i = 1; i < rows.length; i++) {
		const id = String(rows[i][idIdx] ?? '').trim();
		const file = String(rows[i][fileIdx] ?? '').trim();
		if (id && file) csvMap.set(fitBase(file), id);
	}
}

// ---------- FIT parsing ----------
async function parseFit(buffer) {
	const parser = new FitParser({
		force: true,
		speedUnit: 'km/h',
		lengthUnit: 'km',
		temperatureUnit: 'celsius',
		mode: 'list'
	});
	const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
	const data = await new Promise((resolve, reject) =>
		parser.parse(ab, (err, d) => (err ? reject(err) : resolve(d)))
	);
	const records = Array.isArray(data.records) ? data.records : [];
	const track = [];
	for (const r of records) {
		const lat = Number(r.position_lat);
		const lng = Number(r.position_long);
		if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
		if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) continue;
		const s = { lat, lng };
		const ts = r.timestamp;
		if (ts instanceof Date && !Number.isNaN(ts.getTime())) s.timeMs = ts.getTime();
		else if (ts) {
			const d = new Date(ts);
			if (!Number.isNaN(d.getTime())) s.timeMs = d.getTime();
		}
		const hr = Number(r.heart_rate);
		if (Number.isFinite(hr) && hr > 0) s.hr = Math.round(hr);
		const elev = Number(r.altitude ?? r.enhanced_altitude);
		if (Number.isFinite(elev)) s.elev = elev < 20 ? elev * 1000 : elev;
		track.push(s);
	}
	const sport = String(data.sessions?.[0]?.sport || data.sports?.[0]?.sport || '');
	return { track, sport };
}

function downsample(items, max) {
	if (items.length <= max) return items;
	const out = [];
	const step = (items.length - 1) / (max - 1);
	for (let i = 0; i < max; i++) out.push(items[Math.round(i * step)]);
	return out;
}

async function saveRoute(id, geojson) {
	await sql`
		INSERT INTO routes (id, geojson) VALUES (${id}, ${JSON.stringify(geojson)}::jsonb)
		ON CONFLICT (id) DO UPDATE SET geojson = EXCLUDED.geojson
	`;
}

// ---------- run ----------
const existing = await sql`SELECT slug, strava_id, route, activity_type FROM runs`;
const byStrava = new Map(existing.filter((r) => r.strava_id).map((r) => [String(r.strava_id), r]));

const files = existsSync(activitiesDir)
	? readdirSync(activitiesDir).filter((f) => /\.fit(\.gz)?$/i.test(f))
	: [];
console.log(`Found ${files.length} FIT files; ${byStrava.size} runs with a Strava id in DB.`);

let attached = 0,
	noRecord = 0,
	alreadyMapped = 0,
	noGps = 0,
	errors = 0;

for (const file of files) {
	const base = fitBase(file);
	const stravaId = csvMap.get(base) || base;
	const run = byStrava.get(stravaId);
	if (!run) {
		noRecord++;
		continue;
	}
	if (String(run.route || '').trim()) {
		alreadyMapped++;
		continue;
	}
	try {
		let buf = readFileSync(path.join(activitiesDir, file));
		if (/\.gz$/i.test(file)) buf = gunzipSync(buf);
		const { track, sport } = await parseFit(buf);
		if (track.length < 2) {
			noGps++;
			continue;
		}
		const hrs = track.filter((p) => p.hr != null).map((p) => p.hr);
		const avgHr = hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null;
		const maxHr = hrs.length ? Math.max(...hrs) : null;
		const analytics = computeRouteAnalytics(track, { avgHr, maxHr });
		const points = downsample(
			track.map((p) => [p.lng, p.lat]),
			2500
		);
		const geojson = {
			type: 'Feature',
			properties: {
				strava_id: stravaId,
				sport: run.activity_type || sport,
				point_count: points.length,
				...(analytics ? analyticsToProperties(analytics) : {})
			},
			geometry: { type: 'LineString', coordinates: points }
		};
		if (commit) {
			await saveRoute(stravaId, geojson);
			await sql`UPDATE runs SET route = ${`/routes/${stravaId}.json`} WHERE slug = ${run.slug}`;
		}
		attached++;
	} catch (e) {
		errors++;
		console.warn(`  error on ${file}: ${e instanceof Error ? e.message : e}`);
	}
}

console.log(
	`\n${commit ? 'Attached' : 'Would attach'}: ${attached}  ` +
		`(already mapped ${alreadyMapped}, no matching record ${noRecord}, no GPS ${noGps}, errors ${errors})`
);
if (!commit) console.log('Dry run. Re-run with --commit to write.');
