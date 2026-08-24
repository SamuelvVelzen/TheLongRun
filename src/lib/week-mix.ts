import {
    ACTIVITY_TYPES,
    activityLabel,
    activityPlural,
    normalizeActivityType,
    type ActivityType
} from './activity';

export type WeekMix = Record<ActivityType, number>;

export const ZERO_WEEK_MIX: WeekMix = {
	run: 0,
	walk: 0,
	ride: 0,
	swim: 0,
	strength: 0
};

/** Usual week until the user saves their own mix. */
export const DEFAULT_WEEK_MIX: WeekMix = {
	run: 3,
	walk: 0,
	ride: 1,
	swim: 0,
	strength: 1
};

const MAX_COUNT = 10;

export function normalizeWeekMix(raw: unknown): WeekMix {
	const out: WeekMix = { ...ZERO_WEEK_MIX };
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_WEEK_MIX };
	const o = raw as Record<string, unknown>;
	let any = false;
	for (const t of ACTIVITY_TYPES) {
		const n = Number(o[t]);
		if (Number.isFinite(n)) {
			any = true;
			out[t] = Math.max(0, Math.min(MAX_COUNT, Math.round(n)));
		}
	}
	return any ? out : { ...DEFAULT_WEEK_MIX };
}

export function mixTotal(mix: WeekMix): number {
	return ACTIVITY_TYPES.reduce((n, t) => n + mix[t], 0);
}

export function mixesEqual(a: WeekMix, b: WeekMix): boolean {
	return ACTIVITY_TYPES.every((t) => a[t] === b[t]);
}

export function formatMixProse(mix: WeekMix): string {
	const parts = ACTIVITY_TYPES.filter((t) => mix[t] > 0).map((t) => {
		const n = mix[t];
		if (n === 1) {
			return t === 'strength' ? '1 strength session' : `1 ${activityLabel(t).toLowerCase()}`;
		}
		return `${n} ${activityPlural(t)}`;
	});
	return parts.join(', ') || 'no pinned sessions';
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const RUN_LABELS = ['Easy', 'Quality', 'Long', 'Easy'] as const;

/** Illustrative JSON sessions so the model copies the shape — not a 3-run template. */
export function exampleSessionsForMix(mix: WeekMix): Record<string, unknown>[] {
	const effective = mixTotal(mix) > 0 ? mix : { ...DEFAULT_WEEK_MIX, run: 2 };
	const sessions: Record<string, unknown>[] = [];
	let day = 1;
	const takeDay = () => DAYS[day++ % 7]!;

	for (let i = 0; i < effective.run; i++) {
		const isLong = effective.run >= 2 && i === effective.run - 1;
		sessions.push({
			day: takeDay(),
			activity_type: 'run',
			label: isLong ? 'Long' : RUN_LABELS[i % RUN_LABELS.length],
			distance_km: isLong ? 12 : 6 + i,
			detail: 'how + why'
		});
	}
	for (let i = 0; i < effective.ride; i++) {
		sessions.push({
			day: takeDay(),
			activity_type: 'ride',
			label: 'Easy spin',
			distance_km: 25,
			detail: 'easy cycling — keep legs fresh for running'
		});
	}
	for (let i = 0; i < effective.walk; i++) {
		sessions.push({
			day: takeDay(),
			activity_type: 'walk',
			label: 'Easy walk',
			distance_km: 5,
			detail: 'easy walk, not a hidden run'
		});
	}
	for (let i = 0; i < effective.swim; i++) {
		sessions.push({
			day: takeDay(),
			activity_type: 'swim',
			label: 'Easy swim',
			distance_km: 1,
			detail: 'easy aerobic, no pounding'
		});
	}
	for (let i = 0; i < effective.strength; i++) {
		sessions.push({
			day: takeDay(),
			activity_type: 'strength',
			label: 'Gym',
			distance_km: null,
			detail: 'full-body strength, not a max-effort day'
		});
	}
	return sessions;
}

export function formatMixPromptSection(opts: {
	defaultMix: WeekMix;
	thisWeek: WeekMix;
	weekPhrase: string;
	note?: string;
}): string {
	const usual = formatMixProse(opts.defaultMix);
	const now = formatMixProse(opts.thisWeek);
	const same = mixesEqual(opts.defaultMix, opts.thisWeek);
	const count = mixTotal(opts.thisWeek);
	const lines = [
		`## Sports mix for ${opts.weekPhrase}`,
		same
			? `My usual week (and ${opts.weekPhrase}) is **${now}**.`
			: `My usual week is **${usual}**. For **${opts.weekPhrase}** I want **${now}**.`,
		count
			? `Plan **all** of those sessions — every sport listed, not only the runs. Session count is what I asked for (${now}), not a fixed 3-run week.`
			: `I did not pin a mix — plan whatever the week needs across the sports I do (run, ride, walk, swim, strength). Do not default to a 3-run template.`
	];
	if (opts.note?.trim()) {
		lines.push(`Extra for ${opts.weekPhrase}: ${opts.note.trim()}`);
	}
	return lines.join('\n');
}

export function sessionActivityType(
	session: { activity_type?: string | null; label?: string }
): ActivityType {
	return normalizeActivityType(session.activity_type ?? 'run');
}
