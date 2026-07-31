export type RunDay = 'Tuesday' | 'Friday' | 'Sunday';
export type SessionType = 'easy' | 'quality' | 'tempo' | 'long' | 'steady' | 'shakeout' | 'race' | 'other';

export interface RunRecord {
	slug: string;
	date: string;
	week: number | null;
	day: RunDay | string;
	session: SessionType | string;
	effort: number | null;
	shins: number | null;
	legs: number | null;
	energy: number | null;
	weather: string;
	surface: string;
	wanted_faster: boolean | null;
	distance_km: number | null;
	time: string;
	avg_pace: string;
	avg_hr: number | null;
	cadence: number | null;
	shoes: string;
	summary_image: string;
	splits_image: string;
	strava_id: string;
	notes: string;
	filepath: string;
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
