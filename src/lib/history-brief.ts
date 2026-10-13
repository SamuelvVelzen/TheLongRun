import { ACTIVITY_TYPES, activityCount, normalizeActivityType } from '$lib/activity';
import { distanceLabel, formatEffortTime, type BestEffortKey } from '$lib/best-efforts';
import { parseDurationSeconds } from '$lib/format';
import { paceFromSeconds } from '$lib/pace-profile';
import { isoDateLocal, mondayIso } from '$lib/plan';
import type { RunRecord } from '$lib/types';

/** Weekly volume covers a full race block. */
export const HISTORY_WEEKS = 20;
/** Monthly lines run back this far; anything older is one line per calendar year. */
export const HISTORY_MONTHS = 12;

const PB_KEYS: BestEffortKey[] = ['5k', '10k', 'half', 'marathon'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function round1(n: number): number {
	return Math.round(n * 10) / 10;
}

function avg(values: (number | null)[]): number | null {
	const list = values.filter((v): v is number => v != null);
	return list.length ? round1(list.reduce((a, b) => a + b, 0) / list.length) : null;
}

function addDays(iso: string, days: number): string {
	const d = new Date(`${iso}T12:00:00`);
	d.setDate(d.getDate() + days);
	return isoDateLocal(d);
}

function isRun(r: RunRecord): boolean {
	return normalizeActivityType(r.activity_type) === 'run';
}

/** "3 runs 24.5 km, 1 bike 30 km, 2 strength" — sports in fixed order. */
export function sportVolume(runs: RunRecord[]): string {
	const bits: string[] = [];
	for (const t of ACTIVITY_TYPES) {
		const list = runs.filter((r) => normalizeActivityType(r.activity_type) === t);
		if (!list.length) continue;
		if (t === 'strength') {
			bits.push(`${list.length} strength`);
			continue;
		}
		const km = round1(list.reduce((a, r) => a + (r.distance_km ?? 0), 0));
		bits.push(`${activityCount(list.length, t)}${km ? ` ${km} km` : ''}`);
	}
	return bits.join(', ');
}

function medianPace(runs: RunRecord[]): string | null {
	const secs = runs
		.map((r) => parseDurationSeconds(r.avg_pace))
		.filter((s): s is number => s != null && s > 120 && s < 20 * 60)
		.sort((a, b) => a - b);
	if (!secs.length) return null;
	return paceFromSeconds(secs[Math.floor(secs.length / 2)]!);
}

/** One summary line for a month or year: volume, longest run, easy pace, feel averages. */
function periodLine(label: string, runs: RunRecord[], pain: string): string {
	if (!runs.length) return `- ${label}: none`;
	const runList = runs.filter(isRun);
	const longest = runList.reduce((m, r) => Math.max(m, r.distance_km ?? 0), 0);
	const easy = runList.filter((r) => String(r.session).toLowerCase() === 'easy');
	const easyPace = medianPace(easy.length >= 2 ? easy : runList);
	const effort = avg(runs.map((r) => r.effort));
	const painAvg = avg(runList.map((r) => r.shins));
	const extra = [
		longest ? `longest ${round1(longest)} km` : '',
		easyPace ? `${easy.length >= 2 ? 'easy' : 'run'} pace ~${easyPace}` : '',
		effort != null ? `effort ${effort}` : '',
		painAvg != null ? `${pain.toLowerCase()} ${painAvg}` : ''
	].filter(Boolean);
	return `- ${label}: ${sportVolume(runs)}${extra.length ? ` · ${extra.join(' · ')}` : ''}`;
}

export type HistoryTiers = {
	weekly: string;
	monthly: string;
	yearly: string;
};

/**
 * Detail shrinks with age so the brief stays the same size however long the history is:
 * weekly lines for the last 20 weeks, monthly lines back to 12 months, then one line per year.
 */
export function buildHistoryTiers(allRuns: RunRecord[], today: Date, pain: string): HistoryTiers {
	const todayIso = isoDateLocal(today);
	const thisMonday = mondayIso(todayIso);
	const weeklyStart = addDays(thisMonday, -7 * (HISTORY_WEEKS - 1));
	const runs = allRuns.filter((r) => r.date <= todayIso);

	const earliest = runs.reduce((m, r) => (r.date < m ? r.date : m), todayIso);
	const weekLines: string[] = [];
	for (let i = 0; i < HISTORY_WEEKS; i++) {
		const wk = addDays(thisMonday, -7 * i);
		const end = addDays(wk, 6);
		if (end < earliest) break;
		const inWeek = runs.filter((r) => r.date >= wk && r.date <= end);
		weekLines.push(`- ${wk}: ${sportVolume(inWeek) || 'none'}`);
	}

	// Months strictly before the weekly tier, back to 12 months ago.
	const firstMonth = new Date(today.getFullYear(), today.getMonth() - (HISTORY_MONTHS - 1), 1);
	const monthlyStartIso = isoDateLocal(firstMonth);
	const monthLines: string[] = [];
	const cursor = new Date(firstMonth);
	while (true) {
		const start = isoDateLocal(cursor);
		const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
		const endExclusive = isoDateLocal(next);
		const stop = endExclusive > weeklyStart ? weeklyStart : endExclusive;
		if (start >= weeklyStart) break;
		const inMonth = runs.filter((r) => r.date >= start && r.date < stop);
		const label = `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}${stop !== endExclusive ? ' (part)' : ''}`;
		if (inMonth.length || monthLines.length) monthLines.push(periodLine(label, inMonth, pain));
		cursor.setMonth(cursor.getMonth() + 1);
	}

	const older = runs.filter((r) => r.date < monthlyStartIso);
	const years = [...new Set(older.map((r) => r.date.slice(0, 4)))].sort().reverse();
	const yearLines = years.map((y) => {
		const inYear = older.filter((r) => r.date.startsWith(y));
		const partial = monthlyStartIso.startsWith(y) ? ` (to ${MONTHS[firstMonth.getMonth() - 1] ?? 'Dec'})` : '';
		return periodLine(`${y}${partial}`, inYear, pain);
	});

	return {
		weekly: weekLines.length
			? `## Weekly volume (Monday weeks, last ${HISTORY_WEEKS}, newest first)\n${weekLines.join('\n')}`
			: '',
		monthly: monthLines.length
			? `## Monthly (before the weekly view, newest first)\n${monthLines.reverse().join('\n')}`
			: '',
		yearly: yearLines.length ? `## Earlier years\n${yearLines.join('\n')}` : ''
	};
}

/** Fastest logged 5k / 10k / half / marathon across all runs. */
export function personalBestsLine(allRuns: RunRecord[]): string {
	const best = new Map<BestEffortKey, { seconds: number; date: string }>();
	for (const r of allRuns) {
		if (!isRun(r)) continue;
		for (const e of r.best_efforts ?? []) {
			if (!PB_KEYS.includes(e.key)) continue;
			const cur = best.get(e.key);
			if (!cur || e.seconds < cur.seconds) best.set(e.key, { seconds: e.seconds, date: r.date });
		}
	}
	const bits = PB_KEYS.filter((k) => best.has(k)).map((k) => {
		const b = best.get(k)!;
		return `${distanceLabel(k)} ${formatEffortTime(b.seconds)} (${b.date})`;
	});
	return bits.length ? `- PBs: ${bits.join(' · ')}` : '';
}
