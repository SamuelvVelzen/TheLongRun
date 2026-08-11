/**
 * LOCAL one-off: restore the lost 2026-08-10 morning ride by re-importing its GPX (correct NL
 * time + HR series), then delete the 4 orphan route tracks. Idempotent: skips the restore if a
 * matching run already exists. Dry-run by default.
 *
 *   node --env-file=.env scripts/restore-and-clean.mjs
 *   node --env-file=.env scripts/restore-and-clean.mjs --commit
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { neon } from '@neondatabase/serverless';
import { build } from 'esbuild';

const commit = process.argv.includes('--commit');
const GPX = 'C:/Users/svanvelzen/Downloads/Morning_Ride(3).gpx';
const ORPHANS = [
	'a1c9b9ef-e844-4afd-b639-c261c2aea092',
	'0404f14b-c6bb-4e47-882e-62e5f731f885',
	'18013018245',
	'18341765453'
];

const txt = readFileSync(new URL('../.env', import.meta.url), 'utf8');
for (const l of txt.split(/\r?\n/)) {
	const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
	if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const sql = neon(process.env.DATABASE_URL);

await build({
	stdin: {
		contents: `
			export { parseGpx } from '${path.resolve('src/lib/server/gpx.ts').replace(/\\/g, '/')}';
			export { analyticsToProperties } from '${path.resolve('src/lib/splits.ts').replace(/\\/g, '/')}';
			export { dayFromIsoDate, guessSession } from '${path.resolve('src/lib/format.ts').replace(/\\/g, '/')}';
			export { weekNumberForDate } from '${path.resolve('src/lib/plan.ts').replace(/\\/g, '/')}';
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
const { parseGpx, analyticsToProperties, dayFromIsoDate, guessSession, weekNumberForDate } =
	await import(pathToFileURL(path.resolve('_backfill_lib.mjs')).href);

// ---------- restore ----------
const parsed = parseGpx(readFileSync(GPX, 'utf8'));
console.log(`Parsed ${path.basename(GPX)}: ${parsed.date} ${parsed.startClock} ${parsed.distanceKm} km`);

const dupes = await sql`
	SELECT slug FROM runs
	WHERE date = ${parsed.date}
	  AND activity_type = 'ride'
	  AND distance_km IS NOT NULL
	  AND abs(distance_km - ${parsed.distanceKm}) <= 0.25
`;
if (dupes.length) {
	console.log(`Restore skipped — already present as ${dupes.map((d) => d.slug).join(', ')}.`);
} else {
	const day = dayFromIsoDate(parsed.date);
	const week = weekNumberForDate(parsed.date);
	const session = guessSession(day, parsed.distanceKm);
	// unique slug
	let slug = `${parsed.date}-${day.toLowerCase()}`;
	const taken = new Set((await sql`SELECT slug FROM runs WHERE slug LIKE ${slug + '%'}`).map((r) => r.slug));
	if (taken.has(slug)) {
		let i = 2;
		while (taken.has(`${slug}-${i}`)) i++;
		slug = `${slug}-${i}`;
	}
	const id = randomUUID();
	const geojson = {
		type: 'Feature',
		properties: {
			date: parsed.date,
			sport: 'ride',
			distance_km: parsed.distanceKm,
			point_count: parsed.points.length,
			...(parsed.analytics ? analyticsToProperties(parsed.analytics) : {})
		},
		geometry: { type: 'LineString', coordinates: parsed.points.map((p) => [p.lng, p.lat]) }
	};
	const route = `/routes/${id}.json`;
	console.log(`Restore -> run ${slug} + route ${id} (${parsed.startClock})${commit ? '' : ' (dry)'}`);
	if (commit) {
		await sql`INSERT INTO routes (id, geojson) VALUES (${id}, ${JSON.stringify(geojson)}::jsonb)
			ON CONFLICT (id) DO UPDATE SET geojson = EXCLUDED.geojson`;
		await sql`
			INSERT INTO runs (
				slug, date, week, day, activity_type, session, effort, shins, legs, energy, weather, surface,
				wanted_faster, distance_km, start_time, "time", elapsed_time, avg_pace, avg_hr, max_hr,
				elev_gain, calories, kilojoules, max_speed, cadence, shoes, summary_image, splits_image,
				strava_id, route, notes
			) VALUES (
				${slug}, ${parsed.date}, ${week}, ${day}, 'ride', ${session}, null, null, null, null, '', '',
				null, ${parsed.distanceKm}, ${parsed.startClock}, ${parsed.time}, ${parsed.elapsedTime},
				${parsed.avgPace}, ${parsed.avgHr}, ${parsed.maxHr}, ${parsed.elevGain}, null, null,
				${parsed.maxSpeed}, null, '', '', '', '', ${route}, 'Imported from GPX (restored morning ride).'
			) ON CONFLICT (slug) DO NOTHING`;
	}
}

// ---------- delete orphans ----------
console.log(`\nDeleting ${ORPHANS.length} orphan tracks${commit ? '' : ' (dry)'}:`);
for (const id of ORPHANS) {
	// never delete a route that a run points at
	const refs = await sql`
		SELECT slug FROM runs WHERE route LIKE ${'%' + id + '%'} OR strava_id = ${id} LIMIT 1
	`;
	if (refs.length) {
		console.log(`  keep ${id} — referenced by ${refs[0].slug}`);
		continue;
	}
	console.log(`  delete ${id}`);
	if (commit) await sql`DELETE FROM routes WHERE id = ${id}`;
}

console.log(`\n${commit ? 'Done.' : 'Dry run. Re-run with --commit.'}`);
