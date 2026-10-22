import { normalizeActivityType } from '$lib/activity';
import { wearByAllGear } from '$lib/gear';
import { recentExerciseTops } from '$lib/strength';
import type { ActivityAttachOption, ActivityGroupInfo, Goal, PlanAttachOption, PlannedRoute, PlannedRouteActivityLink, PlannedRoutePlanLink, PlanWeek, RouteTrack, RunRecord, RunWithMap, SessionRouteRef } from '$lib/types';
import type { ActivityFeelInput, DebriefRaceHint } from '$lib/debrief-types';
import type { GoalBriefDraft } from '$lib/goal-brief';
import type { PlanPeekData } from '$lib/plan-peek';
import type { CreateRunInput, UpdateRunInput } from '$lib/run-input';
import { createServerFn } from '@tanstack/react-start';
import { requireAuth } from '../auth';
import { currentPlanWeek, loadActivityHabits, loadGear, loadTrainingContext, saveHrMaxSetting } from '../context';
import { getRouteGeoJson } from '../route-analytics';
import { getRun, listRuns } from '../runs';
import { fetchWeatherForDateTime } from '../weather';
import { byDateNewestFirst } from '../run-sort';

// ---------- reads ----------

/** Root-loader data shared by every page: sign-in state + the open body notes to score. */

export const saveHrMax = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((hrMax: number | null) => hrMax)
	.handler(async ({ data }) => {
		await saveHrMaxSetting(data);
		return { ok: true };
	});

export const getLogDefaults = createServerFn({ method: 'GET' }).handler(async () => {
	const [week, gear, runs, training, habits] = await Promise.all([
		currentPlanWeek(),
		loadGear(),
		listRuns(),
		loadTrainingContext(),
		loadActivityHabits()
	]);
	const strengthTops = recentExerciseTops(
		runs
			.filter((r) => normalizeActivityType(r.activity_type) === 'strength')
			.sort(byDateNewestFirst)
	);
	return {
		week,
		gear,
		gearWear: wearByAllGear(runs),
		calendar: training.calendar,
		strengthTops,
		habits
	};
});

export const getRouteGeoJsonFn = createServerFn({ method: 'GET' })
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		return (await getRouteGeoJson(id)) ?? null;
	});

export const getWeather = createServerFn({ method: 'GET' })
	.validator(
		(d: { date: string; time?: string | null; duration?: string | null; slug?: string | null }) => d
	)
	.handler(async ({ data }) => {
		const slug = data.slug?.trim() ?? '';
		const run = slug ? await getRun(slug) : null;
		return fetchWeatherForDateTime(
			data.date,
			data.time ?? null,
			null,
			null,
			data.duration ?? null,
			run
		);
	});
