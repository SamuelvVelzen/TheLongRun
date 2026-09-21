import { ACTIVITY_TYPES, type ActivityType } from '$lib/activity';
import { isRaceGoal, type GoalInput } from '$lib/goals';
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

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_HORIZON = /^\d{4}-\d{2}$/;

export const goalFormSchema = z
	.object({
		kind: z.enum(['race', 'intention']),
		name: z.string().trim().min(1, 'Name is required'),
		date: z.string(),
		horizon: z.string(),
		distance_km: z.string().trim().min(1, 'Distance is required'),
		sport: z.enum(['run', 'walk', 'ride', 'strength']),
		time_goal: z.string(),
		bib_number: z.string(),
		wave: z.string(),
		start_time: z.string(),
		plan_start: z.string(),
		url: z.string(),
		itinerary_url: z.string(),
		primary: z.string(),
		notes: z.string()
	})
	.refine((v) => v.kind === 'intention' || ISO_DATE.test(v.date.trim()), {
		path: ['date'],
		message: 'Race date is required'
	})
	.refine((v) => v.kind === 'race' || ISO_HORIZON.test(v.horizon.trim()), {
		path: ['horizon'],
		message: 'Pick a month so planning can look ahead'
	})
	.refine((v) => v.kind === 'intention' || v.plan_start.trim().length > 0, {
		path: ['plan_start'],
		message: 'Plan start is required'
	});

export type GoalFormValues = z.infer<typeof goalFormSchema>;

type GoalDraftFields = Pick<
	Goal,
	| 'name'
	| 'date'
	| 'horizon'
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

export function goalToFormValues(
	draft: GoalDraftFields,
	kind?: GoalFormValues['kind']
): GoalFormValues {
	const sport = ACTIVITY_TYPES.includes(draft.sport as ActivityType)
		? (draft.sport as ActivityType)
		: 'run';
	const resolved = kind ?? (isRaceGoal(draft) ? 'race' : 'intention');
	const date = resolved === 'race' ? draft.date : '';
	const horizon =
		resolved === 'intention'
			? draft.horizon || (ISO_DATE.test(draft.date) ? draft.date.slice(0, 7) : '')
			: ISO_DATE.test(draft.date)
				? draft.date.slice(0, 7)
				: draft.horizon;
	return {
		kind: resolved,
		name: draft.name,
		date,
		horizon,
		distance_km: String(draft.distance_km),
		sport,
		time_goal: draft.time_goal,
		bib_number: draft.bib_number ?? '',
		wave: draft.wave ?? '',
		start_time: draft.start_time ?? '',
		plan_start: resolved === 'race' ? draft.plan_start : '',
		url: draft.url ?? '',
		itinerary_url: draft.itinerary_url ?? '',
		primary: draft.primary.join('\n'),
		notes: draft.notes
	};
}

export function toGoalInput(values: GoalFormValues, id?: string): GoalInput {
	const intention = values.kind === 'intention';
	const date = intention ? '' : values.date;
	return {
		id,
		name: values.name,
		date,
		horizon: intention ? values.horizon : date.slice(0, 7),
		distance_km: Number(values.distance_km),
		sport: values.sport,
		time_goal: values.time_goal,
		bib_number: intention ? '' : values.bib_number,
		wave: intention ? '' : values.wave,
		start_time: intention ? '' : values.start_time,
		primary: values.primary.split('\n'),
		notes: values.notes,
		url: values.url,
		itinerary_url: values.itinerary_url,
		plan_start: intention ? '' : mondayIso(values.plan_start)
	};
}
