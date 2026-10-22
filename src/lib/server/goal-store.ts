import { normalizeActivityType } from '$lib/activity';
import { goalIdFrom, pickSoonestOpenGoal, stampGoalsByDate } from '$lib/goals';
import type { Goal, PlanWeek } from '$lib/types';
import { splitFrontmatter } from './frontmatter';
import { readContextFile, writeContextFile } from './context-io';

export type GoalStore = { goals: Goal[] };

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

function emptyStore(): GoalStore {
	return { goals: [] };
}

function parseStore(raw: string): GoalStore | null {
	try {
		const o = JSON.parse(raw) as { goals?: unknown };
		if (!Array.isArray(o.goals)) return null;
		const goals: Goal[] = [];
		for (const item of o.goals) {
			const g = normalizeStoredGoal(item);
			if (g) goals.push(g);
		}
		return { goals };
	} catch {
		return null;
	}
}

function normalizeStoredGoal(item: unknown): Goal | null {
	if (!item || typeof item !== 'object') return null;
	const o = item as Record<string, unknown>;
	const name = String(o.name ?? o.race_name ?? '').trim();
	const dateRaw = toIsoDate(o.date ?? o.race_date, '');
	const date = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : '';
	const horizonRaw = String(o.horizon ?? '')
		.trim()
		.slice(0, 7);
	const horizon = /^\d{4}-\d{2}$/.test(horizonRaw) ? horizonRaw : date ? date.slice(0, 7) : '';
	if (!name && !date) return null;
	const distance = Number(o.distance_km ?? o.race_distance_km ?? 10);
	const primary = Array.isArray(o.primary)
		? o.primary
				.map(String)
				.map((s) => s.trim())
				.filter(Boolean)
		: [];
	const status: Goal['status'] =
		o.status === 'done' ? 'done' : o.status === 'upcoming' ? 'upcoming' : 'active';
	const result =
		o.result && typeof o.result === 'object'
			? {
					activity_slug: String((o.result as { activity_slug?: unknown }).activity_slug ?? ''),
					date: String((o.result as { date?: unknown }).date ?? date),
					time: String((o.result as { time?: unknown }).time ?? ''),
					distance_km:
						typeof (o.result as { distance_km?: unknown }).distance_km === 'number'
							? (o.result as { distance_km: number }).distance_km
							: null,
					pace: String((o.result as { pace?: unknown }).pace ?? '')
				}
			: null;
	const plan = Array.isArray(o.plan) ? (o.plan as PlanWeek[]) : null;
	const planStart = date ? toIsoDate(o.plan_start, date) : toIsoDate(o.plan_start, '');
	return {
		id: String(o.id ?? '').trim() || goalIdFrom(name || 'race', date || horizon),
		name: name || 'Race',
		date,
		horizon,
		distance_km: Number.isFinite(distance) && distance > 0 ? distance : 10,
		sport: normalizeActivityType(String(o.sport ?? 'run') || 'run'),
		time_goal: String(o.time_goal ?? ''),
		primary,
		notes: String(o.notes ?? '').trim(),
		url: String(o.url ?? '').trim(),
		itinerary_url: String(o.itinerary_url ?? '').trim(),
		plan_start: planStart,
		status,
		result,
		plan,
		bib_number: String(o.bib_number ?? '').trim(),
		wave: String(o.wave ?? '').trim(),
		start_time: String(o.start_time ?? '').trim(),
		result_url: String(o.result_url ?? '').trim(),
		medal_notes: String(o.medal_notes ?? '').trim()
	};
}

function parseLegacyGoalsMd(raw: string): Goal | null {
	if (!raw.trim()) return null;
	const { data, content } = splitFrontmatter(raw);
	const name = String(data.race_name ?? '').trim();
	const date = toIsoDate(data.race_date, '');
	if (!name && !date) return null;
	const primary = Array.isArray(data.primary)
		? data.primary.map(String)
		: String(data.primary ?? '')
				.split('\n')
				.map((s) => s.replace(/^- /, '').trim())
				.filter(Boolean);
	const distance = Number(data.race_distance_km ?? 10);
	const raceDate = date || '2026-09-27';
	return {
		id: goalIdFrom(name || 'race', raceDate),
		name: name || '10K',
		date: raceDate,
		horizon: raceDate.slice(0, 7),
		distance_km: Number.isFinite(distance) && distance > 0 ? distance : 10,
		sport: 'run',
		time_goal: String(data.time_goal ?? ''),
		primary,
		notes: content.trim(),
		url: String(data.url ?? '').trim(),
		itinerary_url: String(data.itinerary_url ?? '').trim(),
		plan_start: '2026-08-03',
		status: 'active',
		result: null,
		plan: null,
		bib_number: '',
		wave: '',
		start_time: '',
		result_url: '',
		medal_notes: ''
	};
}

let raceStrategyMigrated = false;

/** One-shot: race-day strategy belongs on the booked goal, not a global context file. */
export async function migrateRaceStrategyToActiveGoal(): Promise<void> {
	if (raceStrategyMigrated) return;
	raceStrategyMigrated = true;
	const raw = (await readContextFile('race-strategy.md')).trim();
	if (!raw) return;
	const store = await loadGoalStore();
	const active = pickSoonestOpenGoal(store.goals);
	if (active && !String(active.notes ?? '').trim()) {
		await saveGoalStore({
			goals: store.goals.map((g) => (g.id === active.id ? { ...g, notes: raw } : g))
		});
	}
	await writeContextFile('race-strategy.md', '');
}

export async function loadGoalStore(): Promise<GoalStore> {
	const json = await readContextFile('goals.json');
	const parsed = json ? parseStore(json) : null;
	if (parsed) return parsed;
	const md = await readContextFile('goals.md');
	const legacy = parseLegacyGoalsMd(md);
	if (!legacy) return emptyStore();
	const store = { goals: [legacy] };
	await saveGoalStore(store);
	return store;
}

export async function saveGoalStore(store: GoalStore): Promise<void> {
	const goals = stampGoalsByDate(store.goals);
	await writeContextFile('goals.json', `${JSON.stringify({ goals }, null, 2)}\n`);
}

export function activeGoalOf(store: GoalStore): Goal | null {
	return pickSoonestOpenGoal(store.goals);
}
