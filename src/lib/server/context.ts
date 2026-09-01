import {
	calendarFromGoal,
	filterPlanForCalendar,
	planWeekIndex,
	rollingCalendar,
	type PlanCalendar
} from '$lib/plan';
import { goalIdFrom } from '$lib/goals';
import {
	asShoeNameList,
	emptyShoes,
	normalizeShoeContext,
	shoeKey,
	type ShoeContext
} from '$lib/shoes';
import type { Goal, PlanWeek } from '$lib/types';
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
	const { plan, calendar } = await loadTrainingContext();
	if (!plan.length) return null;
	const weekIndex = planWeekIndex(calendar, today);
	if (weekIndex < 1) return plan[0] ?? null;
	return plan.find((w) => w.week === weekIndex) ?? plan[plan.length - 1] ?? null;
}

export type GoalStore = { goals: Goal[] };

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
	const date = toIsoDate(o.date ?? o.race_date, '');
	if (!name && !date) return null;
	const distance = Number(o.distance_km ?? o.race_distance_km ?? 10);
	const primary = Array.isArray(o.primary)
		? o.primary.map(String).map((s) => s.trim()).filter(Boolean)
		: [];
	const status: Goal['status'] = o.status === 'done' ? 'done' : 'active';
	const result =
		o.result && typeof o.result === 'object'
			? {
					activity_slug: String((o.result as { activity_slug?: unknown }).activity_slug ?? ''),
					date: String((o.result as { date?: unknown }).date ?? date),
					time: String((o.result as { time?: unknown }).time ?? ''),
					distance_km:
						typeof (o.result as { distance_km?: unknown }).distance_km === 'number'
							? ((o.result as { distance_km: number }).distance_km)
							: null,
					pace: String((o.result as { pace?: unknown }).pace ?? '')
				}
			: null;
	const plan = Array.isArray(o.plan) ? (o.plan as PlanWeek[]) : null;
	const planStart = toIsoDate(o.plan_start, date);
	return {
		id: String(o.id ?? '').trim() || goalIdFrom(name || 'race', date),
		name: name || 'Race',
		date,
		distance_km: Number.isFinite(distance) && distance > 0 ? distance : 10,
		sport: String(o.sport ?? 'run') || 'run',
		time_goal: String(o.time_goal ?? ''),
		primary,
		notes: String(o.notes ?? '').trim(),
		plan_start: planStart,
		status,
		result,
		plan
	};
}

function parseLegacyGoalsMd(raw: string): Goal | null {
	if (!raw.trim()) return null;
	const { data, content } = matter(raw);
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
	return {
		id: goalIdFrom(name || 'race', date || '2026-09-27'),
		name: name || '10K',
		date: date || '2026-09-27',
		distance_km: Number.isFinite(distance) && distance > 0 ? distance : 10,
		sport: 'run',
		time_goal: String(data.time_goal ?? ''),
		primary,
		notes: content.trim(),
		plan_start: '2026-08-03',
		status: 'active',
		result: null,
		plan: null
	};
}

export async function loadGoalStore(): Promise<GoalStore> {
	const json = await readContextFile('goals.json');
	const parsed = json ? parseStore(json) : null;
	if (parsed) return parsed;
	// One-shot import of a leftover D1 `goals.md` row (the repo file is gone).
	const md = await readContextFile('goals.md');
	const legacy = parseLegacyGoalsMd(md);
	if (!legacy) return emptyStore();
	const store = { goals: [legacy] };
	await saveGoalStore(store);
	return store;
}

export async function saveGoalStore(store: GoalStore): Promise<void> {
	const active = store.goals.filter((g) => g.status === 'active');
	const rest = store.goals.filter((g) => g.status !== 'active');
	const goals = active.length ? [active[0]!, ...active.slice(1).map((g) => ({ ...g, status: 'done' as const })), ...rest] : rest;
	await writeContextFile('goals.json', `${JSON.stringify({ goals }, null, 2)}\n`);
}

export function activeGoalOf(store: GoalStore): Goal | null {
	return store.goals.find((g) => g.status === 'active') ?? null;
}

export type TrainingContext = {
	store: GoalStore;
	activeGoal: Goal | null;
	medals: Goal[];
	calendar: PlanCalendar;
	plan: PlanWeek[];
};

export async function loadTrainingContext(): Promise<TrainingContext> {
	const [store, rawPlan] = await Promise.all([loadGoalStore(), loadPlan()]);
	const activeGoal = activeGoalOf(store);
	const medals = store.goals
		.filter((g) => g.status === 'done')
		.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
	const calendar = activeGoal ? calendarFromGoal(activeGoal) : rollingCalendar();
	return {
		store,
		activeGoal,
		medals,
		calendar,
		plan: filterPlanForCalendar(rawPlan, calendar)
	};
}

export async function savePlan(plan: PlanWeek[]): Promise<void> {
	await writeContextFile('plan.json', `${JSON.stringify(plan, null, 2)}\n`);
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
