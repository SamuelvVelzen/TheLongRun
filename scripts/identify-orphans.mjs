import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';
const txt = readFileSync(new URL('../.env', import.meta.url), 'utf8');
for (const l of txt.split(/\r?\n/)) {
	const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
	if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const sql = neon(process.env.DATABASE_URL);
const runs = await sql`SELECT route, strava_id FROM runs`;
const ref = new Set();
for (const r of runs) {
	const id = String(r.route || '').replace(/^.*\//, '').replace(/\.json$/i, '').trim() || String(r.strava_id || '').trim();
	if (id) ref.add(id);
}
const rows = await sql`SELECT id, geojson->'properties' AS p, jsonb_array_length(geojson->'geometry'->'coordinates') AS pts FROM routes`;
for (const row of rows) {
	if (ref.has(String(row.id))) continue;
	const p = row.p || {};
	console.log(`ORPHAN ${row.id}`);
	console.log(`  date=${p.date ?? '?'} sport=${p.sport ?? '?'} distance_km=${p.distance_km ?? '?'} strava_id=${p.strava_id ?? '-'} coords=${row.pts}`);
}
