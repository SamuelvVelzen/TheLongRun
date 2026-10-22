import { pickSoonestOpenGoal, stampGoalsByDate } from '$lib/goals';
import {
	calendarFromGoal,
	filterPlanForCalendar,
	planWeekIndex,
	rollingCalendar,
	type PlanCalendar
} from '$lib/plan';
import type { Goal, PlanWeek } from '$lib/types';
import {
	loadGoalStore,
	migrateRaceStrategyToActiveGoal,
	type GoalStore
} from './goal-store';
import { loadPlan } from './plan-store';

export type TrainingContext = {
	store: GoalStore;
	activeGoal: Goal | null;
	medals: Goal[];
	calendar: PlanCalendar;
	plan: PlanWeek[];
};

export async function loadTrainingContext(): Promise<TrainingContext> {
	await migrateRaceStrategyToActiveGoal();
	const [store, rawPlan] = await Promise.all([loadGoalStore(), loadPlan()]);
	const goals = stampGoalsByDate(store.goals);
	const stamped = { goals };
	const activeGoal = pickSoonestOpenGoal(goals);
	const medals = goals
		.filter((g) => g.status === 'done')
		.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
	const calendar = activeGoal ? calendarFromGoal(activeGoal) : rollingCalendar();
	return {
		store: stamped,
		activeGoal,
		medals,
		calendar,
		plan: filterPlanForCalendar(rawPlan, calendar)
	};
}

export async function currentPlanWeek(today = new Date()): Promise<PlanWeek | null> {
	const { plan, calendar } = await loadTrainingContext();
	if (!plan.length) return null;
	const weekIndex = planWeekIndex(calendar, today);
	if (weekIndex < 1) return plan[0] ?? null;
	return plan.find((w) => w.week === weekIndex) ?? plan[plan.length - 1] ?? null;
}
