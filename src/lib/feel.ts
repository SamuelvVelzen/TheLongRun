import { normalizeActivityType, showsFeel, showsField } from '$lib/activity';
import { parseStrengthNotes } from '$lib/strength';
import type { RunRecord } from '$lib/types';

/** Strava / import titles stored in notes — not a real debrief write-up. */
export function isImportNote(n: string): boolean {
	return /^imported from/i.test(n.trim());
}

/**
 * True when the activity has subjective debrief data (coach / debrief step 2).
 * Same rules as coach “no feel yet” — not the lighter `hasContext` used on list badges.
 */
export function hasFeel(r: RunRecord): boolean {
	const t = normalizeActivityType(r.activity_type);
	return (
		r.effort != null ||
		(showsFeel(t, 'body') && r.body_scores.length > 0) ||
		r.legs != null ||
		r.energy != null ||
		(showsFeel(t, 'wanted_faster') && r.wanted_faster != null) ||
		(showsField(t, 'surface') && (r.surface ?? '').trim() !== '') ||
		(t !== 'strength' && (r.notes ?? '').trim() !== '' && !isImportNote(r.notes))
	);
}

export type FeelFilterKind = 'all' | 'yes' | 'no';

export function parseFeelSearch(raw: unknown): FeelFilterKind | undefined {
	if (raw === 'yes' || raw === 'no') return raw;
	return undefined;
}

export function feelFilterActive(feel: string): boolean {
	return feel === 'yes' || feel === 'no';
}

export function matchesFeelFilter(run: RunRecord, feel: string): boolean {
	if (!feel || feel === 'all') return true;
	if (feel === 'yes') return hasFeel(run);
	if (feel === 'no') return !hasFeel(run);
	return true;
}

export function feelSummaryLabel(feel: string): string {
	if (feel === 'yes') return 'Has feel';
	if (feel === 'no') return 'No feel yet';
	return 'All feel';
}
