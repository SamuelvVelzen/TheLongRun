/**
 * LOCAL backfill: tag existing runs with a country derived (offline) from their route's start
 * coordinate. Idempotent, dry-run by default.
 *
 *   node --env-file=.env scripts/backfill-country.mjs
 *   node --env-file=.env scripts/backfill-country.mjs --commit
 */
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';
import { iso1A2Code } from '@rapideditor/country-coder';

const commit = process.argv.includes('--commit');
const t = readFileSync(new URL('../.env', import.meta.url), 'utf8');
for (const l of t.split(/\r?\n/)) {
	const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
	if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const sql = neon(process.env.DATABASE_URL);
const names = new Intl.DisplayNames(['en'], { type: 'region' });

const runs = await sql`SELECT slug, route, strava_id, country FROM runs`;
let updated = 0,
	noRoute = 0,
	unchanged = 0;
const tally = {};
for (const r of runs) {
	const id =
		String(r.route || '').replace(/^.*\//, '').replace(/\.json$/i, '').trim() ||
		String(r.strava_id || '').trim();
	if (!id) {
		noRoute++;
		continue;
	}
	const rows = await sql`SELECT geojson->'geometry'->'coordinates'->0 AS first FROM routes WHERE id = ${id} LIMIT 1`;
	const first = rows[0]?.first;
	if (!Array.isArray(first) || first.length < 2) {
		noRoute++;
		continue;
	}
	const code = iso1A2Code([Number(first[0]), Number(first[1])]);
	const country = code ? names.of(code) ?? code : '';
	tally[country || '(none)'] = (tally[country || '(none)'] || 0) + 1;
	if (country && country !== r.country) {
		if (commit) await sql`UPDATE runs SET country = ${country} WHERE slug = ${r.slug}`;
		updated++;
	} else {
		unchanged++;
	}
}
console.log('by country:', tally);
console.log(`${commit ? 'Updated' : 'Would update'}: ${updated}  (unchanged ${unchanged}, no route/coords ${noRoute})`);
if (!commit) console.log('Dry run. Re-run with --commit.');
