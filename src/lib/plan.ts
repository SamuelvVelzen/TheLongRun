/**
 * Training plan helpers + dashboard stats.
 */
import type { PlanWeek, RunRecord } from '$lib/types';

export function weekNumberForDate(dateStr: string): number | null {
	const start = new Date('2026-08-03T00:00:00');
	const d = new Date(`${dateStr}T00:00:00`);
	if (Number.isNaN(d.getTime())) return null;
	const idx = Math.floor((d.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
	if (idx < 1 || idx > 8) return idx;
	return idx;
}

export function avg(nums: (number | null | undefined)[]) {
	const vals = nums.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
	if (!vals.length) return null;
	return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function sumDistance(runs: RunRecord[]) {
	return runs.reduce((acc, r) => acc + (r.distance_km ?? 0), 0);
}

export function plannedSessionFor(week: PlanWeek | null, day: string) {
	if (!week) return null;
	return week.sessions.find((s) => s.day.toLowerCase() === day.toLowerCase()) ?? null;
}
