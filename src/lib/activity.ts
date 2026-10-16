import { parseDurationSeconds } from '$lib/format';
import { parseStrengthNotes } from '$lib/strength';
import type { RunRecord } from '$lib/types';
import {
	ACTIVITY_DEFS,
	ACTIVITY_MAP_COLORS,
	activityDef,
	coerceActivityType,
	importAliasMatch,
	type ActivityField,
	type ActivityType,
	type FeelField
} from '$lib/activity-registry';

export type {
	ActivityField,
	ActivityType,
	FeelField,
	HeadlineMode
} from '$lib/activity-registry';
export {
	ACTIVITY_DEFS,
	ACTIVITY_MAP_COLORS,
	ACTIVITY_TYPES,
	activityTypeSchema,
	coerceActivityType,
	recordForActivities
} from '$lib/activity-registry';

export function normalizeActivityType(v: string | null | undefined): ActivityType {
	return coerceActivityType(v);
}

/** GPX/TCX sport labels — same coercion as stored types (`ride` → bike, migration 0006). */
export function importActivityType(v: string | null | undefined): ActivityType {
	return normalizeActivityType(v);
}

/** Explicit picker wins; otherwise use the sport string from the file. */
export function resolveImportActivityType(
	override: string | null | undefined,
	detectedRaw: string | null | undefined
): ActivityType {
	const pick = override?.trim();
	if (pick) return importActivityType(pick);
	return importActivityType(detectedRaw);
}

/** Short line for the import review UI. */
export function importDetectionSummary(detectedRaw: string, resolved: ActivityType): string {
	const raw = detectedRaw.trim();
	if (!raw) {
		return `No sport in file — will log as ${activityLabel(resolved)}. Tap a type below if that’s wrong.`;
	}
	if (importAliasMatch(raw)) {
		return `“${raw}” → ${activityLabel(resolved)}`;
	}
	return `“${raw}” — will log as ${activityLabel(resolved)}. Tap below if that’s wrong.`;
}

export function activityMapColor(type: string | null | undefined): string {
	return ACTIVITY_MAP_COLORS[normalizeActivityType(type)];
}

export type ActivityMapLineStyle = { color: string; weight: number; opacity: number };

/** Overlay-map line: runs sit thicker and more opaque than other sports. */
export function activityMapLineStyle(type: string | null | undefined): ActivityMapLineStyle {
	const t = normalizeActivityType(type);
	const color = ACTIVITY_MAP_COLORS[t];
	if (ACTIVITY_DEFS[t].mapLineEmphasis) return { color, weight: 4.2, opacity: 0.94 };
	return { color, weight: 2.8, opacity: 0.62 };
}

export function activityLabel(v: string | null | undefined): string {
	return activityDef(v).label;
}

/** Plural noun for empty-state messages; 'all' (or unknown) → "activities". */
export function activityPlural(sport: string | null | undefined): string {
	if (sport && sport in ACTIVITY_DEFS) return ACTIVITY_DEFS[sport as ActivityType].plural;
	return 'activities';
}

/** Count label: "1 run", "21 activities", "3 strength sessions". */
export function activityCount(n: number, sport: string | null | undefined): string {
	if (n === 1) {
		if (sport && sport in ACTIVITY_DEFS) return ACTIVITY_DEFS[sport as ActivityType].countOne;
		return '1 activity';
	}
	return `${n} ${activityPlural(sport)}`;
}

/** Group caption: "21 activities · 192.5 km" (km omitted when 0 or strength-only). */
export function activityTally(n: number, sport: string | null | undefined, km?: number): string {
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

/** Which numeric / gear / weather fields make sense to show/edit for a type. */
export function showsField(activity: string | null | undefined, field: ActivityField): boolean {
	return activityDef(activity).fields[field];
}

/** Subjective feel chips — driven per type in the registry. */
export function showsFeel(activity: string | null | undefined, field: FeelField): boolean {
	return activityDef(activity).feel[field];
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

/** Sport-appropriate headline pace/speed: pace/km (run, walk), km/h (bike). */
export function headlineMetric(run: HeadlineRun): HeadlineMetric {
	const mode = activityDef(run.activity_type).headlineMode;
	const sec = parseDurationSeconds(run.time);

	if (mode === 'strength') {
		const dur = strengthDuration(run);
		if (dur) return { value: dur, unit: '' };
		const fallback = strengthWorkLabel(run);
		return { value: fallback || '—', unit: '' };
	}

	if (mode === 'kmh') {
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
	run: Pick<RunRecord, 'effort' | 'body_scores' | 'legs' | 'energy' | 'wanted_faster' | 'surface'>
): boolean {
	return (
		run.effort != null ||
		(run.body_scores?.length ?? 0) > 0 ||
		run.legs != null ||
		run.energy != null ||
		run.wanted_faster != null ||
		(run.surface ?? '').trim() !== ''
	);
}
