import type { RangeKind } from '$lib/date-range';
import { getCoachPlan, getDebriefPrompt } from '$lib/server/functions';
import type { CoachTab } from '$lib/coach/search';

export const DEFAULT_BRIEF_RANGE: RangeKind = '30d';

export function withCoachSearch(search: CoachSearch, extra: Partial<CoachSearch> = {}): CoachSearch {
	const id = extra.id !== undefined ? extra.id : search.id;
	const slug = extra.slug !== undefined ? extra.slug : search.slug;
	const includePlan = extra.includePlan !== undefined ? extra.includePlan : search.includePlan;
	return {
		tab: extra.tab ?? search.tab,
		id: id || undefined,
		slug: slug || undefined,
		planWeek: extra.planWeek !== undefined ? extra.planWeek : search.planWeek,
		includePlan: includePlan === true ? true : undefined,
		range: extra.range !== undefined ? extra.range : search.range,
		from: extra.from !== undefined ? extra.from : search.from,
		to: extra.to !== undefined ? extra.to : search.to
	};
}

export function defaultQuestion(nextWeek = false): string {
	return `What should ${nextWeek ? 'next week' : 'this week'} look like? Use the rules above. If I noted extras I'm considering, say whether to add them.`;
}

export function parseTab(v: unknown): CoachTab | undefined {
	if (v === 'training' || v === 'plan' || v === 'generate' || v === 'debrief') return v;
	return undefined;
}

export function parsePlanWeek(v: unknown): number | undefined {
	const n = Number(v);
	if (!Number.isFinite(n)) return undefined;
	const week = Math.floor(n);
	if (week < 1 || week > 52) return undefined;
	return week;
}

export function weekTag(n: number, current: number, upcoming: number): 'now' | 'next' | null {
	if (n === current) return 'now';
	if (n === upcoming && n !== current) return 'next';
	return null;
}

export function visibleTab(tab: CoachTab, authed: boolean): CoachTab {
	if ((tab === 'debrief' || tab === 'generate') && !authed) return 'training';
	return tab;
}

export type DebriefPrompt = Awaited<ReturnType<typeof getDebriefPrompt>>;
export type CoachDebriefUnit = NonNullable<DebriefPrompt['units']>[number];
export type CoachPlanData = Awaited<ReturnType<typeof getCoachPlan>>;

export function coachDebriefUnits(debrief: DebriefPrompt): CoachDebriefUnit[] {
	if (debrief.units?.length) return debrief.units;
	const runs = debrief.runs?.length ? debrief.runs : debrief.run ? [debrief.run] : [];
	return runs.map((run) => ({
		kind: 'single' as const,
		slug: run.slug,
		run,
		members: [run],
		groupId: undefined,
		groupName: undefined,
		stats: undefined
	}));
}

export function defaultCoachTab(planData: CoachPlanData): CoachTab {
	return planData.views.length > 0 ? 'plan' : 'training';
}