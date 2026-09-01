import type { BestEffort } from '$lib/best-efforts';

export type RunDay = string;
export type SessionType =
	'easy' | 'quality' | 'tempo' | 'long' | 'steady' | 'shakeout' | 'race' | 'other';

export interface RunRecord {
	slug: string;
	date: string;
	week: number | null;
	day: RunDay | string;
	activity_type: string;
	session: SessionType | string;
	effort: number | null;
	shins: number | null;
	legs: number | null;
	energy: number | null;
	weather: string;
	surface: string;
	wanted_faster: boolean | null;
	distance_km: number | null;
	/** Clock time the run started, local `HH:mm` (not duration). */
	start_time: string;
	/** Moving duration, e.g. `45:12` or `1:15:01`. */
	time: string;
	/** Elapsed duration including pauses, same format as `time`. */
	elapsed_time: string;
	avg_pace: string;
	avg_hr: number | null;
	max_hr: number | null;
	/** Elevation gain in meters. */
	elev_gain: number | null;
	calories: number | null;
	kilojoules: number | null;
	/** Max speed in km/h. */
	max_speed: number | null;
	cadence: number | null;
	shoes: string;
	summary_image: string;
	splits_image: string;
	strava_id: string;
	route: string;
	notes: string;
	/** Location reverse-geocoded from the activity's start coordinate (Nominatim), '' if unknown. */
	country: string;
	province: string;
	place: string;
	/** Fastest rolling windows (5k, 10k, …) computed from GPS or km splits. */
	best_efforts: BestEffort[];
	/** Legacy filesystem path; unused since the move to D1. */
	filepath?: string;
}

export type GoalStatus = 'active' | 'done';

export type GoalResult = {
	activity_slug: string;
	date: string;
	time: string;
	distance_km: number | null;
	pace: string;
};

export interface Goal {
	id: string;
	name: string;
	date: string;
	distance_km: number;
	sport: string;
	time_goal: string;
	primary: string[];
	notes: string;
	/** Monday of week 1. */
	plan_start: string;
	status: GoalStatus;
	result: GoalResult | null;
	/** Snapshot of plan.json when the goal was completed. */
	plan: PlanWeek[] | null;
}

export interface PlanSession {
	day: string;
	label: string;
	/** run | walk | ride | swim | strength — omitted on older plan rows (treat as run). */
	activity_type?: string;
	distance_km: number | null;
	detail: string;
}

export interface PlanWeek {
	week: number;
	dates: string;
	/** ISO Monday of this week; used to drop a stale rolling week. */
	start?: string;
	phase: string;
	focus: string;
	sessions: PlanSession[];
}

export interface CoachMessage {
	role: 'user' | 'assistant';
	content: string;
}

/** Downsampled lat/lng track (~180 points) for heatmap / list maps. Detail maps use full GeoJSON. */
export type RouteTrack = {
	id: string;
	coords: [number, number][];
};

/** Named via / start / end point from a planned BRouter export. */
export type PlannedWaypoint = {
	name: string;
	lat: number;
	lng: number;
};

/** Saved planned route (BRouter export) — not an activity. */
export type PlannedRoute = {
	slug: string;
	name: string;
	notes: string;
	distance_km: number | null;
	elev_gain: number | null;
	elev_loss: number | null;
	elev_min: number | null;
	elev_max: number | null;
	point_count: number;
	est_time: string;
	saved_on: string;
	country: string;
	province: string;
	place: string;
	waypoints: PlannedWaypoint[];
	/** Plan days this route is attached to (list views). */
	plan_link_count: number;
	/** Completed activities this route is attached to (list views). */
	activity_link_count: number;
};

/** Compact route shown on a plan session. */
export type SessionRouteRef = {
	slug: string;
	name: string;
	distance_km: number | null;
};

/** A planned route attached to an upcoming (or current) plan day. */
export type PlannedRoutePlanLink = {
	id: number;
	week: number;
	day: string;
	date: string | null;
	label: string;
	activity_type: string;
	distance_km: number | null;
};

/** A planned route attached to a logged activity. */
export type PlannedRouteActivityLink = {
	id: number;
	slug: string;
	date: string;
	day: string;
	activity_type: string;
	distance_km: number | null;
};

export type RouteAttachTakenBy = { slug: string; name: string };

/** Upcoming plan session a route can be attached to. */
export type PlanAttachOption = {
	week: number;
	day: string;
	date: string | null;
	label: string;
	activity_type: string;
	distance_km: number | null;
	taken_by: RouteAttachTakenBy | null;
};

/** Logged activity a route can be attached to. */
export type ActivityAttachOption = {
	slug: string;
	date: string;
	day: string;
	activity_type: string;
	distance_km: number | null;
	taken_by: RouteAttachTakenBy | null;
};

/** A run plus whether it has a stored map track (computed server-side). */
export type RunWithMap = RunRecord & { has_map: boolean };
