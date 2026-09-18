import { ACTIVITY_TYPES, type ActivityType } from '$lib/activity';
import type { GoalInput } from '$lib/goals';
import { mondayIso } from '$lib/plan';
import type { Goal } from '$lib/types';
import { z } from 'zod';

export const medalDetailsSchema = z.object({
	bib_number: z.string(),
	result_url: z.string(),
	medal_notes: z.string()
});

export type MedalDetailsValues = z.infer<typeof medalDetailsSchema>;

export const pinRaceSchema = z.object({
	pinSlug: z.string().min(1, 'Import or log the race first, then pin it here.')
});

export const goalFormSchema = z.object({
	name: z.string().trim().min(1, 'Race name is required'),
	date: z.string().trim().min(1, 'Race date is required'),
	distance_km: z.string().trim().min(1, 'Distance is required'),
	sport: z.enum(['run', 'walk', 'ride', 'strength']),
	time_goal: z.string(),
	bib_number: z.string(),
	wave: z.string(),
	start_time: z.string(),
	plan_start: z.string().trim().min(1, 'Plan start is required'),
	url: z.string(),
	itinerary_url: z.string(),
	primary: z.string(),
	notes: z.string()
});

export type GoalFormValues = z.infer<typeof goalFormSchema>;

type GoalDraftFields = Pick<
	Goal,
	| 'name'
	| 'date'
	| 'distance_km'
	| 'sport'
	| 'time_goal'
	| 'bib_number'
	| 'wave'
	| 'start_time'
	| 'plan_start'
	| 'url'
	| 'itinerary_url'
	| 'primary'
	| 'notes'
>;

export function goalToFormValues(draft: GoalDraftFields): GoalFormValues {
	const sport = ACTIVITY_TYPES.includes(draft.sport as ActivityType)
		? (draft.sport as ActivityType)
		: 'run';
	return {
		name: draft.name,
		date: draft.date,
		distance_km: String(draft.distance_km),
		sport,
		time_goal: draft.time_goal,
		bib_number: draft.bib_number ?? '',
		wave: draft.wave ?? '',
		start_time: draft.start_time ?? '',
		plan_start: draft.plan_start,
		url: draft.url ?? '',
		itinerary_url: draft.itinerary_url ?? '',
		primary: draft.primary.join('\n'),
		notes: draft.notes
	};
}

export function toGoalInput(values: GoalFormValues, id?: string): GoalInput {
	return {
		id,
		name: values.name,
		date: values.date,
		distance_km: Number(values.distance_km),
		sport: values.sport,
		time_goal: values.time_goal,
		bib_number: values.bib_number,
		wave: values.wave,
		start_time: values.start_time,
		primary: values.primary.split('\n'),
		notes: values.notes,
		url: values.url,
		itinerary_url: values.itinerary_url,
		plan_start: mondayIso(values.plan_start)
	};
}
