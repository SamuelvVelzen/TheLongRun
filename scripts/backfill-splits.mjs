/**
 * Backfill per-km splits, HR zones, and km markers onto existing route GeoJSONs
 * by re-parsing Strava FIT exports.
 *
 *   node scripts/backfill-splits.mjs
 *   node scripts/backfill-splits.mjs --force
 *   node scripts/backfill-splits.mjs --export=c:/path/to/strava-export
 *   node scripts/backfill-splits.mjs --only=20624584971,20591627919
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const force = args.includes('--force');
const onlyArg = args.find((a) => a.startsWith('--only='));
const onlyIds = onlyArg
	? onlyArg
			.slice('--only='.length)
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean)
	: undefined;
const exportArg = args.find((a) => a.startsWith('--export='));
const exportDir =
	exportArg?.slice('--export='.length) ||
	'c:/Users/svanvelzen/Downloads/export_1838793734_5119';

if (!existsSync(exportDir)) {
	console.error(`Export directory not found: ${exportDir}`);
	process.exit(1);
}

const server = await createServer({
	root,
	server: { middlewareMode: true },
	appType: 'custom'
});

try {
	const mod = await server.ssrLoadModule('/src/lib/server/backfill-splits.ts');
	const result = await mod.backfillRouteSplits({ exportDir, force, onlyIds });
	const updated = result.items.filter((i) => i.status === 'updated');
	console.log(
		JSON.stringify(
			{
				exportDir,
				force,
				onlyIds: onlyIds ?? null,
				updated: result.updated,
				skipped: result.skipped,
				failed: result.failed,
				sample: updated.slice(0, 8)
			},
			null,
			2
		)
	);
} finally {
	await server.close();
}
