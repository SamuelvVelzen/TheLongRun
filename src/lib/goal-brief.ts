export type GoalBriefDraft = {
	name: string;
	date: string;
	horizon: string;
	distance_km: number | string | undefined;
	sport: string;
	time_goal: string;
	plan_start: string;
	url: string;
	itinerary_url: string;
	primary: string | string[] | undefined;
	notes: string;
	extra: string;
};
