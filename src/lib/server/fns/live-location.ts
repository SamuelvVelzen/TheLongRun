import { parseLiveRouteSlug, parseRouteGroupLiveSlug } from '$lib/live-location';
import type { ActivityAttachOption, ActivityGroupInfo, Goal, PlanAttachOption, PlannedRoute, PlannedRouteActivityLink, PlannedRoutePlanLink, PlanWeek, RouteTrack, RunRecord, RunWithMap, SessionRouteRef } from '$lib/types';
import type { ActivityFeelInput, DebriefRaceHint } from '$lib/debrief-types';
import type { GoalBriefDraft } from '$lib/goal-brief';
import type { PlanPeekData } from '$lib/plan-peek';
import type { CreateRunInput, UpdateRunInput } from '$lib/run-input';
import { createServerFn } from '@tanstack/react-start';
import { requireAuth } from '../auth';
import { clearLiveLocation, loadLiveLocation, saveLiveLocation } from '../context';
import { liveWatchersActive, touchLiveWatchSession } from '../live-watch-touch';
import { getPlannedRouteTrack, listPlannedRouteTracks } from '../planned-routes';
import { getPlannedRouteGroup } from '../planned-route-groups';

// ---------- reads ----------

/** Root-loader data shared by every page: sign-in state + the open body notes to score. */

export const getLiveLocation = createServerFn({ method: 'GET' })
	.validator((input: unknown) => {
		const bump =
			typeof input === 'object' && input != null && 'bump' in input
				? Number((input as { bump: unknown }).bump)
				: 0;
		return { bump: Number.isFinite(bump) ? bump : 0 };
	})
	.handler(async () => {
		const ping = await loadLiveLocation();
		if (!ping) return null;
		let routeTrack = null;
		let routeTracks: import('$lib/types').RouteTrack[] | null = null;
		if (ping.routeSlug) {
			try {
				const groupId = parseRouteGroupLiveSlug(ping.routeSlug);
				if (groupId) {
					const group = await getPlannedRouteGroup(groupId);
					if (group) {
						const all = await listPlannedRouteTracks();
						const ids = new Set(group.member_slugs);
						routeTracks = all.filter((t) => ids.has(t.id));
						routeTrack = routeTracks[0] ?? null;
					}
				} else {
					routeTrack = await getPlannedRouteTrack(ping.routeSlug);
				}
			} catch {
				routeTrack = null;
				routeTracks = null;
			}
		}
		const watchersActive = await liveWatchersActive();
		return { ...ping, routeTrack, routeTracks, watchersActive };
	});

/** Heartbeat while someone has the live watch map open — speeds up the broadcaster’s pings. */
export const touchLiveWatch = createServerFn({ method: 'POST' }).handler(async () => {
	await touchLiveWatchSession();
	return { ok: true as const };
});

export const getLiveWatchActive = createServerFn({ method: 'GET' }).handler(async () => {
	return { active: await liveWatchersActive() };
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
			const groupId = parseRouteGroupLiveSlug(data.routeSlug);
			if (groupId) {
				const group = await getPlannedRouteGroup(groupId);
				if (!group) throw new Error('That route group was not found.');
			} else {
				const track = await getPlannedRouteTrack(data.routeSlug);
				if (!track) throw new Error('That planned route was not found.');
			}
		}
		return saveLiveLocation(data);
	});

export const stopLiveLocation = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.handler(async () => {
		await clearLiveLocation();
		return { ok: true as const };
	});
