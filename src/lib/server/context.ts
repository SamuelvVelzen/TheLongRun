import matter from 'gray-matter';
import type { Goals, PlanWeek } from '$lib/types';
import { getSql } from './db';

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
	// Weeks are labeled by start date; race block starts 2026-08-03.
	const start = new Date('2026-08-03T00:00:00');
	const ms = today.getTime() - start.getTime();
	const weekIndex = Math.floor(ms / (7 * 24 * 60 * 60 * 1000)) + 1;
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

/** App-wide settings persisted as a JSON blob in the context table. */
export async function loadSettings(): Promise<{ hrMax: number | null }> {
	const raw = await readContextFile('settings.json');
	if (!raw) return { hrMax: null };
	try {
		const o = JSON.parse(raw) as { hrMax?: unknown };
		const n = Number(o.hrMax);
		return { hrMax: Number.isFinite(n) && n > 0 ? Math.round(n) : null };
	} catch {
		return { hrMax: null };
	}
}

export async function saveHrMaxSetting(hrMax: number | null): Promise<void> {
	const current = await loadSettings();
	const next = { ...current, hrMax: hrMax != null && hrMax > 0 ? Math.round(hrMax) : null };
	await writeContextFile('settings.json', JSON.stringify(next));
}

export async function loadShoes(): Promise<{ active: string; notes: string; rotation: string[] }> {
	const raw = await readContextFile('shoes.md');
	if (!raw) return { active: '', notes: '', rotation: [] };
	const { data, content } = matter(raw);
	return {
		active: String(data.active ?? ''),
		rotation: Array.isArray(data.rotation) ? data.rotation.map(String) : [],
		notes: content.trim()
	};
}
