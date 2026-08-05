export type RunDay = 'Tuesday' | 'Friday' | 'Sunday';
export type SessionType = 'easy' | 'quality' | 'tempo' | 'long' | 'steady' | 'shakeout' | 'race' | 'other';

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

/** A run plus whether it has a stored map track (computed server-side). */
export type RunWithMap = RunRecord & { has_map: boolean };
