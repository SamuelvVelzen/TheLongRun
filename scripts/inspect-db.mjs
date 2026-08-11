// Read-only DB inspection: same-day activities, likely duplicates, orphan routes,
// and which runs already have a stored HR series. Makes NO changes.
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

function loadEnv() {
	const txt = readFileSync(new URL('../.env', import.meta.url), 'utf8');
	for (const line of txt.split(/\r?\n/)) {
		const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
		if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
	}
}
loadEnv();

const sql = neon(process.env.DATABASE_URL);

function routeIdOf(run) {
	const fromRoute = String(run.route || '')
		.trim()
		.replace(/^.*\//, '')
		.replace(/\?.*$/, '')
		.replace(/\.json$/i, '');
	if (fromRoute) return fromRoute;
	return String(run.strava_id || '').trim() || null;
}

const runs = await sql`SELECT slug, date, activity_type, start_time, distance_km, "time", avg_hr, max_hr, route, strava_id FROM runs ORDER BY date, start_time`;
const routes = await sql`SELECT id FROM routes`;

console.log(`\n=== TOTALS ===`);
console.log(`runs: ${runs.length} · routes: ${routes.length}`);

// Same-day: more than one activity on a date
const byDate = new Map();
for (const r of runs) {
	if (!byDate.has(r.date)) byDate.set(r.date, []);
	byDate.get(r.date).push(r);
}
const multi = [...byDate.entries()].filter(([, rs]) => rs.length > 1);
console.log(`\n=== DAYS WITH >1 ACTIVITY (${multi.length}) ===`);
for (const [date, rs] of multi) {
	console.log(
		`${date}: ` +
			rs
				.map(
					(r) =>
						`${r.slug} [${r.activity_type} ${r.start_time || '--:--'} ${r.distance_km ?? '?'}km hr${r.avg_hr ?? '-'}/${r.max_hr ?? '-'}]`
				)
				.join('  |  ')
	);
}

// Likely true duplicates: same date + same start_time + same distance (rounded)
console.log(`\n=== LIKELY DUPLICATES (same date+start+distance) ===`);
let dupCount = 0;
for (const [date, rs] of multi) {
	const seen = new Map();
	for (const r of rs) {
		const key = `${r.start_time}|${r.activity_type}|${Math.round((r.distance_km ?? 0) * 100)}`;
		if (!seen.has(key)) seen.set(key, []);
		seen.get(key).push(r.slug);
	}
	for (const [key, slugs] of seen) {
		if (slugs.length > 1) {
			dupCount++;
			console.log(`${date} ${key} -> ${slugs.join(', ')}`);
		}
	}
}
if (!dupCount) console.log('(none)');

// Orphan routes: route ids not referenced by any run
const referenced = new Set(runs.map(routeIdOf).filter(Boolean));
const orphans = routes.map((r) => r.id).filter((id) => !referenced.has(id));
console.log(`\n=== ORPHAN ROUTES (${orphans.length}) ===`);
console.log(orphans.length ? orphans.slice(0, 40).join('\n') : '(none)');

// HR-series coverage among runs that have a route
const withRoute = runs.filter((r) => routeIdOf(r));
let hasSeries = 0;
for (const r of withRoute) {
	const id = routeIdOf(r);
	const rows = await sql`SELECT (geojson->'properties'->'hr_series') AS s FROM routes WHERE id = ${id} LIMIT 1`;
	const s = rows[0]?.s;
	if (Array.isArray(s) && s.length > 0) hasSeries++;
}
console.log(`\n=== HR SERIES COVERAGE ===`);
console.log(`runs with a route: ${withRoute.length} · with hr_series stored: ${hasSeries} · needing backfill: ${withRoute.length - hasSeries}`);
