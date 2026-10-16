/**
 * Import the remote D1 export (.wrangler/d1-backup.sql) into the local dev D1
 * database. Replaces `wrangler d1 execute --local --file=…`, whose SQL splitter
 * chokes on this export (semicolons inside string literals) and fails with
 * "UNIQUE constraint failed: d1_migrations.id". This script feeds the file to
 * SQLite directly and validates the result.
 *
 * Wipes the local D1 first (this is a mirror pull, not a merge). Stops if a
 * vite dev server has the database locked — stop `npm run dev` first.
 */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '..');
const BACKUP = path.join(ROOT, '.wrangler', 'd1-backup.sql');
const OBJ_DIR = path.join(ROOT, '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject');

const TABLES = [
	'activity_group_members',
	'activity_groups',
	'planned_route_links',
	'planned_routes',
	'routes',
	'runs',
	'context',
	'd1_migrations'
];

function fail(message) {
	console.error(`d1:import:local — ${message}`);
	process.exit(1);
}

if (!fs.existsSync(BACKUP)) fail('no .wrangler/d1-backup.sql — run `npm run d1:export` first.');

if (!fs.existsSync(OBJ_DIR)) {
	fail(
		'no local D1 database found yet — start the dev server once (npm run dev) so miniflare creates it, then pull.'
	);
}

const candidates = fs
	.readdirSync(OBJ_DIR)
	.filter((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite');
if (candidates.length !== 1) {
	fail(
		`expected exactly one D1 sqlite file in ${OBJ_DIR}, found ${candidates.length} (${candidates.join(', ')}).`
	);
}
const dbPath = path.join(OBJ_DIR, candidates[0]);

let db;
try {
	db = new DatabaseSync(dbPath);
} catch (e) {
	fail(`could not open ${dbPath}: ${e.message} — is the dev server holding it?`);
}

const sql = fs.readFileSync(BACKUP, 'utf8');

try {
	db.exec('BEGIN');
	for (const table of TABLES) db.exec(`DROP TABLE IF EXISTS ${table}`);
	db.exec(sql);
	const runs = db.prepare('SELECT COUNT(*) AS c, MAX(date) AS latest FROM runs').get();
	db.exec('COMMIT');
	console.log(`Imported ${runs.c} runs into the local D1 (latest activity ${runs.latest}).`);
} catch (e) {
	try {
		db.exec('ROLLBACK');
	} catch {
		/* connection already unusable */
	}
	fail(`import failed: ${e.message}`);
} finally {
	db.close();
}
