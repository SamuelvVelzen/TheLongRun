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
	/** Legacy filesystem path; unused since the move to Postgres. */
	filepath?: string;
}

export interface Goals {
	race_name: string;
	race_date: string;
	race_distance_km: number;
	primary: string[];
	time_goal: string;
	notes: string;
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
	phase: string;
	focus: string;
	sessions: PlanSession[];
}

export interface CoachMessage {
	role: 'user' | 'assistant';
	content: string;
}

/** Downsampled lat/lng track for the dashboard all-routes map. */
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
};

/** A run plus whether it has a stored map track (computed server-side). */
export type RunWithMap = RunRecord & { has_map: boolean };
