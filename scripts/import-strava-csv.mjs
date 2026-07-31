import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const runsDir = path.join(root, 'data', 'runs');
const csvPath =
	process.argv[2] ||
	'c:/Users/svanvelzen/Downloads/export_1838793734_5119/activities.csv';

function parseCSV(text) {
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

function isRunType(type) {
	const t = String(type || '').trim().toLowerCase();
	if (!t) return false;
	const exclude = [
		'walk',
		'hike',
		'ride',
		'bicycle',
		'bike',
		'cycling',
		'e-bike',
		'ebike',
		'mountain bike',
		'gravel ride',
		'virtual ride',
		'swim',
		'workout',
		'weight training',
		'yoga',
		'elliptical',
		'rowing',
		'ski',
		'snowboard'
	];
	if (exclude.some((x) => t === x || t.includes(x))) return false;
	// Include Run, Trail Run, Virtual Run, Track Run, etc.
	if (/\brun\b/.test(t)) return true;
	return false;
}

function parseActivityDate(raw) {
	// e.g. "Jul 28, 2026, 2:40:19 PM"
	const d = new Date(raw);
	if (Number.isNaN(d.getTime())) return null;
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return { date: `${y}-${m}-${day}`, weekdayIndex: d.getDay(), jsDate: d };
}

const WEEKDAYS = [
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday'
];

function preferredDayName(weekdayIndex) {
	return WEEKDAYS[weekdayIndex];
}

function guessSession(dayName, distanceKm) {
	if (dayName === 'Sunday') return 'long';
	if (dayName === 'Friday') return 'quality';
	if (distanceKm != null && distanceKm >= 12) return 'long';
	return 'easy';
}

function formatTime(seconds) {
	const s = Math.round(Number(seconds));
	if (!Number.isFinite(s) || s <= 0) return '';
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = s % 60;
	if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
	return `${m}:${String(sec).padStart(2, '0')}`;
}

function formatPace(distanceKm, movingSeconds) {
	const dist = Number(distanceKm);
	const secs = Number(movingSeconds);
	if (!Number.isFinite(dist) || dist <= 0 || !Number.isFinite(secs) || secs <= 0) return '';
	const paceSec = secs / dist;
	const m = Math.floor(paceSec / 60);
	const s = Math.round(paceSec % 60);
	return `${m}:${String(s).padStart(2, '0')}`;
}

function yamlScalar(value) {
	if (value === null || value === undefined) return 'null';
	if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
	if (typeof value === 'boolean') return value ? 'true' : 'false';
	const s = String(value);
	if (s === '') return "''";
	if (/[:#{}[\],&*?|>!%@`]/.test(s) || /^\s|\s$/.test(s) || /'/.test(s)) {
		return `'${s.replace(/'/g, "''")}'`;
	}
	// quote dates and times that look special
	if (/^\d/.test(s) || s.includes(':')) return `'${s}'`;
	return s;
}

function buildMarkdown(front, notes) {
	const lines = ['---'];
	for (const [k, v] of Object.entries(front)) {
		lines.push(`${k}: ${yamlScalar(v)}`);
	}
	lines.push('---');
	lines.push('');
	lines.push(notes.trim());
	lines.push('');
	return lines.join('\n');
}

function existingStravaIds() {
	const ids = new Set();
	if (!existsSync(runsDir)) return ids;
	for (const f of readdirSync(runsDir)) {
		if (!f.endsWith('.md')) continue;
		const raw = readFileSync(path.join(runsDir, f), 'utf8');
		const m = raw.match(/^strava_id:\s*['"]?([^'"\n]*)['"]?\s*$/m);
		if (m && m[1] && m[1].trim()) ids.add(m[1].trim());
	}
	return ids;
}

function existingSlugs() {
	const slugs = new Set();
	if (!existsSync(runsDir)) return slugs;
	for (const f of readdirSync(runsDir)) {
		if (f.endsWith('.md')) slugs.add(f.replace(/\.md$/, ''));
	}
	return slugs;
}

const text = readFileSync(csvPath, 'utf8');
const rows = parseCSV(text);
const headers = rows[0];

const types = {};
let skippedNonRun = 0;
let skippedDupe = 0;
let imported = 0;
const importedFiles = [];
const knownIds = existingStravaIds();
const knownSlugs = existingSlugs();

for (let r = 1; r < rows.length; r++) {
	const row = rows[r];
	if (!row || row.length < 2) continue;
	const activityType = getField(headers, row, 'Activity Type');
	types[activityType || '(empty)'] = (types[activityType || '(empty)'] || 0) + 1;

	if (!isRunType(activityType)) {
		skippedNonRun++;
		continue;
	}

	const activityId = String(getField(headers, row, 'Activity ID')).trim();
	if (activityId && knownIds.has(activityId)) {
		skippedDupe++;
		continue;
	}

	const name = getField(headers, row, 'Activity Name') || 'Run';
	const dateRaw = getField(headers, row, 'Activity Date');
	const parsed = parseActivityDate(dateRaw);
	if (!parsed) {
		console.warn('Could not parse date for activity', activityId, dateRaw);
		skippedNonRun++;
		continue;
	}

	// Distance: first column is often km (small), second occurrence meters.
	const dist0 = Number(getField(headers, row, 'Distance', 0));
	const dist1 = Number(getField(headers, row, 'Distance', 1));
	let distanceKm = null;
	if (Number.isFinite(dist1) && dist1 > 100) {
		distanceKm = Math.round((dist1 / 1000) * 100) / 100;
	} else if (Number.isFinite(dist0) && dist0 > 0) {
		// if > 100 treat as meters
		distanceKm =
			dist0 > 100
				? Math.round((dist0 / 1000) * 100) / 100
				: Math.round(dist0 * 100) / 100;
	}

	const movingTime =
		Number(getField(headers, row, 'Moving Time', 0)) ||
		Number(getField(headers, row, 'Moving Time', 1)) ||
		0;

	const avgHrRaw = Number(getField(headers, row, 'Average Heart Rate'));
	const avgHr = Number.isFinite(avgHrRaw) && avgHrRaw > 0 ? Math.round(avgHrRaw) : null;

	// Strava Average Cadence is often one-foot; store as reported, optionally *2 if clearly one-foot
	let cadenceRaw = Number(getField(headers, row, 'Average Cadence'));
	let cadence = null;
	if (Number.isFinite(cadenceRaw) && cadenceRaw > 0) {
		// one-foot cadence typically ~80-95; SPM total ~160-190
		if (cadenceRaw < 120) cadenceRaw = cadenceRaw * 2;
		cadence = Math.round(cadenceRaw);
	}

	const day = preferredDayName(parsed.weekdayIndex);
	const session = guessSession(day, distanceKm);
	const time = formatTime(movingTime);
	const avgPace = formatPace(distanceKm, movingTime);

	let slug = `${parsed.date}-${day.toLowerCase()}`;
	if (knownSlugs.has(slug)) {
		slug = `${parsed.date}-${day.toLowerCase()}-${activityId}`;
	}

	const front = {
		date: parsed.date,
		week: null,
		day,
		session,
		effort: null,
		shins: null,
		legs: null,
		energy: null,
		weather: '',
		surface: '',
		wanted_faster: null,
		distance_km: distanceKm,
		time,
		avg_pace: avgPace,
		avg_hr: avgHr,
		cadence,
		shoes: '',
		summary_image: '',
		splits_image: '',
		strava_id: activityId
	};

	const notes = `${name}\n\nImported from Strava CSV (strava:${activityId}).`;
	const md = buildMarkdown(front, notes);
	const filepath = path.join(runsDir, `${slug}.md`);
	writeFileSync(filepath, md, 'utf8');

	knownIds.add(activityId);
	knownSlugs.add(slug);
	imported++;
	importedFiles.push(slug);
}

console.log(JSON.stringify({
	types,
	imported,
	skippedNonRun,
	skippedDupe,
	importedFiles
}, null, 2));
