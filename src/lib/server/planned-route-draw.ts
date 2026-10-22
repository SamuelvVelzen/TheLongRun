import { localDateTimeToUtcMs } from '$lib/format';
import { densifyWaypoints, normalizeTrackPoints, normalizeWaypoints } from '$lib/gps-repair';
import { planSessionRouteKey } from '$lib/plan';
import type { PlanWeek, RunRecord } from '$lib/types';
import { brouterAlongPins } from './brouter';
import { timezoneForCoord } from './geo';
import { DEFAULT_START_HHMM } from './weather';

export function activityStartMs(
	run: Pick<RunRecord, 'date' | 'start_time'>,
	samples: { lat: number; lng: number; timeMs?: number }[]
): number | null {
	const timed = samples.find((p) => p.timeMs != null && Number.isFinite(p.timeMs));
	if (timed?.timeMs != null) return timed.timeMs;
	const coord = samples.find((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
	const tz = (coord && timezoneForCoord(coord.lat, coord.lng)) || 'Europe/Amsterdam';
	return localDateTimeToUtcMs(run.date, run.start_time || DEFAULT_START_HHMM, tz);
}

export async function trackFromDrawnPins(data: {
	waypoints: { lat: number; lng: number }[];
	follow_network?: boolean;
	network_coords?: { lat: number; lng: number; elev?: number }[];
}) {
	const pins = normalizeWaypoints(data.waypoints);
	if (pins.length < 2) throw new Error('Drop at least two pins.');

	let points = densifyWaypoints(pins);
	if (data.follow_network) {
		const previewed = normalizeTrackPoints(data.network_coords);
		if (previewed.length >= 2) {
			points = previewed;
		} else {
			const routed = await brouterAlongPins(pins);
			if (routed.length < 2) {
				throw new Error(
					'Could not follow roads between those pins. Uncheck Follow roads to save the straight line.'
				);
			}
			points = routed;
		}
	}

	return { pins, points };
}

export function startFinishWaypoints(pins: { lat: number; lng: number }[]) {
	return pins.map((p, i) => ({
		name: i === 0 ? 'Start' : i === pins.length - 1 ? 'Finish' : `Via ${i}`,
		lat: p.lat,
		lng: p.lng
	}));
}

export function matchingPlanSession(
	plan: PlanWeek[],
	week: number,
	day: string,
	label: string,
	activityType: string,
	sessionIndex?: number
) {
	const weekRow = plan.find((w) => w.week === week);
	if (!weekRow) return null;
	const key = planSessionRouteKey(day, label, activityType);
	if (sessionIndex != null) {
		if (sessionIndex < 0 || sessionIndex >= weekRow.sessions.length) return null;
		const session = weekRow.sessions[sessionIndex]!;
		if (planSessionRouteKey(session.day, session.label, session.activity_type) !== key) {
			return null;
		}
		return { weekRow, index: sessionIndex, session };
	}
	const index = weekRow.sessions.findIndex(
		(s) => planSessionRouteKey(s.day, s.label, s.activity_type) === key
	);
	if (index < 0) return null;
	return { weekRow, index, session: weekRow.sessions[index]! };
}
