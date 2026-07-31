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

const STRAVA_CONDITION = {
	1: 'clear',
	2: 'mainly clear',
	3: 'cloudy',
	4: 'cloudy',
	5: 'foggy',
	6: 'foggy',
	7: 'drizzle',
	8: 'rain',
	9: 'heavy rain',
	10: 'freezing rain',
	11: 'freezing rain',
	12: 'sleet',
	13: 'sleet',
	14: 'snow',
	15: 'snow',
	16: 'heavy snow',
	17: 'showers',
	18: 'heavy showers',
	19: 'sleet',
	20: 'sleet',
	21: 'snow showers',
	22: 'snow showers',
	23: 'thunderstorms',
	24: 'hail',
	25: 'thunderstorms',
	26: 'thunderstorms',
	27: 'storm'
};

function numAny(raw) {
	const s = String(raw ?? '').trim();
	if (s === '') return null;
	const n = Number(s);
	return Number.isFinite(n) ? n : null;
}

/** Match server formatStravaDeviceWeather — prefer weather-block, else device temps. */
function weatherFromRow(headers, row) {
	const weatherTemp = numAny(getField(headers, row, 'Weather Temperature'));
	const avgTemp = numAny(getField(headers, row, 'Average Temperature'));
	const maxTemp = numAny(getField(headers, row, 'Max Temperature'));
	const condition = numAny(getField(headers, row, 'Weather Condition'));
	const humidityRaw = numAny(getField(headers, row, 'Humidity'));
	const tempC = weatherTemp ?? avgTemp ?? maxTemp ?? null;
	const sky =
		condition != null && Number.isFinite(condition)
			? STRAVA_CONDITION[Math.round(condition)] || ''
			: '';
	let humidityPct = null;
	if (humidityRaw != null) {
		humidityPct =
			humidityRaw >= 0 && humidityRaw <= 1 ? humidityRaw * 100 : humidityRaw;
	}
	const humid =
		humidityPct != null && humidityPct >= 65 ? 'humid' : '';
	const temp =
		tempC != null && Number.isFinite(tempC) ? `${Math.round(tempC)}°C` : '';
	if (!temp && !sky) return '';
	if (temp && humid && sky) return `${temp} ${humid} / ${sky}`;
	if (temp && humid) return `${temp} ${humid}`;
	if (temp && sky) return `${temp}, ${sky}`;
	return temp || sky;
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
	const maxHrRaw =
		Number(getField(headers, row, 'Max Heart Rate', 1)) ||
		Number(getField(headers, row, 'Max Heart Rate', 0));
	const maxHr = Number.isFinite(maxHrRaw) && maxHrRaw > 0 ? Math.round(maxHrRaw) : null;

	const elevRaw = Number(getField(headers, row, 'Elevation Gain'));
	const elevGain = Number.isFinite(elevRaw) && elevRaw > 0 ? Math.round(elevRaw * 10) / 10 : null;

	const calRaw = Number(getField(headers, row, 'Calories'));
	const calories = Number.isFinite(calRaw) && calRaw > 0 ? Math.round(calRaw) : null;

	const workRaw = Number(getField(headers, row, 'Total Work'));
	let kilojoules = null;
	if (Number.isFinite(workRaw) && workRaw > 0) {
		const kj = workRaw >= 1000 ? workRaw / 1000 : workRaw;
		kilojoules = Math.round(kj * 10) / 10;
	}

	const maxSpeedMps = Number(getField(headers, row, 'Max Speed'));
	const maxSpeed =
		Number.isFinite(maxSpeedMps) && maxSpeedMps > 0
			? Math.round(maxSpeedMps * 3.6 * 10) / 10
			: null;

	const elapsedSecs =
		Number(getField(headers, row, 'Elapsed Time', 1)) ||
		Number(getField(headers, row, 'Elapsed Time', 0)) ||
		0;
	const elapsedTime = formatTime(elapsedSecs);

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
	const avgSpeed = Number(getField(headers, row, 'Average Speed'));
	let avgPace = '';
	if (Number.isFinite(avgSpeed) && avgSpeed > 0) {
		const paceSec = 1000 / avgSpeed;
		const m = Math.floor(paceSec / 60);
		const s = Math.round(paceSec % 60);
		avgPace = `${m}:${String(s).padStart(2, '0')}`;
	} else {
		avgPace = formatPace(distanceKm, movingTime);
	}
	const startTime = `${String(parsed.jsDate.getHours()).padStart(2, '0')}:${String(parsed.jsDate.getMinutes()).padStart(2, '0')}`;
	const weather = weatherFromRow(headers, row);

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
		weather,
		surface: '',
		wanted_faster: null,
		distance_km: distanceKm,
		start_time: startTime,
		time,
		elapsed_time: elapsedTime,
		avg_pace: avgPace,
		avg_hr: avgHr,
		max_hr: maxHr,
		elev_gain: elevGain,
		calories,
		kilojoules,
		max_speed: maxSpeed,
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
