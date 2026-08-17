/**
 * LOCAL backfill: reverse-geocode each run's start coordinate (Nominatim) to country / province /
 * municipality. Throttled to ~1 request/sec per Nominatim's usage policy. Idempotent; dry-run by
 * default. Only fills runs that have a route track with coordinates.
 *
 *   node --env-file=.env scripts/backfill-location.mjs
 *   node --env-file=.env scripts/backfill-location.mjs --commit
 */
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

const commit = process.argv.includes('--commit');
const t = readFileSync(new URL('../.env', import.meta.url), 'utf8');
for (const l of t.split(/\r?\n/)) {
	const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
	if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const sql = neon(process.env.DATABASE_URL);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function reverse(lat, lng) {
	const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=12&accept-language=en`;
	const res = await fetch(url, {
		headers: { 'User-Agent': 'the-long-run/1.0 (personal training tracker backfill)' }
	});
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const a = (await res.json())?.address ?? {};
	return {
		country: a.country ?? '',
		province: a.state ?? a.province ?? a.region ?? '',
		place: a.city ?? a.town ?? a.village ?? a.municipality ?? a.suburb ?? a.county ?? ''
	};
}

const runs = await sql`SELECT slug, route, strava_id, country, province, place FROM runs ORDER BY date`;
let updated = 0,
	noCoord = 0,
	skipped = 0,
	errors = 0;

for (const r of runs) {
	const id =
		String(r.route || '').replace(/^.*\//, '').replace(/\.json$/i, '').trim() ||
		String(r.strava_id || '').trim();
	if (!id) {
		noCoord++;
		continue;
	}
	// Skip if already fully tagged (idempotent, saves API calls).
	if (r.country && r.province && r.place) {
		skipped++;
		continue;
	}
	const rows = await sql`SELECT geojson->'geometry'->'coordinates'->0 AS first FROM routes WHERE id = ${id} LIMIT 1`;
	const first = rows[0]?.first;
	if (!Array.isArray(first) || first.length < 2) {
		noCoord++;
		continue;
	}
	try {
		const g = await reverse(Number(first[1]), Number(first[0]));
		console.log(`${r.slug}: ${g.place || '—'}, ${g.province || '—'}, ${g.country || '—'}${commit ? '' : ' (dry)'}`);
		if (commit) {
			await sql`UPDATE runs SET country = ${g.country}, province = ${g.province}, place = ${g.place} WHERE slug = ${r.slug}`;
		}
		updated++;
	} catch (e) {
		errors++;
		console.warn(`  ${r.slug}: ${e instanceof Error ? e.message : e}`);
	}
	await sleep(1100); // Nominatim fair-use: ~1 req/sec
}

console.log(`\n${commit ? 'Updated' : 'Would update'}: ${updated}  (already tagged ${skipped}, no coords ${noCoord}, errors ${errors})`);
if (!commit) console.log('Dry run. Re-run with --commit.');
