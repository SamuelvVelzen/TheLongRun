/**
 * Backfill Strava CSV metrics onto runs that have `strava_id`.
 *
 *   node scripts/backfill-strava-metrics.mjs
 *   node scripts/backfill-strava-metrics.mjs path/to/activities.csv
 */
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const csvPath =
	process.argv[2] ||
	'c:/Users/svanvelzen/Downloads/export_1838793734_5119/activities.csv';

const server = await createServer({
	server: { middlewareMode: true },
	appType: 'custom'
});

try {
	const csvText = readFileSync(csvPath, 'utf8');
	const mod = await server.ssrLoadModule('/src/lib/server/strava-csv.ts');
	const result = mod.backfillRunsFromCsv(csvText);
	const updated = result.items.filter((i) => i.status === 'updated');
	console.log(
		JSON.stringify(
			{
				csvPath,
				updated: result.updated,
				skipped: result.skipped,
				missing: result.missing,
				sample: updated.slice(0, 5).map((i) => ({
					slug: i.slug,
					strava_id: i.strava_id,
					fields: i.fields
				}))
			},
			null,
			2
		)
	);
} finally {
	await server.close();
}
