/**
 * Prefer Strava CSV / device weather when present; Open-Meteo only as fallback.
 *
 * 1. Optionally sync start_time from activities.csv (by strava_id)
 * 2. Apply Strava weather columns (Weather Temperature / Condition / Humidity,
 *    or Average/Max Temperature) onto matching runs
 * 3. Fill remaining empty weather via Open-Meteo (hourly)
 *
 *   node scripts/backfill-weather.mjs
 *   node scripts/backfill-weather.mjs --force              # re-fetch Open-Meteo where no Strava weather
 *   node scripts/backfill-weather.mjs --force --csv=c:/path/to/activities.csv
 *   node scripts/backfill-weather.mjs --force --only=2026-07-21-tuesday,2026-07-22-tuesday
 *   node scripts/backfill-weather.mjs --skip-csv           # Open-Meteo only (empty weather)
 *   node scripts/backfill-weather.mjs --skip-open-meteo    # Strava CSV weather only
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const force = args.includes('--force');
const skipCsv = args.includes('--skip-csv');
const skipOpenMeteo = args.includes('--skip-open-meteo');
const onlyArg = args.find((a) => a.startsWith('--only='));
const onlySlugs = onlyArg
	? onlyArg
			.slice('--only='.length)
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean)
	: undefined;
const csvArg = args.find((a) => a.startsWith('--csv='));
const csvPath =
	csvArg?.slice('--csv='.length) ||
	'c:/Users/svanvelzen/Downloads/export_1838793734_5119/activities.csv';

function parseCSV(text) {
	const rows = [];
	let field = '';
	let row = [];
	let inQuotes = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (inQuotes) {
			if (c === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
					continue;
				}
				inQuotes = false;
				continue;
			}
			field += c;
			continue;
		}
		if (c === '"') {
			inQuotes = true;
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

function getField(headers, row, name, occurrence = 0) {
	let seen = 0;
	for (let i = 0; i < headers.length; i++) {
		if (headers[i] === name) {
			if (seen === occurrence) return row[i] ?? '';
			seen++;
		}
	}
	return '';
}

/** Map strava_id → HH:mm from Activity Date. */
function loadStartTimesFromCsv(filepath) {
	const map = new Map();
	if (!existsSync(filepath)) {
		console.warn(`CSV not found: ${filepath}`);
		return map;
	}
	const rows = parseCSV(readFileSync(filepath, 'utf8'));
	const headers = rows[0];
	for (let r = 1; r < rows.length; r++) {
		const row = rows[r];
		const id = String(getField(headers, row, 'Activity ID')).trim();
		if (!id) continue;
		const dateRaw = getField(headers, row, 'Activity Date');
		const d = new Date(dateRaw);
		if (Number.isNaN(d.getTime())) continue;
		const hh = String(d.getHours()).padStart(2, '0');
		const mm = String(d.getMinutes()).padStart(2, '0');
		map.set(id, `${hh}:${mm}`);
	}
	return map;
}

const server = await createServer({
	root,
	server: { middlewareMode: true },
	appType: 'custom'
});

try {
	const runsMod = await server.ssrLoadModule('/src/lib/server/runs.ts');
	const weatherMod = await server.ssrLoadModule('/src/lib/server/weather.ts');
	const stravaMod = await server.ssrLoadModule('/src/lib/server/strava-csv.ts');

	const startTimeUpdates = [];
	let startTimesSet = 0;
	let startTimesSkipped = 0;
	let stravaWeather = null;

	if (!skipCsv) {
		const byId = loadStartTimesFromCsv(csvPath);
		console.log(`Loaded ${byId.size} activity start times from CSV`);
		const only = onlySlugs?.length ? new Set(onlySlugs) : null;
		for (const run of runsMod.listRuns()) {
			if (only && !only.has(run.slug)) continue;
			if (!run.strava_id) {
				startTimesSkipped++;
				continue;
			}
			const clock = byId.get(String(run.strava_id));
			if (!clock) {
				startTimesSkipped++;
				continue;
			}
			if (run.start_time === clock) {
				startTimesSkipped++;
				continue;
			}
			const before = run.start_time || '';
			run.start_time = clock;
			runsMod.writeRun(run);
			startTimesSet++;
			startTimeUpdates.push({ slug: run.slug, strava_id: run.strava_id, before, after: clock });
		}

		if (existsSync(csvPath)) {
			const csvText = readFileSync(csvPath, 'utf8');
			const metrics = stravaMod.parseActivitiesCsvMetrics(csvText);
			const onlySet = onlySlugs?.length ? new Set(onlySlugs) : null;
			const items = [];
			let updated = 0;
			let skipped = 0;
			let missing = 0;
			for (const run of runsMod.listRuns()) {
				if (onlySet && !onlySet.has(run.slug)) continue;
				const id = (run.strava_id || '').trim();
				if (!id) {
					skipped++;
					items.push({ slug: run.slug, strava_id: '', status: 'skipped' });
					continue;
				}
				const m = metrics.get(id);
				if (!m?.weather) {
					if (!m) missing++;
					else skipped++;
					items.push({
						slug: run.slug,
						strava_id: id,
						status: m ? 'skipped' : 'missing_csv',
						weather: m ? '' : undefined
					});
					continue;
				}
				if (run.weather?.trim() === m.weather) {
					skipped++;
					items.push({ slug: run.slug, strava_id: id, status: 'skipped', weather: m.weather });
					continue;
				}
				run.weather = m.weather;
				runsMod.writeRun(run);
				updated++;
				items.push({ slug: run.slug, strava_id: id, status: 'updated', weather: m.weather });
			}
			stravaWeather = {
				updated,
				skipped,
				missing,
				updatedItems: items.filter((i) => i.status === 'updated')
			};
		}
	}

	let openMeteo = null;
	if (!skipOpenMeteo) {
		// Never overwrite Strava/device weather with Open-Meteo.
		// --force only re-fetches Open-Meteo for runs that still lack weather,
		// or that already have non-Strava weather when force is set... 
		// Prefer: only fill empty; with --force, refill empty OR non-matching Open-Meteo
		// but skip any run whose strava_id has CSV weather.
		const csvWeatherIds = new Set();
		if (!skipCsv && existsSync(csvPath)) {
			const metrics = stravaMod.parseActivitiesCsvMetrics(readFileSync(csvPath, 'utf8'));
			for (const [id, m] of metrics) {
				if (m.weather) csvWeatherIds.add(id);
			}
		}

		const only = onlySlugs?.length ? new Set(onlySlugs) : null;
		const items = [];
		let updated = 0;
		let skipped = 0;
		let failed = 0;

		for (const run of runsMod.listRuns()) {
			if (only && !only.has(run.slug)) continue;
			const id = (run.strava_id || '').trim();
			if (id && csvWeatherIds.has(id)) {
				skipped++;
				items.push({ slug: run.slug, weather: run.weather, status: 'skipped', reason: 'strava' });
				continue;
			}
			if (!force && run.weather?.trim()) {
				skipped++;
				items.push({ slug: run.slug, weather: run.weather, status: 'skipped' });
				continue;
			}
			try {
				const weather = await weatherMod.weatherForRun(run);
				if (!weather) {
					failed++;
					items.push({ slug: run.slug, weather: run.weather ?? '', status: 'failed' });
					continue;
				}
				if (run.weather?.trim() === weather) {
					skipped++;
					items.push({ slug: run.slug, weather, status: 'skipped' });
					continue;
				}
				run.weather = weather;
				runsMod.writeRun(run);
				updated++;
				items.push({ slug: run.slug, weather, status: 'updated' });
				await new Promise((r) => setTimeout(r, 120));
			} catch {
				failed++;
				items.push({ slug: run.slug, weather: '', status: 'failed' });
			}
		}

		openMeteo = {
			force,
			updated,
			skipped,
			failed,
			defaultLocation: weatherMod.getDefaultLocation(),
			updatedItems: items.filter((i) => i.status === 'updated')
		};
	}

	console.log(
		JSON.stringify(
			{
				csvPath: skipCsv ? null : csvPath,
				startTimesSet,
				startTimesSkipped,
				startTimeUpdates: startTimeUpdates.slice(0, 20),
				stravaWeather,
				openMeteo
			},
			null,
			2
		)
	);
} finally {
	await server.close();
}
