import { parseDurationSeconds } from '$lib/format';
import type { RunRecord } from '$lib/types';

export type ActivityType = 'run' | 'walk' | 'ride' | 'swim' | 'strength';
export const ACTIVITY_TYPES: ActivityType[] = ['run', 'walk', 'ride', 'swim', 'strength'];

const LABELS: Record<ActivityType, string> = {
	run: 'Run',
	walk: 'Walk',
	ride: 'Ride',
	swim: 'Swim',
	strength: 'Strength'
};

/** Coerce any stored/imported value to one of the supported activity types. */
export function normalizeActivityType(v: string | null | undefined): ActivityType {
	const t = String(v ?? '')
		.trim()
		.toLowerCase()
		.replace(/[\s_-]/g, '');
	if (['walk', 'walking', 'hike', 'hiking'].includes(t)) return 'walk';
	if (['ride', 'bike', 'biking', 'cycling', 'bicycle', 'cycle', 'ebikeride'].includes(t))
		return 'ride';
	if (['swim', 'swimming', 'openwaterswim', 'lapswimming'].includes(t)) return 'swim';
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
		case 'swim':
			return 'swims';
		case 'strength':
			return 'strength sessions';
		default:
			return 'activities';
	}
}

export type HeadlineMetric = { value: string; unit: string };

/** Sport-appropriate headline pace/speed: pace/km (run, walk), km/h (ride), /100m (swim). */
export function headlineMetric(
	run: Pick<RunRecord, 'activity_type' | 'avg_pace' | 'distance_km' | 'time'>
): HeadlineMetric {
	const t = normalizeActivityType(run.activity_type);
	const sec = parseDurationSeconds(run.time);

	if (t === 'strength') {
		// No distance/pace — the headline is the session duration.
		return { value: run.time || '—', unit: '' };
	}

	if (t === 'ride') {
		if (run.distance_km && sec) {
			return { value: (run.distance_km / (sec / 3600)).toFixed(1), unit: 'km/h' };
		}
		return { value: run.avg_pace || '—', unit: '/km' };
	}

	if (t === 'swim') {
		if (run.distance_km && sec) {
			const per100 = sec / (run.distance_km * 10);
			const m = Math.floor(per100 / 60);
			const s = Math.round(per100 % 60);
			return { value: `${m}:${String(s).padStart(2, '0')}`, unit: '/100m' };
		}
		return { value: run.avg_pace || '—', unit: '/100m' };
	}

	return { value: run.avg_pace || '—', unit: '/km' };
}

/** Compact one-string headline metric for list rows, e.g. "6:27/km", "24.3 km/h", "2:05/100m". */
export function metricText(
	run: Pick<RunRecord, 'activity_type' | 'avg_pace' | 'distance_km' | 'time'>
): string {
	const m = headlineMetric(run);
	return m.unit === 'km/h' ? `${m.value} km/h` : `${m.value}${m.unit}`;
}
