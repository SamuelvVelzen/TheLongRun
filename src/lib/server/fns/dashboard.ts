import { openIntentions } from '$lib/goals';
import { pickBannerWeekView, sessionStreak, weekToPlan, type PlanCalendar, type WeekView } from '$lib/plan';
import type { ActivityAttachOption, ActivityGroupInfo, Goal, PlanAttachOption, PlannedRoute, PlannedRouteActivityLink, PlannedRoutePlanLink, PlanWeek, RouteTrack, RunRecord, RunWithMap, SessionRouteRef } from '$lib/types';
import type { ActivityFeelInput, DebriefRaceHint } from '$lib/debrief-types';
import type { GoalBriefDraft } from '$lib/goal-brief';
import type { PlanPeekData } from '$lib/plan-peek';
import type { CreateRunInput, UpdateRunInput } from '$lib/run-input';
import { createServerFn } from '@tanstack/react-start';
import { loadTrainingContext } from '../context';
import { enrichAllGroupEfforts, listActivityGroups } from '../groups';
import { listPlannedRoutes, listPlanRouteRefs } from '../planned-routes';
import { listRouteTracks } from '../routes';
import { listRouteIds, listRuns } from '../runs';
import { attachPlanRoutes, withMap } from '../run-orchestration';

// ---------- reads ----------

/** Root-loader data shared by every page: sign-in state + the open body notes to score. */

export const getDashboardData = createServerFn({ method: 'GET' }).handler(async () => {
	const [runs, tracks, routeIds, training, planRefs, plannedRoutes, groupsRaw] = await Promise.all([
		listRuns(),
		listRouteTracks(),
		listRouteIds(),
		loadTrainingContext(),
		listPlanRouteRefs(),
		listPlannedRoutes(),
		listActivityGroups()
	]);
	const groups = await enrichAllGroupEfforts(groupsRaw, runs);
	const { plan, calendar, activeGoal, medals } = training;
	const nextIntention = openIntentions(training.store.goals)[0] ?? null;
	const weekNum = weekToPlan(calendar);
	const week = plan.find((w) => w.week === weekNum) ?? plan[plan.length - 1] ?? null;
	const weekView = attachPlanRoutes(pickBannerWeekView(plan, runs, calendar), planRefs);
	return {
		runs: withMap(runs, routeIds),
		tracks,
		groups,
		week,
		weekView,
		planRoutes: plannedRoutes.map((r): SessionRouteRef => ({
			slug: r.slug,
			name: r.name,
			distance_km: r.distance_km
		})),
		streak: sessionStreak(runs, plan, calendar),
		activeGoal,
		nextIntention,
		lastMedal: medals[0] ?? null,
		calendar
	} satisfies {
		runs: RunWithMap[];
		tracks: RouteTrack[];
		groups: ActivityGroupInfo[];
		week: PlanWeek | null;
		weekView: WeekView | null;
		planRoutes: SessionRouteRef[];
		streak: number;
		activeGoal: Goal | null;
		nextIntention: Goal | null;
		lastMedal: Goal | null;
		calendar: PlanCalendar;
	};
});

export type { PlanPeekData } from '$lib/plan-peek';

export const getPlanPeekData = createServerFn({ method: 'GET' }).handler(async (): Promise<PlanPeekData | null> => {
	const [runs, training, planRefs, plannedRoutes] = await Promise.all([
		listRuns(),
		loadTrainingContext(),
		listPlanRouteRefs(),
		listPlannedRoutes()
	]);
	const { plan, calendar } = training;
	const weekView = attachPlanRoutes(pickBannerWeekView(plan, runs, calendar), planRefs);
	if (!weekView) return null;
	return {
		weekView,
		calendar,
		planRoutes: plannedRoutes.map((r): SessionRouteRef => ({
			slug: r.slug,
			name: r.name,
			distance_km: r.distance_km
		}))
	};
});
