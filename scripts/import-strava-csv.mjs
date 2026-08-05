/**
 * One-time bulk import of activities from a Strava export's activities.csv into Neon.
 * Adds only activities NOT already in the DB (matched by Strava Activity ID), mapping the
 * sport to run/walk/ride/swim. Data only — no GPS map (those live in the .fit.gz files).
 *
 *   node --env-file=.env scripts/import-strava-csv.mjs --csv="C:/path/to/activities.csv"
 *   add --commit to actually write (default is a dry run that just reports).
 */
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

const args = process.argv.slice(2);
const commit = args.includes('--commit');
const csvArg = args.find((a) => a.startsWith('--csv='));
const csvPath =
	csvArg?.slice('--csv='.length) ||
	'C:/Users/svanvelzen/Downloads/export_1838793734_5119/activities.csv';

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL is not set.');
	process.exit(1);
}
const sql = neon(url);

// ---------- CSV ----------
function parseCsv(text) {
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

// ---------- units ----------
const numOrNull = (raw) => {
	const n = Number(String(raw ?? '').trim());
	return Number.isFinite(n) && n > 0 ? n : null;
};
const numAny = (raw) => {
	const s = String(raw ?? '').trim();
	if (s === '') return null;
	const n = Number(s);
	return Number.isFinite(n) ? n : null;
};
const roundKm = (m) => Math.round((m / 1000) * 100) / 100;
const roundElev = (m) => Math.round(m * 10) / 10;
const mpsToKmh = (mps) => (Number.isFinite(mps) && mps > 0 ? Math.round(mps * 3.6 * 10) / 10 : null);

function formatDuration(total) {
	if (!Number.isFinite(total) || total <= 0) return '';
	const s = Math.round(total);
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = s % 60;
	if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
	return `${m}:${String(sec).padStart(2, '0')}`;
}
function formatPace(distanceMeters, movingSeconds) {
	if (!distanceMeters || !movingSeconds) return '';
	const pace = movingSeconds / (distanceMeters / 1000);
	if (!Number.isFinite(pace) || pace <= 0) return '';
	const m = Math.floor(pace / 60);
	const s = Math.round(pace % 60);
	return `${m}:${String(s).padStart(2, '0')}`;
}
function formatPaceFromSpeedMps(mps) {
	if (!Number.isFinite(mps) || mps <= 0) return '';
	return formatPace(1000, 1000 / mps);
}

function parseLocal(raw) {
	const d = new Date(raw);
	if (Number.isNaN(d.getTime())) return { date: '', start_time: '' };
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	const hh = String(d.getHours()).padStart(2, '0');
	const mm = String(d.getMinutes()).padStart(2, '0');
	return { date: `${y}-${m}-${day}`, start_time: `${hh}:${mm}` };
}
function dayFromIsoDate(iso) {
	const d = new Date(`${iso}T12:00:00`);
	if (Number.isNaN(d.getTime())) return 'Tuesday';
	return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()];
}
function weekNumberForDate(dateStr) {
	const start = new Date('2026-08-03T00:00:00');
	const d = new Date(`${dateStr}T00:00:00`);
	if (Number.isNaN(d.getTime())) return null;
	const idx = Math.floor((d.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
	return idx < 1 || idx > 8 ? null : idx;
}

function mapSport(type) {
	const t = String(type || '')
		.trim()
		.toLowerCase()
		.replace(/[\s_-]/g, '');
	if (['run', 'trailrun', 'treadmillrun', 'virtualrun', 'treadmill'].includes(t)) return 'run';
	if (['walk', 'hike'].includes(t)) return 'walk';
	if (
		['ride', 'virtualride', 'ebikeride', 'mountainbikeride', 'gravelride', 'handcycle'].includes(t)
	)
		return 'ride';
	if (['swim', 'openwaterswim', 'lapswimming'].includes(t)) return 'swim';
	return null;
}
function guessSession(day, distanceKm, sport) {
	if (sport !== 'run') return 'other';
	if (day === 'Sunday') return 'long';
	if (distanceKm != null && distanceKm >= 11) return 'long';
	if (day === 'Friday') return 'quality';
	return 'easy';
}

function distanceKmFromRow(headers, row) {
	const d0 = Number(getField(headers, row, 'Distance', 0));
	const d1 = Number(getField(headers, row, 'Distance', 1));
	if (Number.isFinite(d1) && d1 > 100) return roundKm(d1);
	if (Number.isFinite(d0) && d0 > 0) return d0 > 100 ? roundKm(d0) : Math.round(d0 * 100) / 100;
	return null;
}
function cadenceFromRow(headers, row) {
	let c = Number(getField(headers, row, 'Average Cadence'));
	if (!Number.isFinite(c) || c <= 0) return null;
	if (c < 120) c = c * 2;
	return Math.round(c);
}

function rowToRecord(headers, row) {
	const strava_id = String(getField(headers, row, 'Activity ID')).trim();
	if (!strava_id) return null;
	const sport = mapSport(getField(headers, row, 'Activity Type'));
	if (!sport) return { skip: true, strava_id, type: getField(headers, row, 'Activity Type') };

	const { date, start_time } = parseLocal(getField(headers, row, 'Activity Date'));
	if (!date) return { skip: true, strava_id, type: 'nodate' };

	const distance_km = distanceKmFromRow(headers, row);
	const moving =
		numOrNull(getField(headers, row, 'Moving Time', 0)) ??
		numOrNull(getField(headers, row, 'Moving Time', 1));
	const elapsed =
		numOrNull(getField(headers, row, 'Elapsed Time', 1)) ??
		numOrNull(getField(headers, row, 'Elapsed Time', 0));
	const avgSpeed = numOrNull(getField(headers, row, 'Average Speed'));
	let avg_pace = avgSpeed != null ? formatPaceFromSpeedMps(avgSpeed) : '';
	if (!avg_pace && distance_km != null && moving != null) avg_pace = formatPace(distance_km * 1000, moving);
	const avgHr = numOrNull(getField(headers, row, 'Average Heart Rate'));
	const maxHr =
		numOrNull(getField(headers, row, 'Max Heart Rate', 1)) ??
		numOrNull(getField(headers, row, 'Max Heart Rate', 0));
	const temp = numAny(getField(headers, row, 'Weather Temperature')) ?? numAny(getField(headers, row, 'Average Temperature'));
	const name = getField(headers, row, 'Activity Name') || '';
	const desc = getField(headers, row, 'Activity Description') || '';
	const day = dayFromIsoDate(date);

	return {
		strava_id,
		sport,
		record: {
			date,
			week: weekNumberForDate(date),
			day,
			activity_type: sport,
			session: guessSession(day, distance_km, sport),
			distance_km,
			start_time,
			time: moving != null ? formatDuration(moving) : '',
			elapsed_time: elapsed != null ? formatDuration(elapsed) : '',
			avg_pace,
			avg_hr: avgHr != null ? Math.round(avgHr) : null,
			max_hr: maxHr != null ? Math.round(maxHr) : null,
			elev_gain: numOrNull(getField(headers, row, 'Elevation Gain')) != null ? roundElev(numOrNull(getField(headers, row, 'Elevation Gain'))) : null,
			calories: numOrNull(getField(headers, row, 'Calories')) != null ? Math.round(numOrNull(getField(headers, row, 'Calories'))) : null,
			max_speed: numOrNull(getField(headers, row, 'Max Speed')) != null ? mpsToKmh(numOrNull(getField(headers, row, 'Max Speed'))) : null,
			cadence: cadenceFromRow(headers, row),
			weather: temp != null ? `${Math.round(temp)}°C` : '',
			notes: [name, desc].filter(Boolean).join(' — ') || 'Imported from Strava CSV.'
		}
	};
}

async function insertRun(slug, r) {
	await sql`
		INSERT INTO runs (
			slug, date, week, day, activity_type, session, weather, distance_km, start_time, "time",
			elapsed_time, avg_pace, avg_hr, max_hr, elev_gain, calories, max_speed, cadence,
			strava_id, notes
		) VALUES (
			${slug}, ${r.date}, ${r.week}, ${r.day}, ${r.activity_type}, ${r.session}, ${r.weather},
			${r.distance_km}, ${r.start_time}, ${r.time}, ${r.elapsed_time}, ${r.avg_pace}, ${r.avg_hr},
			${r.max_hr}, ${r.elev_gain}, ${r.calories}, ${r.max_speed}, ${r.cadence}, ${r.stravaId}, ${r.notes}
		)
		ON CONFLICT (slug) DO NOTHING
	`;
}

// ---------- run ----------
const rows = parseCsv(readFileSync(csvPath, 'utf8'));
const headers = rows[0];
console.log(`Parsed ${rows.length - 1} activities from ${csvPath}`);

const existing = await sql`SELECT slug, strava_id FROM runs`;
const existingIds = new Set(existing.map((r) => String(r.strava_id)).filter(Boolean));
const usedSlugs = new Set(existing.map((r) => String(r.slug)));

const byType = {};
let added = 0;
let skippedExisting = 0;
let skippedType = 0;
const addedRows = [];

for (let i = 1; i < rows.length; i++) {
	const parsed = rowToRecord(headers, rows[i]);
	if (!parsed) continue;
	if (parsed.skip) {
		skippedType++;
		continue;
	}
	if (existingIds.has(parsed.strava_id)) {
		skippedExisting++;
		continue;
	}
	let slug = `${parsed.record.date}-${parsed.record.day.toLowerCase()}`;
	if (usedSlugs.has(slug)) slug = `${slug}-${parsed.strava_id}`;
	usedSlugs.add(slug);
	existingIds.add(parsed.strava_id);
	byType[parsed.sport] = (byType[parsed.sport] || 0) + 1;
	added++;
	addedRows.push({ slug, r: { ...parsed.record, stravaId: parsed.strava_id } });
}

console.log(`\nWould add: ${added}  (skipped ${skippedExisting} already-in-DB, ${skippedType} unsupported types)`);
console.log('By sport:', byType);

if (!commit) {
	console.log('\nDry run. Re-run with --commit to write these to Neon.');
} else {
	for (const { slug, r } of addedRows) await insertRun(slug, r);
	console.log(`\nInserted ${addedRows.length} activities into Neon.`);
}
