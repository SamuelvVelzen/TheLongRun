import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import type { Goals, PlanWeek } from '$lib/types';
import { contextDir, ensureDataDirs } from './paths';

export function readContextFile(name: string): string {
	ensureDataDirs();
	const filepath = path.join(contextDir, name);
	if (!existsSync(filepath)) return '';
	return readFileSync(filepath, 'utf8');
}

export function writeContextFile(name: string, content: string) {
	ensureDataDirs();
	writeFileSync(path.join(contextDir, name), content, 'utf8');
}

export function loadPlan(): PlanWeek[] {
	const raw = readContextFile('plan.json');
	if (!raw) return [];
	return JSON.parse(raw) as PlanWeek[];
}

export function currentPlanWeek(today = new Date()): PlanWeek | null {
	const plan = loadPlan();
	if (!plan.length) return null;
	// Weeks are labeled by start date in dates field like "03 Aug–09 Aug 2026"
	// Prefer matching by week number from race block start: 2026-08-03
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

export function loadGoals(): Goals {
	const raw = readContextFile('goals.md');
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

export function saveGoals(goals: Goals) {
	const front = {
		race_name: goals.race_name,
		race_date: toIsoDate(goals.race_date),
		race_distance_km: goals.race_distance_km,
		time_goal: goals.time_goal,
		primary: goals.primary
	};
	writeContextFile('goals.md', matter.stringify(goals.notes ? `${goals.notes}\n` : '', front));
}

export function loadShoes(): { active: string; notes: string; rotation: string[] } {
	const raw = readContextFile('shoes.md');
	if (!raw) return { active: '', notes: '', rotation: [] };
	const { data, content } = matter(raw);
	return {
		active: String(data.active ?? ''),
		rotation: Array.isArray(data.rotation) ? data.rotation.map(String) : [],
		notes: content.trim()
	};
}
