import { planWeekIndex } from '$lib/plan';
import {
	asShoeNameList,
	emptyShoes,
	normalizeShoeContext,
	shoeKey,
	type ShoeContext
} from '$lib/shoes';
import type { Goals, PlanWeek } from '$lib/types';
import {
	clonePattern,
	DEFAULT_WEEK_PATTERN,
	mixFromPattern,
	normalizeWeekMix,
	normalizeWeekPattern,
	patternFromMix,
	type WeekMix,
	type WeekPattern
} from '$lib/week-mix';
import matter from 'gray-matter';
import { getSql } from './db';

export type AppSettings = {
	hrMax: number | null;
	weekPattern: WeekPattern;
	/** Derived from weekPattern; kept so older readers still see counts. */
	weekMix: WeekMix;
};

export async function readContextFile(name: string): Promise<string> {
	const sql = getSql();
	const rows = (await sql`SELECT content FROM context WHERE name = ${name} LIMIT 1`) as {
		content: string;
	}[];
	return rows.length ? String(rows[0]!.content ?? '') : '';
}

export async function writeContextFile(name: string, content: string): Promise<void> {
	const sql = getSql();
	await sql`
		INSERT INTO context (name, content) VALUES (${name}, ${content})
		ON CONFLICT (name) DO UPDATE SET content = EXCLUDED.content
	`;
}

export async function loadPlan(): Promise<PlanWeek[]> {
	const raw = await readContextFile('plan.json');
	if (!raw) return [];
	try {
		return JSON.parse(raw) as PlanWeek[];
	} catch {
		return [];
	}
}

export async function currentPlanWeek(today = new Date()): Promise<PlanWeek | null> {
	const plan = await loadPlan();
	if (!plan.length) return null;
	const weekIndex = planWeekIndex(today);
	if (weekIndex < 1) return plan[0] ?? null;
	return plan.find((w) => w.week === weekIndex) ?? plan[plan.length - 1] ?? null;
}

/** YAML often parses 2026-09-27 as a Date — keep YYYY-MM-DD strings. */
function toIsoDate(value: unknown, fallback = '2026-09-27'): string {
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		const y = value.getUTCFullYear();
		const m = String(value.getUTCMonth() + 1).padStart(2, '0');
		const d = String(value.getUTCDate()).padStart(2, '0');
		return `${y}-${m}-${d}`;
	}
	const raw = String(value ?? '').trim();
	if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
	const parsed = new Date(raw);
	if (!Number.isNaN(parsed.getTime())) {
		const y = parsed.getUTCFullYear();
		const m = String(parsed.getUTCMonth() + 1).padStart(2, '0');
		const d = String(parsed.getUTCDate()).padStart(2, '0');
		return `${y}-${m}-${d}`;
	}
	return fallback;
}

export async function loadGoals(): Promise<Goals> {
	const raw = await readContextFile('goals.md');
	if (!raw) {
		return {
			race_name: '10K',
			race_date: '2026-09-27',
			race_distance_km: 10,
			primary: [],
			time_goal: '',
			notes: ''
		};
	}
	const { data, content } = matter(raw);
	const primary = Array.isArray(data.primary)
		? data.primary.map(String)
		: String(data.primary ?? '')
				.split('\n')
				.map((s) => s.replace(/^- /, '').trim())
				.filter(Boolean);
	return {
		race_name: String(data.race_name ?? '10K'),
		race_date: toIsoDate(data.race_date),
		race_distance_km: Number(data.race_distance_km ?? 10),
		primary,
		time_goal: String(data.time_goal ?? ''),
		notes: content.trim()
	};
}

export async function saveGoals(goals: Goals): Promise<void> {
	const front = {
		race_name: goals.race_name,
		race_date: toIsoDate(goals.race_date),
		race_distance_km: goals.race_distance_km,
		time_goal: goals.time_goal,
		primary: goals.primary
	};
	await writeContextFile('goals.md', matter.stringify(goals.notes ? `${goals.notes}\n` : '', front));
}

function emptySettings(): AppSettings {
	const weekPattern = clonePattern(DEFAULT_WEEK_PATTERN);
	return { hrMax: null, weekPattern, weekMix: mixFromPattern(weekPattern) };
}

function patternFromSettingsBlob(o: { weekPattern?: unknown; weekMix?: unknown }): WeekPattern {
	if (o.weekPattern != null) return normalizeWeekPattern(o.weekPattern);
	if (o.weekMix != null) return patternFromMix(normalizeWeekMix(o.weekMix));
	return clonePattern(DEFAULT_WEEK_PATTERN);
}

/** App-wide settings persisted as a JSON blob in the context table. */
export async function loadSettings(): Promise<AppSettings> {
	const raw = await readContextFile('settings.json');
	if (!raw) return emptySettings();
	try {
		const o = JSON.parse(raw) as { hrMax?: unknown; weekPattern?: unknown; weekMix?: unknown };
		const n = Number(o.hrMax);
		const weekPattern = patternFromSettingsBlob(o);
		return {
			hrMax: Number.isFinite(n) && n > 0 ? Math.round(n) : null,
			weekPattern,
			weekMix: mixFromPattern(weekPattern)
		};
	} catch {
		return emptySettings();
	}
}

async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
	const current = await loadSettings();
	const weekPattern =
		patch.weekPattern !== undefined ? normalizeWeekPattern(patch.weekPattern) : current.weekPattern;
	const next: AppSettings = {
		hrMax: patch.hrMax !== undefined ? patch.hrMax : current.hrMax,
		weekPattern,
		weekMix: mixFromPattern(weekPattern)
	};
	await writeContextFile('settings.json', JSON.stringify(next));
	return next;
}

export async function saveHrMaxSetting(hrMax: number | null): Promise<void> {
	await saveSettings({ hrMax: hrMax != null && hrMax > 0 ? Math.round(hrMax) : null });
}

export async function saveWeekPatternSetting(pattern: WeekPattern): Promise<WeekPattern> {
	const next = await saveSettings({ weekPattern: pattern });
	return next.weekPattern;
}

export async function loadShoes(): Promise<ShoeContext> {
	const raw = await readContextFile('shoes.md');
	if (!raw) return emptyShoes();
	const { data, content } = matter(raw);
	return normalizeShoeContext({
		active: String(data.active ?? ''),
		rotation: asShoeNameList(data.rotation),
		retired: asShoeNameList(data.retired),
		notes: content.trim()
	});
}

export async function persistShoes(shoes: ShoeContext): Promise<ShoeContext> {
	const next = normalizeShoeContext(shoes);
	await writeContextFile(
		'shoes.md',
		matter.stringify(next.notes ? `${next.notes}\n` : '', {
			active: next.active,
			rotation: next.rotation,
			retired: next.retired
		})
	);
	return next;
}

/** Add a newly logged pair to rotation (or un-retire it). Does not change the daily trainer. */
export async function rememberShoeName(name: string): Promise<void> {
	const n = String(name ?? '')
		.trim()
		.replace(/\s+/g, ' ');
	const k = shoeKey(n);
	if (!k) return;
	const shoes = await loadShoes();
	if (shoeKey(shoes.active) === k) return;
	if (shoes.rotation.some((s) => shoeKey(s) === k)) return;
	await persistShoes({
		...shoes,
		rotation: [...shoes.rotation, n],
		retired: shoes.retired.filter((s) => shoeKey(s) !== k)
	});
}
