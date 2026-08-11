/**
 * LOCAL, idempotent backfill of the per-point HR series onto EXISTING route tracks, so HR zones
 * can be recomputed for any HRmax. It re-parses your source files and OVERWRITES each matched
 * run's existing route GeoJSON in place — it never creates new runs or new route ids, so it is
 * safe to run repeatedly and cannot create duplicates.
 *
 *   node --env-file=.env scripts/backfill-hr-series.mjs                                  # dry run
 *   node --env-file=.env scripts/backfill-hr-series.mjs --gpx="C:/path/to/gpx_dir" --commit
 *   node --env-file=.env scripts/backfill-hr-series.mjs --fit="C:/path/to/strava_export" --commit
 *   node --env-file=.env scripts/backfill-hr-series.mjs --gpx="..." --fit="..." --commit
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { neon } from '@neondatabase/serverless';
import { build } from 'esbuild';
import FitParser from 'fit-file-parser';

const args = process.argv.slice(2);
const commit = args.includes('--commit');
const gpxDir = args.find((a) => a.startsWith('--gpx='))?.slice('--gpx='.length) || '';
const fitExport =
	args.find((a) => a.startsWith('--fit='))?.slice('--fit='.length) || '';

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL is not set. Run with node --env-file=.env');
	process.exit(1);
}
if (!gpxDir && !fitExport) {
	console.error('Point me at source files: --gpx="<dir>" and/or --fit="<strava_export_dir>".');
	process.exit(1);
}
const sql = neon(url);

// ---------- bundle the app's parsers/analytics from $lib ----------
await build({
	stdin: {
		contents: `
			export { parseGpx } from '${path.resolve('src/lib/server/gpx.ts').replace(/\\/g, '/')}';
			export { computeRouteAnalytics, analyticsToProperties } from '${path
				.resolve('src/lib/splits.ts')
				.replace(/\\/g, '/')}';
		`,
		resolveDir: process.cwd(),
		loader: 'ts'
	},
	bundle: true,
	format: 'esm',
	platform: 'node',
	outfile: '_backfill_lib.mjs',
	alias: { $lib: path.resolve('src/lib') }
});
const { parseGpx, computeRouteAnalytics, analyticsToProperties } = await import(
	pathToFileURL(path.resolve('_backfill_lib.mjs')).href
);

function routeIdOf(run) {
	const fromRoute = String(run.route || '')
		.trim()
		.replace(/^.*\//, '')
		.replace(/\?.*$/, '')
		.replace(/\.json$/i, '');
	if (fromRoute) return fromRoute;
	return String(run.strava_id || '').trim() || null;
}
function downsample(items, max) {
	if (items.length <= max) return items;
	const out = [];
	const step = (items.length - 1) / (max - 1);
	for (let i = 0; i < max; i++) out.push(items[Math.round(i * step)]);
	return out;
}
async function overwriteRoute(id, geojson) {
	if (!commit) return;
	await sql`
		INSERT INTO routes (id, geojson) VALUES (${id}, ${JSON.stringify(geojson)}::jsonb)
		ON CONFLICT (id) DO UPDATE SET geojson = EXCLUDED.geojson
	`;
}
function hrSeriesLen(analytics) {
	return Array.isArray(analytics?.hrSamples) ? analytics.hrSamples.length : 0;
}

const runs = await sql`SELECT slug, date, activity_type, start_time, distance_km, route, strava_id FROM runs`;
const byStrava = new Map(runs.filter((r) => r.strava_id).map((r) => [String(r.strava_id), r]));
const claimed = new Set(); // run slugs already backfilled this pass (avoids double-writes)

let updated = 0,
	noSeries = 0,
	unmatched = 0,
	noRoute = 0,
	errors = 0;

// ---------- GPX ----------
if (gpxDir) {
	if (!existsSync(gpxDir)) {
		console.error(`GPX dir not found: ${gpxDir}`);
	} else {
		const files = readdirSync(gpxDir).filter((f) => /\.gpx$/i.test(f));
		console.log(`\nGPX: ${files.length} file(s) in ${gpxDir}`);
		for (const file of files) {
			try {
				const parsed = parseGpx(readFileSync(path.join(gpxDir, file), 'utf8'));
				if (!parsed.date) {
					console.warn(`  skip ${file}: no date`);
					unmatched++;
					continue;
				}
				const sameDay = runs.filter((r) => r.date === parsed.date);
				// Match on date + distance (robust to the pre-fix 2h start_time offset). Only accept an
				// UNAMBIGUOUS single candidate; skip anything ambiguous so we never guess a track.
				const cands = sameDay.filter(
					(r) =>
						parsed.distanceKm != null &&
						r.distance_km != null &&
						Math.abs(r.distance_km - parsed.distanceKm) <= 0.25
				);
				const run = cands.length === 1 ? cands[0] : null;
				if (!run) {
					console.warn(
						`  skip ${file}: ${cands.length === 0 ? 'no' : cands.length + ' (ambiguous)'} distance match on ${parsed.date} (${parsed.distanceKm} km)`
					);
					unmatched++;
					continue;
				}
				if (claimed.has(run.slug)) {
					console.warn(`  skip ${file}: ${run.slug} already backfilled this pass`);
					continue;
				}
				claimed.add(run.slug);
				const id = routeIdOf(run);
				if (!id) {
					noRoute++;
					continue;
				}
				const geojson = {
					type: 'Feature',
					properties: {
						date: parsed.date,
						sport: run.activity_type,
						distance_km: parsed.distanceKm,
						point_count: parsed.points.length,
						...(parsed.analytics ? analyticsToProperties(parsed.analytics) : {})
					},
					geometry: { type: 'LineString', coordinates: parsed.points.map((p) => [p.lng, p.lat]) }
				};
				const n = hrSeriesLen(parsed.analytics);
				await overwriteRoute(id, geojson);
				if (n > 0) updated++;
				else noSeries++;
				console.log(`  ${run.slug}: ${n} HR pts${commit ? '' : ' (dry)'}`);
			} catch (e) {
				errors++;
				console.warn(`  error on ${file}: ${e instanceof Error ? e.message : e}`);
			}
		}
	}
}

// ---------- FIT (Strava export dir with activities/ + activities.csv) ----------
if (fitExport) {
	const activitiesDir = path.join(fitExport, 'activities');
	const csvPath = path.join(fitExport, 'activities.csv');
	const csvMap = new Map();
	if (existsSync(csvPath)) {
		const text = readFileSync(csvPath, 'utf8');
		// minimal CSV parse (Activity ID + Filename)
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
					} else q = false;
				} else field += c;
			} else if (c === '"') q = true;
			else if (c === ',') {
				row.push(field);
				field = '';
			} else if (c === '\r') {
				/* skip */
			} else if (c === '\n') {
				row.push(field);
				rows.push(row);
				field = '';
				row = [];
			} else field += c;
		}
		if (field.length || row.length) {
			row.push(field);
			rows.push(row);
		}
		const headers = rows[0] || [];
		const idIdx = headers.indexOf('Activity ID');
		const fileIdx = headers.indexOf('Filename');
		for (let i = 1; i < rows.length; i++) {
			const id = String(rows[i][idIdx] ?? '').trim();
			const f = String(rows[i][fileIdx] ?? '').trim();
			if (id && f) csvMap.set(path.basename(f).replace(/\.fit(\.gz)?$/i, ''), id);
		}
	}

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
		const track = [];
		for (const r of Array.isArray(data.records) ? data.records : []) {
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
		return track;
	}

	const files =
		existsSync(activitiesDir) && statSync(activitiesDir).isDirectory()
			? readdirSync(activitiesDir).filter((f) => /\.fit(\.gz)?$/i.test(f))
			: [];
	console.log(`\nFIT: ${files.length} file(s) in ${activitiesDir}`);
	for (const file of files) {
		try {
			const base = path.basename(file).replace(/\.fit(\.gz)?$/i, '');
			const stravaId = csvMap.get(base) || base;
			const run = byStrava.get(stravaId);
			if (!run) {
				unmatched++;
				continue;
			}
			const id = routeIdOf(run);
			if (!id) {
				noRoute++;
				continue;
			}
			let buf = readFileSync(path.join(activitiesDir, file));
			if (/\.gz$/i.test(file)) buf = gunzipSync(buf);
			const track = await parseFit(buf);
			if (track.length < 2) {
				unmatched++;
				continue;
			}
			const hrs = track.filter((p) => p.hr != null).map((p) => p.hr);
			const avgHr = hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null;
			const maxHr = hrs.length ? Math.max(...hrs) : null;
			const analytics = computeRouteAnalytics(track, { avgHr, maxHr });
			const coords = downsample(
				track.map((p) => [p.lng, p.lat]),
				2500
			);
			const geojson = {
				type: 'Feature',
				properties: {
					strava_id: stravaId,
					sport: run.activity_type,
					point_count: coords.length,
					...(analytics ? analyticsToProperties(analytics) : {})
				},
				geometry: { type: 'LineString', coordinates: coords }
			};
			const n = hrSeriesLen(analytics);
			await overwriteRoute(id, geojson);
			if (n > 0) updated++;
			else noSeries++;
			console.log(`  ${run.slug}: ${n} HR pts${commit ? '' : ' (dry)'}`);
		} catch (e) {
			errors++;
			console.warn(`  error on ${file}: ${e instanceof Error ? e.message : e}`);
		}
	}
}

console.log(
	`\n${commit ? 'Updated' : 'Would update'} with HR series: ${updated}  ` +
		`(matched but no HR ${noSeries}, unmatched ${unmatched}, run has no route ${noRoute}, errors ${errors})`
);
if (!commit) console.log('Dry run. Re-run with --commit to write. Safe to re-run; never duplicates.');
