import { ACTIVITY_TYPES, normalizeActivityType, type ActivityType } from '$lib/activity';
import type { CreateRunInput, UpdateRunInput } from '$lib/server/functions';
import type { RunRecord } from '$lib/types';
import { z } from 'zod';

export const ACTIVITY_SESSIONS = [
	'easy',
	'quality',
	'tempo',
	'steady',
	'long',
	'shakeout',
	'race',
	'other'
] as const;

export const activityFormSchema = z.object({
	date: z.string().trim().min(1, 'Date is required'),
	activity_type: z.enum(['run', 'walk', 'ride', 'strength']),
	session: z.string(),
	effort: z.number().nullable(),
	shins: z.number().nullable(),
	legs: z.number().nullable(),
	energy: z.number().nullable(),
	weather: z.string(),
	surface: z.string(),
	wanted_faster: z.enum(['Y', 'N', '']),
	distance_km: z.string(),
	start_time: z.string().min(1, 'Start time is required'),
	time: z.string(),
	avg_pace: z.string(),
	avg_hr: z.string(),
	max_hr: z.string(),
	elev_gain: z.string(),
	cadence: z.string(),
	gear: z.string(),
	notes: z.string(),
	before_notes: z.string(),
	after_notes: z.string()
});

export type ActivityFormValues = z.infer<typeof activityFormSchema>;

export function parseOptionalNumber(value: string): number | null {
	const v = value.trim();
	if (!v) return null;
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
}

function wantedFromForm(value: ActivityFormValues['wanted_faster']): boolean | null {
	if (value === 'Y') return true;
	if (value === 'N') return false;
	return null;
}

export function toCreateRunInput(values: ActivityFormValues): CreateRunInput {
	const activity_type = values.activity_type;
	return {
		date: values.date,
		activity_type,
		session: activity_type === 'run' ? values.session || 'easy' : 'other',
		effort: values.effort,
		shins: values.shins,
		legs: values.legs,
		energy: values.energy,
		weather: values.weather,
		surface: values.surface,
		wanted_faster: wantedFromForm(values.wanted_faster),
		distance_km: parseOptionalNumber(values.distance_km),
		start_time: values.start_time,
		time: values.time,
		avg_pace: values.avg_pace,
		avg_hr: parseOptionalNumber(values.avg_hr),
		max_hr: parseOptionalNumber(values.max_hr),
		elev_gain: parseOptionalNumber(values.elev_gain),
		cadence: parseOptionalNumber(values.cadence),
		gear: values.gear,
		notes: values.notes,
		before_notes: values.before_notes,
		after_notes: values.after_notes
	};
}

export function toUpdateRunInput(slug: string, values: ActivityFormValues): UpdateRunInput {
	return { slug, ...toCreateRunInput(values) };
}

function numStr(value: number | null | undefined): string {
	return value == null ? '' : String(value);
}

export function emptyActivityForm(partial?: Partial<ActivityFormValues>): ActivityFormValues {
	const activity_type =
		partial?.activity_type && ACTIVITY_TYPES.includes(partial.activity_type)
			? partial.activity_type
			: 'run';
	return {
		date: partial?.date ?? new Date().toISOString().slice(0, 10),
		activity_type,
		session: partial?.session ?? 'easy',
		effort: partial?.effort ?? null,
		shins: partial?.shins ?? null,
		legs: partial?.legs ?? null,
		energy: partial?.energy ?? null,
		weather: partial?.weather ?? '',
		surface: partial?.surface ?? 'asphalt',
		wanted_faster: partial?.wanted_faster ?? '',
		distance_km: partial?.distance_km ?? '',
		start_time: partial?.start_time ?? '',
		time: partial?.time ?? '',
		avg_pace: partial?.avg_pace ?? '',
		avg_hr: partial?.avg_hr ?? '',
		max_hr: partial?.max_hr ?? '',
		elev_gain: partial?.elev_gain ?? '',
		cadence: partial?.cadence ?? '',
		gear: partial?.gear ?? '',
		notes: partial?.notes ?? '',
		before_notes: partial?.before_notes ?? '',
		after_notes: partial?.after_notes ?? ''
	};
}

export function runToActivityForm(run: Pick<
	RunRecord,
	| 'date'
	| 'activity_type'
	| 'session'
	| 'effort'
	| 'shins'
	| 'legs'
	| 'energy'
	| 'weather'
	| 'surface'
	| 'wanted_faster'
	| 'distance_km'
	| 'start_time'
	| 'time'
	| 'avg_pace'
	| 'avg_hr'
	| 'max_hr'
	| 'elev_gain'
	| 'cadence'
	| 'gear'
	| 'notes'
	| 'before_notes'
	| 'after_notes'
>): ActivityFormValues {
	const activity_type = normalizeActivityType(run.activity_type);
	return {
		date: run.date,
		activity_type,
		session: run.session || (activity_type === 'run' ? 'easy' : 'other'),
		effort: run.effort,
		shins: run.shins,
		legs: run.legs,
		energy: run.energy,
		weather: run.weather || '',
		surface: run.surface || '',
		wanted_faster: run.wanted_faster === true ? 'Y' : run.wanted_faster === false ? 'N' : '',
		distance_km: numStr(run.distance_km),
		start_time: run.start_time || '',
		time: run.time || '',
		avg_pace: run.avg_pace || '',
		avg_hr: numStr(run.avg_hr),
		max_hr: numStr(run.max_hr),
		elev_gain: numStr(run.elev_gain),
		cadence: numStr(run.cadence),
		gear: run.gear || '',
		notes: run.notes || '',
		before_notes: run.before_notes || '',
		after_notes: run.after_notes || ''
	};
}

export type { ActivityType };
