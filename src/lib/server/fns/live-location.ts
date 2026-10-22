import { parseLiveRouteSlug } from '$lib/live-location';
import type { ActivityAttachOption, ActivityGroupInfo, Goal, PlanAttachOption, PlannedRoute, PlannedRouteActivityLink, PlannedRoutePlanLink, PlanWeek, RouteTrack, RunRecord, RunWithMap, SessionRouteRef } from '$lib/types';
import type { ActivityFeelInput, DebriefRaceHint } from '$lib/debrief-types';
import type { GoalBriefDraft } from '$lib/goal-brief';
import type { PlanPeekData } from '$lib/plan-peek';
import type { CreateRunInput, UpdateRunInput } from '$lib/run-input';
import { createServerFn } from '@tanstack/react-start';
import { requireAuth } from '../auth';
import { clearLiveLocation, loadLiveLocation, saveLiveLocation } from '../context';
import { getPlannedRouteTrack } from '../planned-routes';

// ---------- reads ----------

/** Root-loader data shared by every page: sign-in state + the open body notes to score. */

export const getLiveLocation = createServerFn({ method: 'GET' }).handler(async () => {
	const ping = await loadLiveLocation();
	if (!ping) return null;
	const routeTrack = ping.routeSlug ? await getPlannedRouteTrack(ping.routeSlug) : null;
	return { ...ping, routeTrack };
});

export const pingLiveLocation = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator(
		(d: {
			lat: number;
			lng: number;
			accuracy?: number | null;
			heading?: number | null;
			routeSlug?: string | null;
		}) => {
			const lat = Number(d?.lat);
			const lng = Number(d?.lng);
			if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('Invalid location.');
			if (lat < -90 || lat > 90 || lng < -180 || lng > 180) throw new Error('Invalid location.');
			const accuracy = d?.accuracy == null ? null : Number(d.accuracy);
			const heading = d?.heading == null ? null : Number(d.heading);
			const routeSlug = parseLiveRouteSlug(d?.routeSlug);
			return {
				lat,
				lng,
				accuracy: Number.isFinite(accuracy) ? accuracy : null,
				heading: Number.isFinite(heading) && heading! >= 0 ? heading : null,
				routeSlug
			};
		}
	)
	.handler(async ({ data }) => {
		if (data.routeSlug) {
			const track = await getPlannedRouteTrack(data.routeSlug);
			if (!track) throw new Error('That planned route was not found.');
		}
		return saveLiveLocation(data);
	});

export const stopLiveLocation = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.handler(async () => {
		await clearLiveLocation();
		return { ok: true as const };
	});
