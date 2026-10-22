import { normalizeActivityType } from '$lib/activity';
import { dateForSessionDay, isRestLike, planSessionRouteKey, planWeekStartIso, sessionCanLinkRoute, upcomingPlanSessions } from '$lib/plan';
import type { ActivityAttachOption, ActivityGroupInfo, Goal, PlanAttachOption, PlannedRoute, PlannedRouteActivityLink, PlannedRoutePlanLink, PlanWeek, RouteTrack, RunRecord, RunWithMap, SessionRouteRef } from '$lib/types';
import type { ActivityFeelInput, DebriefRaceHint } from '$lib/debrief-types';
import type { GoalBriefDraft } from '$lib/goal-brief';
import type { PlanPeekData } from '$lib/plan-peek';
import type { CreateRunInput, UpdateRunInput } from '$lib/run-input';
import { createServerFn } from '@tanstack/react-start';
import { requireAuth } from '../auth';
import { loadPlan, loadTrainingContext, savePlan } from '../context';
import { attachRouteToActivity as dbAttachRouteToActivity, attachRouteToPlan as dbAttachRouteToPlan, deletePlannedRoute as dbDeletePlannedRoute, detachRouteLink as dbDetachRouteLink, replacePlannedRouteTrack as dbReplacePlannedRouteTrack, updatePlannedRoute as dbUpdatePlannedRoute, getPlannedRoute, listPlannedRoutes, listPlannedRouteTracks, listRouteLinks, savePlannedFromFile, savePlannedFromTrack } from '../planned-routes';
import { getRun, listRuns } from '../runs';
import { matchingPlanSession, startFinishWaypoints, trackFromDrawnPins } from '../planned-route-draw';

// ---------- reads ----------

/** Root-loader data shared by every page: sign-in state + the open body notes to score. */

export const getPlannedRoutesData = createServerFn({ method: 'GET' }).handler(async () => {
	const [routes, tracks] = await Promise.all([listPlannedRoutes(), listPlannedRouteTracks()]);
	return { routes, tracks } satisfies { routes: PlannedRoute[]; tracks: RouteTrack[] };
});

export const getPlannedRouteDetail = createServerFn({ method: 'GET' })
	.validator((slug: string) => slug)
	.handler(async ({ data: slug }) => {
		const [route, allLinks, training, runs, routes] = await Promise.all([
			getPlannedRoute(slug),
			listRouteLinks(),
			loadTrainingContext(),
			listRuns(),
			listPlannedRoutes()
		]);
		if (!route) return null;
		const { plan, calendar } = training;
		const names = new Map(routes.map((r) => [r.slug, r.name]));
		const runBySlug = new Map(runs.map((r) => [r.slug, r]));
		const mine = allLinks.filter((l) => l.route_slug === slug);

		const planLinks: PlannedRoutePlanLink[] = [];
		for (const link of mine) {
			if (link.kind !== 'plan' || link.plan_week == null || !link.plan_day) continue;
			const week = plan.find((w) => w.week === link.plan_week);
			const session = week?.sessions.find((s) => {
				if (s.day.toLowerCase() !== link.plan_day!.toLowerCase()) return false;
				if (link.plan_label && s.label !== link.plan_label) return false;
				if (
					link.plan_activity_type &&
					normalizeActivityType(s.activity_type ?? 'run') !==
						normalizeActivityType(link.plan_activity_type)
				) {
					return false;
				}
				return true;
			});
			planLinks.push({
				id: link.id,
				week: link.plan_week,
				day: link.plan_day,
				date: dateForSessionDay(planWeekStartIso(link.plan_week, calendar), link.plan_day),
				label: session?.label || link.plan_label || 'Planned session',
				activity_type: session?.activity_type || link.plan_activity_type || 'run',
				distance_km: session?.distance_km ?? null
			});
		}

		const activityLinks: PlannedRouteActivityLink[] = [];
		for (const link of mine) {
			if (link.kind !== 'activity' || !link.activity_slug) continue;
			const run = runBySlug.get(link.activity_slug);
			if (!run) continue;
			activityLinks.push({
				id: link.id,
				slug: run.slug,
				date: run.date,
				day: run.day,
				activity_type: run.activity_type,
				distance_km: run.distance_km
			});
		}

		const planTaken = new Map<string, { slug: string; name: string }>();
		for (const link of allLinks) {
			if (link.kind !== 'plan' || link.plan_week == null || !link.plan_day) continue;
			const name = names.get(link.route_slug);
			if (!name) continue;
			const taken = { slug: link.route_slug, name };
			if (link.plan_label && link.plan_activity_type) {
				planTaken.set(
					`${link.plan_week}|${planSessionRouteKey(link.plan_day, link.plan_label, link.plan_activity_type)}`,
					taken
				);
			} else {
				planTaken.set(`${link.plan_week}|legacy|${link.plan_day.toLowerCase()}`, taken);
			}
		}
		const planSessionTakenKey = (s: {
			week: number;
			day: string;
			label: string;
			activity_type?: string | null;
		}) => `${s.week}|${planSessionRouteKey(s.day, s.label, s.activity_type ?? 'run')}`;

		const planOptions: PlanAttachOption[] = upcomingPlanSessions(plan, calendar)
			.filter((s) => {
				if (planTaken.get(planSessionTakenKey(s))?.slug === slug) return false;
				const legacyKey = `${s.week}|legacy|${s.day.trim().toLowerCase()}`;
				return planTaken.get(legacyKey)?.slug !== slug;
			})
			.map((s) => ({
				week: s.week,
				day: s.day,
				date: s.date,
				label: s.label,
				activity_type: s.activity_type ?? 'run',
				distance_km: s.distance_km,
				taken_by:
					planTaken.get(planSessionTakenKey(s)) ??
					planTaken.get(`${s.week}|legacy|${s.day.trim().toLowerCase()}`) ??
					null
			}));

		const activityTaken = new Map<string, { slug: string; name: string }>();
		for (const link of allLinks) {
			if (link.kind !== 'activity' || !link.activity_slug) continue;
			const name = names.get(link.route_slug);
			if (!name) continue;
			activityTaken.set(link.activity_slug, { slug: link.route_slug, name });
		}

		const linkedActivity = new Set(activityLinks.map((a) => a.slug));
		const activityOptions: ActivityAttachOption[] = runs
			.filter((r) => normalizeActivityType(r.activity_type) !== 'strength')
			.filter((r) => !linkedActivity.has(r.slug))
			.slice(0, 80)
			.map((r) => ({
				slug: r.slug,
				date: r.date,
				day: r.day,
				activity_type: r.activity_type,
				distance_km: r.distance_km,
				taken_by: activityTaken.get(r.slug) ?? null
			}));

		return { ...route, planLinks, activityLinks, planOptions, activityOptions };
	});

export const importPlannedRoute = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: { text: string; filename: string }) => d)
	.handler(async ({ data }) => {
		const route = await savePlannedFromFile(data);
		return {
			slug: route.slug,
			name: route.name,
			distance_km: route.distance_km
		};
	});

export const createPlannedRoute = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator(
		(d: {
			name: string;
			waypoints: { lat: number; lng: number }[];
			follow_network?: boolean;
			network_coords?: { lat: number; lng: number; elev?: number }[];
		}) => d
	)
	.handler(async ({ data }) => {
		const name = data.name.trim();
		if (!name) throw new Error('Name this route.');
		const { pins, points } = await trackFromDrawnPins(data);

		const route = await savePlannedFromTrack({
			name,
			points,
			waypoints: startFinishWaypoints(pins)
		});
		return {
			slug: route.slug,
			name: route.name,
			distance_km: route.distance_km
		};
	});

export const updatePlannedRoute = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator(
		(d: {
			slug: string;
			name?: string;
			notes?: string;
			waypoints?: { lat: number; lng: number }[];
			follow_network?: boolean;
			network_coords?: { lat: number; lng: number; elev?: number }[];
		}) => d
	)
	.handler(async ({ data }) => {
		if (data.waypoints) {
			const { pins, points } = await trackFromDrawnPins({
				waypoints: data.waypoints,
				follow_network: data.follow_network,
				network_coords: data.network_coords
			});
			const route = await dbReplacePlannedRouteTrack(data.slug, {
				points,
				pins,
				name: data.name,
				notes: data.notes
			});
			if (!route) throw new Error('Route not found.');
			return { slug: route.slug, distance_km: route.distance_km };
		}
		const route = await dbUpdatePlannedRoute(data.slug, { name: data.name, notes: data.notes });
		if (!route) throw new Error('Route not found.');
		return { slug: route.slug };
	});

export const deletePlannedRoute = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((slug: string) => slug)
	.handler(async ({ data: slug }) => {
		return dbDeletePlannedRoute(slug);
	});

export const setPlanSessionSkipped = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator(
		(d: {
			week: number;
			day: string;
			label: string;
			activity_type?: string;
			session_index?: number;
			skipped: boolean;
		}) => ({
			week: d.week,
			day: String(d.day ?? '').trim(),
			label: String(d.label ?? '').trim(),
			activity_type: normalizeActivityType(d.activity_type ?? 'run'),
			session_index:
				d.session_index != null && Number.isInteger(d.session_index) ? d.session_index : undefined,
			skipped: Boolean(d.skipped)
		})
	)
	.handler(async ({ data }) => {
		if (!Number.isInteger(data.week) || data.week < 1) {
			throw new Error('That plan week is out of range.');
		}
		if (!data.day || !data.label) throw new Error('That session is not on the plan.');
		const plan = await loadPlan();
		const found = matchingPlanSession(
			plan,
			data.week,
			data.day,
			data.label,
			data.activity_type,
			data.session_index
		);
		if (!found) throw new Error('That session is not on the plan.');
		if (data.skipped && isRestLike(found.session.label)) {
			throw new Error('Rest days cannot be skipped.');
		}
		const nextSession = { ...found.session };
		if (data.skipped) nextSession.status = 'skipped';
		else delete nextSession.status;
		const sessions = found.weekRow.sessions.slice();
		sessions[found.index] = nextSession;
		await savePlan(
			plan.map((w) => (w.week === found.weekRow.week ? { ...found.weekRow, sessions } : w))
		);
		return { ok: true as const, skipped: data.skipped };
	});

export const attachPlannedRoute = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator(
		(d: {
			slug: string;
			week?: number;
			day?: string;
			label?: string;
			activity_type?: string;
			activity_slug?: string;
		}) => d
	)
	.handler(async ({ data }) => {
		if (data.activity_slug) {
			const run = await getRun(data.activity_slug);
			if (!run) throw new Error('Activity not found.');
			if (normalizeActivityType(run.activity_type) === 'strength') {
				throw new Error('Strength sessions do not use a route.');
			}
			await dbAttachRouteToActivity(data.slug, data.activity_slug);
			return { ok: true as const };
		}
		const week = data.week;
		const day = data.day?.trim() ?? '';
		const label = data.label?.trim() ?? '';
		const activityType = normalizeActivityType(data.activity_type ?? 'run');
		if (week == null || !day || !label) throw new Error('Pick a plan day or an activity.');
		if (!Number.isInteger(week) || week < 1) {
			throw new Error('That plan week is out of range.');
		}
		const { calendar, plan } = await loadTrainingContext();
		if (week > calendar.weekCount) {
			throw new Error('That plan week is out of range.');
		}
		const found = plan
			.find((w) => w.week === week)
			?.sessions.find(
				(s) =>
					s.day.toLowerCase() === day.toLowerCase() &&
					s.label === label &&
					normalizeActivityType(s.activity_type ?? 'run') === activityType
			);
		if (!found) throw new Error('That session is not on the plan.');
		if (!sessionCanLinkRoute(found)) {
			throw new Error(
				normalizeActivityType(found.activity_type ?? 'run') === 'strength'
					? 'Strength sessions do not use a route.'
					: 'Rest days do not use a route.'
			);
		}
		await dbAttachRouteToPlan(data.slug, week, day, label, activityType);
		return { ok: true as const };
	});

export const detachPlannedRoute = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: { slug: string; id: number }) => d)
	.handler(async ({ data }) => {
		const ok = await dbDetachRouteLink(data.id, data.slug);
		if (!ok) throw new Error('Link not found.');
		return { ok: true as const };
	});
