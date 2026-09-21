import { ACTIVITY_TYPES, activityLabel, normalizeActivityType, type ActivityType } from '$lib/activity';

export type HabitPair = { before: string; after: string };
export type ActivityHabits = Record<ActivityType, HabitPair>;

export const MAX_HABIT_NOTES = 400;

export const EMPTY_HABIT_PAIR: HabitPair = { before: '', after: '' };

export const EMPTY_ACTIVITY_HABITS: ActivityHabits = {
	run: { ...EMPTY_HABIT_PAIR },
	walk: { ...EMPTY_HABIT_PAIR },
	ride: { ...EMPTY_HABIT_PAIR },
	strength: { ...EMPTY_HABIT_PAIR }
};

export const HABIT_PLACEHOLDERS: ActivityHabits = {
	run: {
		before: 'Warmup stretches, walk 1000 m',
		after: 'Cooldown stretches'
	},
	walk: {
		before: 'Warmup stretches',
		after: 'Cooldown stretches'
	},
	ride: {
		before: 'Warmup spin / mobility',
		after: 'Cooldown spin / stretch'
	},
	strength: {
		before: 'Warmup sets / mobility',
		after: 'Cooldown stretch'
	}
};

/** Off-watch rituals — never copy into plan `detail` or planned distance. */
export const HABITS_PROMPT_RULE =
	'Usual habits are generic before/after rituals per sport (warmup walk, stretches). Do **not** copy them into session `detail` — that field stays specific to that day. Do **not** add habit distance to planned `distance_km`. Treat them as off-watch ritual unless this session’s before/after notes say otherwise. Still account for them as extra load/recovery.';

export function compactHabitText(value: string | null | undefined): string {
	return String(value ?? '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, MAX_HABIT_NOTES);
}

export function normalizeHabitPair(raw: unknown): HabitPair {
	const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
	return {
		before: compactHabitText(typeof o.before === 'string' ? o.before : ''),
		after: compactHabitText(typeof o.after === 'string' ? o.after : '')
	};
}

export function normalizeActivityHabits(raw: unknown): ActivityHabits {
	const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
	const out = emptyActivityHabits();
	for (const type of ACTIVITY_TYPES) {
		out[type] = normalizeHabitPair(o[type]);
	}
	return out;
}

export function emptyActivityHabits(): ActivityHabits {
	return {
		run: { before: '', after: '' },
		walk: { before: '', after: '' },
		ride: { before: '', after: '' },
		strength: { before: '', after: '' }
	};
}

export function habitPairFor(
	habits: ActivityHabits,
	activityType: string | null | undefined
): HabitPair {
	return habits[normalizeActivityType(activityType)];
}

/** Fill empty instance fields from the sport’s usual habits. */
export function withHabitDefaults(
	activityType: string | null | undefined,
	habits: ActivityHabits,
	current?: { before?: string | null; after?: string | null }
): HabitPair {
	const usual = habitPairFor(habits, activityType);
	return {
		before: compactHabitText(current?.before) || usual.before,
		after: compactHabitText(current?.after) || usual.after
	};
}

export function habitsHaveText(habits: ActivityHabits): boolean {
	return ACTIVITY_TYPES.some((t) => habits[t].before || habits[t].after);
}

export function formatUsualHabitsSection(habits: ActivityHabits): string {
	const blocks = ACTIVITY_TYPES.map((type) => {
		const pair = habits[type];
		if (!pair.before && !pair.after) return '';
		const lines = [`### ${activityLabel(type)}`];
		if (pair.before) lines.push(`- Before: ${pair.before}`);
		if (pair.after) lines.push(`- After: ${pair.after}`);
		return lines.join('\n');
	}).filter(Boolean);
	const body = blocks.length ? blocks.join('\n\n') : '(none set)';
	return `## Usual habits
${HABITS_PROMPT_RULE}

${body}`;
}

export function formatSessionHabitsBlock(
	runs: {
		slug: string;
		activity_type?: string | null;
		before_notes?: string | null;
		after_notes?: string | null;
	}[],
	drafts: Record<string, HabitPair>,
	habits: ActivityHabits
): string {
	const many = runs.length > 1;
	const blocks = runs.map((r) => {
		const usual = habitPairFor(habits, r.activity_type);
		const draft = drafts[r.slug];
		const before = compactHabitText(draft?.before ?? r.before_notes) || usual.before;
		const after = compactHabitText(draft?.after ?? r.after_notes) || usual.after;
		if (!before && !after) {
			return many ? `- \`${r.slug}\`: (no before/after this time)` : '(no before/after this time)';
		}
		const bits = [
			before ? `Before: ${before}` : null,
			after ? `After: ${after}` : null
		].filter(Boolean);
		if (!many) return bits.join('\n');
		return `- \`${r.slug}\`: ${bits.join(' · ')}`;
	});
	return blocks.join('\n');
}

/** True when the text is empty or still the usual habit for another sport (safe to swap on type change). */
export function isReplaceableHabitField(
	value: string,
	field: keyof HabitPair,
	nextType: ActivityType,
	habits: ActivityHabits
): boolean {
	const t = compactHabitText(value);
	if (!t) return true;
	if (t === habits[nextType][field]) return false;
	return ACTIVITY_TYPES.some((type) => type !== nextType && habits[type][field] === t);
}
