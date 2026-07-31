/**
 * Training plan helpers + dashboard stats.
 */
import { formatDuration, parseDurationSeconds } from '$lib/format';
import type { PlanWeek, RunRecord } from '$lib/types';

export function weekNumberForDate(dateStr: string): number | null {
	const start = new Date('2026-08-03T00:00:00');
	const d = new Date(`${dateStr}T00:00:00`);
	if (Number.isNaN(d.getTime())) return null;
	const idx = Math.floor((d.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
	if (idx < 1 || idx > 8) return null;
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

function isoDateLocal(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

function round1(n: number): number {
	return Math.round(n * 10) / 10;
}

/** Consecutive Tue/Fri/Sun hits walking backward from today. */
export function trainingDayStreak(runs: RunRecord[]): number {
	const dates = new Set(runs.map((r) => r.date));
	const training = new Set([0, 2, 5]); // Sun, Tue, Fri
	const d = new Date();
	d.setHours(12, 0, 0, 0);
	let streak = 0;
	for (let i = 0; i < 120; i++) {
		if (training.has(d.getDay())) {
			if (dates.has(isoDateLocal(d))) streak++;
			else break;
		}
		d.setDate(d.getDate() - 1);
	}
	return streak;
}

export type DashboardStats = {
	daysToRace: number | null;
	totalKm: number;
	runCount: number;
	avgEffort: number | null;
	avgShins: number | null;
	avgHr: number | null;
	elevGain: number;
	monthRuns: number;
	monthKm: number;
	weekKm: number;
	longestKm: number | null;
	avgPace: string | null;
	shinRecent: number | null;
	shinPrior: number | null;
	shinDelta: number | null;
	mappedRuns: number;
	streak: number;
};

export function buildDashboardStats(
	runs: RunRecord[],
	opts: { daysToRace: number | null; mappedRuns: number }
): DashboardStats {
	const now = new Date();
	now.setHours(12, 0, 0, 0);
	const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
	const weekAgo = new Date(now);
	weekAgo.setDate(weekAgo.getDate() - 6);
	const weekStart = isoDateLocal(weekAgo);
	const today = isoDateLocal(now);

	const monthRunsList = runs.filter((r) => r.date.startsWith(monthPrefix));
	const weekRuns = runs.filter((r) => r.date >= weekStart && r.date <= today);

	const distances = runs
		.map((r) => r.distance_km)
		.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
	const longestKm = distances.length ? Math.max(...distances) : null;

	const paceSecs = runs
		.map((r) => parseDurationSeconds(r.avg_pace))
		.filter((n): n is number => n != null && n > 0 && n < 60 * 20);
	const avgPaceSecs = avg(paceSecs);
	const avgPace = avgPaceSecs != null ? formatDuration(avgPaceSecs) : null;

	const withShins = runs.filter((r) => r.shins != null);
	const shinRecent = avg(withShins.slice(0, 4).map((r) => r.shins));
	const shinPrior = avg(withShins.slice(4, 8).map((r) => r.shins));
	const shinDelta =
		shinRecent != null && shinPrior != null ? round1(shinRecent - shinPrior) : null;

	return {
		daysToRace: opts.daysToRace,
		totalKm: round1(sumDistance(runs)),
		runCount: runs.length,
		avgEffort: avg(runs.map((r) => r.effort)),
		avgShins: avg(runs.map((r) => r.shins)),
		avgHr: avg(runs.map((r) => r.avg_hr)),
		elevGain: Math.round(runs.reduce((a, r) => a + (r.elev_gain ?? 0), 0)),
		monthRuns: monthRunsList.length,
		monthKm: round1(sumDistance(monthRunsList)),
		weekKm: round1(sumDistance(weekRuns)),
		longestKm: longestKm != null ? round1(longestKm) : null,
		avgPace,
		shinRecent: shinRecent != null ? round1(shinRecent) : null,
		shinPrior: shinPrior != null ? round1(shinPrior) : null,
		shinDelta,
		mappedRuns: opts.mappedRuns,
		streak: trainingDayStreak(runs)
	};
}
