import {
    compactHabitText,
    withHabitDefaults,
    type ActivityHabits,
    type HabitPair
} from '$lib/activity-habits';

const KEY = 'coach-debrief-habits';

/** Draft before/after notes keyed by activity slug — survives refresh. */
export function readDebriefHabits(): Record<string, HabitPair> {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
		const out: Record<string, HabitPair> = {};
		for (const [k, v] of Object.entries(parsed)) {
			if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
			const o = v as { before?: unknown; after?: unknown };
			out[k] = {
				before: typeof o.before === 'string' ? o.before : '',
				after: typeof o.after === 'string' ? o.after : ''
			};
		}
		return out;
	} catch {
		return {};
	}
}

export function writeDebriefHabits(next: Record<string, HabitPair>) {
	try {
		localStorage.setItem(KEY, JSON.stringify(next));
	} catch {
		/* ignore quota / private mode */
	}
}

export function clearDebriefHabits(
	slugs: string[],
	prev: Record<string, HabitPair>
): Record<string, HabitPair> {
	if (!slugs.length) return prev;
	const next = { ...prev };
	for (const slug of slugs) delete next[slug];
	writeDebriefHabits(next);
	return next;
}

export function seedDebriefHabits(
	runs: {
		slug: string;
		activity_type?: string | null;
		before_notes?: string | null;
		after_notes?: string | null;
	}[],
	habits: ActivityHabits,
	prev: Record<string, HabitPair>
): Record<string, HabitPair> {
	let changed = false;
	const next = { ...prev };
	for (const r of runs) {
		if (next[r.slug]) continue;
		next[r.slug] = withHabitDefaults(r.activity_type, habits, {
			before: r.before_notes,
			after: r.after_notes
		});
		changed = true;
	}
	if (!changed) return prev;
	writeDebriefHabits(next);
	return next;
}

export function setDebriefHabitField(
	slug: string,
	field: keyof HabitPair,
	text: string,
	prev: Record<string, HabitPair>
): Record<string, HabitPair> {
	const next = {
		...prev,
		[slug]: {
			before: prev[slug]?.before ?? '',
			after: prev[slug]?.after ?? '',
			[field]: compactHabitText(text)
		}
	};
	writeDebriefHabits(next);
	return next;
}
