import { parseDurationSeconds } from '$lib/format';
import { parseStrengthNotes } from '$lib/strength';
import type { RunRecord } from '$lib/types';

export type ActivityType = 'run' | 'walk' | 'ride' | 'strength';
export const ACTIVITY_TYPES: ActivityType[] = ['run', 'walk', 'ride', 'strength'];

const LABELS: Record<ActivityType, string> = {
	run: 'Run',
	walk: 'Walk',
	ride: 'Ride',
	strength: 'Strength'
};

/** GPS track colours. Run stays the lime accent so it reads first on overlay maps. */
export const ACTIVITY_MAP_COLORS: Record<ActivityType, string> = {
	run: '#c8f25a',
	walk: '#6ec8ff',
	ride: '#ffb36b',
	strength: '#d4a5ff'
};

export function activityMapColor(type: string | null | undefined): string {
	return ACTIVITY_MAP_COLORS[normalizeActivityType(type)];
}

export type ActivityMapLineStyle = { color: string; weight: number; opacity: number };

/** Overlay-map line: runs sit thicker and more opaque than other sports. */
export function activityMapLineStyle(type: string | null | undefined): ActivityMapLineStyle {
	const t = normalizeActivityType(type);
	const color = ACTIVITY_MAP_COLORS[t];
	if (t === 'run') return { color, weight: 4.2, opacity: 0.94 };
	return { color, weight: 2.8, opacity: 0.62 };
}

/** Coerce any stored/imported value to one of the supported activity types. */
export function normalizeActivityType(v: string | null | undefined): ActivityType {
	const t = String(v ?? '')
		.trim()
		.toLowerCase()
		.replace(/[\s_-]/g, '');
	if (['walk', 'walking', 'hike', 'hiking'].includes(t)) return 'walk';
	if (['ride', 'bike', 'biking', 'cycling', 'bicycle', 'cycle', 'ebikeride'].includes(t))
		return 'ride';
	if (
		['strength', 'strengthtraining', 'weighttraining', 'weights', 'weightlifting', 'gym', 'workout', 'crossfit'].includes(
			t
		)
	)
		return 'strength';
	return 'run';
}

export function activityLabel(v: string | null | undefined): string {
	return LABELS[normalizeActivityType(v)];
}

/** Plural noun for empty-state messages; 'all' (or unknown) → "activities". */
export function activityPlural(sport: string | null | undefined): string {
	switch (sport) {
		case 'run':
			return 'runs';
		case 'walk':
			return 'walks';
		case 'ride':
			return 'rides';
		case 'strength':
			return 'strength sessions';
		default:
			return 'activities';
	}
}

/** Count label: "1 run", "21 activities", "3 strength sessions". */
export function activityCount(n: number, sport: string | null | undefined): string {
	if (n === 1) {
		switch (sport) {
			case 'run':
				return '1 run';
			case 'walk':
				return '1 walk';
			case 'ride':
				return '1 ride';
			case 'strength':
				return '1 strength session';
			default:
				return '1 activity';
		}
	}
	return `${n} ${activityPlural(sport)}`;
}

/** Group caption: "21 activities · 192.5 km" (km omitted when 0 or strength-only). */
export function activityTally(
	n: number,
	sport: string | null | undefined,
	km?: number
): string {
	const head = activityCount(n, sport);
	if (sport === 'strength' || km == null || km <= 0) return head;
	return `${head} · ${km} km`;
}

/** List heading: "Recent activities" / "Runs in range". */
export function activityListHeading(
	sport: string | null | undefined,
	kind: 'recent' | 'range'
): string {
	const noun = activityPlural(sport);
	if (kind === 'range') return `${noun.charAt(0).toUpperCase()}${noun.slice(1)} in range`;
	return `Recent ${noun}`;
}

export type ActivityField =
	| 'distance'
	| 'pace'
	| 'hr'
	| 'elevation'
	| 'cadence'
	| 'gear'
	| 'surface'
	| 'weather';

export type FeelField = 'effort' | 'shins' | 'legs' | 'energy' | 'wanted_faster';

/** Which numeric / gear / weather fields make sense to show/edit for a type. */
export function showsField(activity: string | null | undefined, field: ActivityField): boolean {
	const t = normalizeActivityType(activity);
	switch (field) {
		case 'distance':
			return t !== 'strength';
		case 'pace':
			return t === 'run' || t === 'walk';
		case 'hr':
			return t !== 'strength';
		case 'elevation':
			return t === 'run' || t === 'walk' || t === 'ride';
		case 'cadence':
			return t === 'run';
		case 'gear':
			return t === 'run' || t === 'walk' || t === 'ride';
		case 'surface':
			return t === 'run' || t === 'walk';
		case 'weather':
			return t !== 'strength';
	}
}

/** Subjective feel chips — shins is run/walk, wanted-faster is run-only. */
export function showsFeel(activity: string | null | undefined, field: FeelField): boolean {
	const t = normalizeActivityType(activity);
	switch (field) {
		case 'effort':
		case 'energy':
		case 'legs':
			return true;
		case 'shins':
			return t === 'run' || t === 'walk';
		case 'wanted_faster':
			return t === 'run';
	}
}

export function paceFieldLabel(_activity: string | null | undefined): string {
	return 'Avg pace /km';
}

export type HeadlineMetric = { value: string; unit: string };

type HeadlineRun = Pick<
	RunRecord,
	'activity_type' | 'avg_pace' | 'distance_km' | 'time' | 'elapsed_time'
> & {
	notes?: string;
};

function strengthDuration(run: Pick<RunRecord, 'time' | 'elapsed_time'>): string {
	return run.time?.trim() || run.elapsed_time?.trim() || '';
}

function strengthWorkLabel(run: { notes?: string }): string {
	const { exercises } = parseStrengthNotes(run.notes);
	if (exercises.length === 1) return exercises[0]!.name;
	if (exercises.length > 1) return `${exercises.length} sets`;
	return '';
}

function feelSubParts(
	run: Pick<RunRecord, 'activity_type' | 'effort' | 'legs' | 'energy'>
): string[] {
	const parts: string[] = [];
	if (showsFeel(run.activity_type, 'effort') && run.effort != null) {
		parts.push(`effort ${run.effort}`);
	}
	if (showsFeel(run.activity_type, 'legs') && run.legs != null) {
		parts.push(`legs ${run.legs}`);
	}
	if (showsFeel(run.activity_type, 'energy') && run.energy != null) {
		parts.push(`energy ${run.energy}`);
	}
	return parts;
}

/** Compact subtitle for dashboard / list rows, e.g. "Wed · easy · W6 · HR 156". */
export function activitySub(
	run: Pick<
		RunRecord,
		| 'day'
		| 'session'
		| 'week'
		| 'avg_hr'
		| 'elev_gain'
		| 'activity_type'
		| 'effort'
		| 'legs'
		| 'energy'
		| 'notes'
		| 'time'
		| 'elapsed_time'
	>
): string {
	const parts: string[] = [];
	if (run.day) parts.push(String(run.day).slice(0, 3));
	if (run.session && run.session !== 'other') parts.push(run.session);
	if (run.week != null) parts.push(`W${run.week}`);

	if (normalizeActivityType(run.activity_type) === 'strength') {
		parts.push(...feelSubParts(run));
		if (strengthDuration(run)) {
			const work = strengthWorkLabel(run);
			if (work) parts.push(work);
		}
		return parts.join(' · ');
	}

	if (run.avg_hr != null) parts.push(`HR ${run.avg_hr}`);
	if (run.elev_gain != null && showsField(run.activity_type, 'elevation')) {
		parts.push(`↑ ${run.elev_gain} m`);
	}
	return parts.join(' · ');
}

/** Sport-appropriate headline pace/speed: pace/km (run, walk), km/h (ride). */
export function headlineMetric(run: HeadlineRun): HeadlineMetric {
	const t = normalizeActivityType(run.activity_type);
	const sec = parseDurationSeconds(run.time);

	if (t === 'strength') {
		const dur = strengthDuration(run);
		if (dur) return { value: dur, unit: '' };
		const fallback = strengthWorkLabel(run);
		return { value: fallback || '—', unit: '' };
	}

	if (t === 'ride') {
		if (run.distance_km && sec) {
			return { value: (run.distance_km / (sec / 3600)).toFixed(1), unit: 'km/h' };
		}
		return { value: run.avg_pace || '—', unit: '/km' };
	}

	return { value: run.avg_pace || '—', unit: '/km' };
}

/** Compact one-string headline metric for list rows, e.g. "6:27/km", "24.3 km/h". */
export function metricText(run: HeadlineRun): string {
	const m = headlineMetric(run);
	return m.unit === 'km/h' ? `${m.value} km/h` : `${m.value}${m.unit}`;
}

/**
 * True when a run carries subjective "how it felt" data — the feel scores, wanted-faster, or
 * surface. Notes are deliberately excluded: Strava imports dump the activity title there, which
 * is not "how it felt" and would flag almost everything.
 */
export function hasContext(
	run: Pick<RunRecord, 'effort' | 'shins' | 'legs' | 'energy' | 'wanted_faster' | 'surface'>
): boolean {
	return (
		run.effort != null ||
		run.shins != null ||
		run.legs != null ||
		run.energy != null ||
		run.wanted_faster != null ||
		(run.surface ?? '').trim() !== ''
	);
}
