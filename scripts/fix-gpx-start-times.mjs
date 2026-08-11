/**
 * LOCAL fix for start times stored 2h early on GPX runs imported before the timezone fix.
 * Re-parses each GPX (now converting to Europe/Amsterdam), matches the run by date+distance
 * (unambiguous only), and corrects `start_time` if it differs. Never changes slugs/dates/routes.
 *
 *   node --env-file=.env scripts/fix-gpx-start-times.mjs --gpx="C:/path/to/dir"            # dry run
 *   node --env-file=.env scripts/fix-gpx-start-times.mjs --gpx="C:/path/to/dir" --commit
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { neon } from '@neondatabase/serverless';
import { build } from 'esbuild';

const args = process.argv.slice(2);
const commit = args.includes('--commit');
const gpxDir = args.find((a) => a.startsWith('--gpx='))?.slice('--gpx='.length) || '';
if (!gpxDir) {
	console.error('Pass --gpx="<dir>".');
	process.exit(1);
}
const txt = readFileSync(new URL('../.env', import.meta.url), 'utf8');
for (const l of txt.split(/\r?\n/)) {
	const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
	if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const sql = neon(process.env.DATABASE_URL);

await build({
	stdin: {
		contents: `export { parseGpx } from '${path.resolve('src/lib/server/gpx.ts').replace(/\\/g, '/')}';`,
		resolveDir: process.cwd(),
		loader: 'ts'
	},
	bundle: true,
	format: 'esm',
	platform: 'node',
	outfile: '_backfill_lib.mjs',
	alias: { $lib: path.resolve('src/lib') }
});
const { parseGpx } = await import(pathToFileURL(path.resolve('_backfill_lib.mjs')).href);

const runs = await sql`SELECT slug, date, start_time, distance_km FROM runs`;
if (!existsSync(gpxDir)) {
	console.error(`Not found: ${gpxDir}`);
	process.exit(1);
}
const files = readdirSync(gpxDir).filter((f) => /\.gpx$/i.test(f));
let fixed = 0,
	same = 0,
	skipped = 0;
const claimed = new Set();
for (const file of files) {
	const parsed = parseGpx(readFileSync(path.join(gpxDir, file), 'utf8'));
	if (!parsed.date || !parsed.startClock) {
		skipped++;
		continue;
	}
	const cands = runs.filter(
		(r) =>
			r.date === parsed.date &&
			parsed.distanceKm != null &&
			r.distance_km != null &&
			Math.abs(r.distance_km - parsed.distanceKm) <= 0.25
	);
	const run = cands.length === 1 ? cands[0] : null;
	if (!run || claimed.has(run.slug)) {
		skipped++;
		continue;
	}
	claimed.add(run.slug);
	if (run.start_time === parsed.startClock) {
		same++;
		continue;
	}
	console.log(`${run.slug}: ${run.start_time || '(none)'} -> ${parsed.startClock}${commit ? '' : ' (dry)'}`);
	if (commit) await sql`UPDATE runs SET start_time = ${parsed.startClock} WHERE slug = ${run.slug}`;
	fixed++;
}
console.log(`\n${commit ? 'Fixed' : 'Would fix'}: ${fixed}  (already correct ${same}, skipped ${skipped})`);
if (!commit) console.log('Dry run. Re-run with --commit to write.');
