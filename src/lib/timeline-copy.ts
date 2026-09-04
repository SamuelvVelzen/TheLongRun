/**
 * Clipboard snapshot of the filtered timeline — for pasting into a chat
 * and asking overview questions (race readiness, load, when to race).
 */
import {
	ACTIVITY_TYPES,
	activityCount,
	activityLabel,
	activityPlural,
	metricText,
	normalizeActivityType,
	type ActivityType
} from '$lib/activity';
import { formatDuration, parseDurationSeconds } from '$lib/format';
import { mondayIso, sumDistance } from '$lib/plan';
import { parseStrengthNotes, strengthSummary } from '$lib/strength';
import type { RunRecord } from '$lib/types';

function round1(n: number): number {
	return Math.round(n * 10) / 10;
}

function isImportNote(n: string): boolean {
	return /^imported from/i.test(n.trim());
}

function notesForRow(r: RunRecord): string {
	const isStrength = normalizeActivityType(r.activity_type) === 'strength';
	let notesText = r.notes || '';
	if (isImportNote(notesText)) notesText = '';
	else if (isStrength) {
		const p = parseStrengthNotes(r.notes);
		notesText = [strengthSummary(p.exercises), p.extra].filter(Boolean).join(' — ');
		if (isImportNote(notesText)) notesText = '';
	}
	return notesText
		.replace(/\s+/g, ' ')
		.replace(/\|/g, '/')
		.trim()
		.slice(0, isStrength ? 400 : 140);
}

function feelCell(r: RunRecord): string {
	return [r.effort, r.shins, r.legs, r.energy].map((v) => (v == null ? '–' : v)).join('/');
}

function sessionCell(r: RunRecord): string {
	const s = String(r.session ?? '').trim();
	if (!s || s === 'other') return '–';
	return s;
}

function kmCell(r: RunRecord): string {
	if (normalizeActivityType(r.activity_type) === 'strength') return '–';
	return r.distance_km != null ? String(r.distance_km) : '–';
}

function newestFirst(a: RunRecord, b: RunRecord): number {
	if (a.date !== b.date) return a.date > b.date ? -1 : 1;
	const ta = a.start_time || '';
	const tb = b.start_time || '';
	if (ta !== tb) return ta > tb ? -1 : 1;
	return (a.slug ?? '').localeCompare(b.slug ?? '');
}

type WeekBucket = {
	counts: Partial<Record<ActivityType, number>>;
	km: Partial<Record<ActivityType, number>>;
};

function weekBuckets(runs: RunRecord[]): Map<string, WeekBucket> {
	const map = new Map<string, WeekBucket>();
	for (const r of runs) {
		if (!r.date) continue;
		const wk = mondayIso(r.date);
		const t = normalizeActivityType(r.activity_type);
		const e = map.get(wk) ?? { counts: {}, km: {} };
		e.counts[t] = (e.counts[t] ?? 0) + 1;
		if (t !== 'strength') e.km[t] = (e.km[t] ?? 0) + (r.distance_km ?? 0);
		map.set(wk, e);
	}
	return map;
}

function formatWeekBits(e: WeekBucket): string {
	const bits = ACTIVITY_TYPES.filter((t) => e.counts[t]).map((t) => {
		const n = e.counts[t]!;
		if (t === 'strength') return `${n} strength`;
		const km = round1(e.km[t] ?? 0);
		const name = n === 1 ? activityLabel(t).toLowerCase() : activityPlural(t);
		return `${n} ${name}${km ? ` (${km} km)` : ''}`;
	});
	return bits.join(', ') || 'no sessions';
}

function weekKm(e: WeekBucket): number {
	return ACTIVITY_TYPES.reduce((acc, t) => acc + (e.km[t] ?? 0), 0);
}

function sportBreakdown(runs: RunRecord[]): string {
	const bits = ACTIVITY_TYPES.map((t) => {
		const rows = runs.filter((r) => normalizeActivityType(r.activity_type) === t);
		if (!rows.length) return null;
		if (t === 'strength') return activityCount(rows.length, t);
		const km = round1(sumDistance(rows));
		return km > 0 ? `${activityCount(rows.length, t)} (${km} km)` : activityCount(rows.length, t);
	}).filter(Boolean);
	return bits.join(', ') || 'none';
}

function movingTimeLabel(runs: RunRecord[]): string | null {
	let secs = 0;
	let any = false;
	for (const r of runs) {
		const n = parseDurationSeconds(r.time);
		if (n == null || n <= 0) continue;
		secs += n;
		any = true;
	}
	if (!any) return null;
	return formatDuration(secs) || null;
}

function avgPaceLabel(runs: RunRecord[]): string | null {
	const paceSecs = runs
		.filter((r) => {
			const t = normalizeActivityType(r.activity_type);
			return t === 'run' || t === 'walk';
		})
		.map((r) => parseDurationSeconds(r.avg_pace))
		.filter((n): n is number => n != null && n > 0 && n < 60 * 20);
	if (!paceSecs.length) return null;
	const mean = Math.round(paceSecs.reduce((a, b) => a + b, 0) / paceSecs.length);
	const formatted = formatDuration(mean);
	return formatted ? `${formatted}/km` : null;
}

function avgHrLabel(runs: RunRecord[]): string | null {
	const hrs = runs.map((r) => r.avg_hr).filter((n): n is number => n != null && n > 0);
	if (!hrs.length) return null;
	return String(Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length));
}

function weeksSpanned(first: string, last: string): number {
	const a = new Date(`${mondayIso(first)}T12:00:00`).getTime();
	const b = new Date(`${mondayIso(last)}T12:00:00`).getTime();
	if (!Number.isFinite(a) || !Number.isFinite(b)) return 1;
	return Math.max(1, Math.round(Math.abs(b - a) / (7 * 24 * 60 * 60 * 1000)) + 1);
}

function addWeeks(monday: string, weeks: number): string {
	const d = new Date(`${monday}T12:00:00`);
	d.setDate(d.getDate() + weeks * 7);
	return mondayIso(d);
}

/** Sum km over `count` Monday weeks ending at `endMonday` (missing weeks count as 0). */
function calendarKm(buckets: Map<string, WeekBucket>, endMonday: string, count: number): number {
	let total = 0;
	for (let i = 0; i < count; i++) {
		const e = buckets.get(addWeeks(endMonday, -i));
		if (e) total += weekKm(e);
	}
	return total;
}

export function formatTimelineClipboard(
	runs: RunRecord[],
	opts: { summary: string; sport: string; todayIso: string }
): string {
	const ordered = [...runs].filter((r) => Boolean(r.date)).sort(newestFirst);
	const noun = activityPlural(opts.sport);
	const countLabel = activityCount(ordered.length, opts.sport);
	const totalKm = round1(sumDistance(ordered));
	const last = ordered[0]?.date ?? '';
	const first = ordered[ordered.length - 1]?.date ?? '';
	const longest = ordered.reduce<RunRecord | null>(
		(best, r) => ((r.distance_km ?? 0) > (best?.distance_km ?? 0) ? r : best),
		null
	);
	const buckets = weekBuckets(ordered);
	const weeksNewest = [...buckets.entries()].sort((a, b) => (a[0] > b[0] ? -1 : 1));
	const spanned = first && last ? weeksSpanned(first, last) : 0;
	const avgWeekly = spanned && totalKm > 0 ? round1(totalKm / spanned) : null;
	const endMonday = last ? mondayIso(last) : '';
	const last4 = endMonday ? round1(calendarKm(buckets, endMonday, 4)) : 0;
	const prior4 = endMonday ? round1(calendarKm(buckets, addWeeks(endMonday, -4), 4)) : 0;
	const moving = movingTimeLabel(ordered);
	const pace = avgPaceLabel(ordered);
	const hr = avgHrLabel(ordered);

	const snapshot: string[] = [];
	if (!ordered.length) {
		snapshot.push(`- No ${noun} in this view`);
	} else {
		const span = first === last ? first : `${first} → ${last}`;
		snapshot.push(`- ${countLabel} from ${span}`);
		const volume: string[] = [];
		if (totalKm > 0) volume.push(`${totalKm} km total`);
		if (moving) volume.push(`${moving} moving`);
		if (volume.length) snapshot.push(`- ${volume.join(' · ')}`);
		if (longest && (longest.distance_km ?? 0) > 0) {
			snapshot.push(
				`- Longest: ${longest.distance_km} km on ${longest.date} (${activityLabel(longest.activity_type).toLowerCase()})`
			);
		}
		if (avgWeekly != null) snapshot.push(`- Average ${avgWeekly} km / week over ${spanned} calendar weeks`);
		if (endMonday && (last4 > 0 || prior4 > 0)) {
			const load =
				prior4 > 0
					? `- Last 4 Monday-weeks in this view (ending ${endMonday}): ${last4} km · previous 4: ${prior4} km`
					: `- Last 4 Monday-weeks in this view (ending ${endMonday}): ${last4} km`;
			snapshot.push(load);
		}
		const extras = [pace ? `avg pace ${pace}` : null, hr ? `avg HR ${hr}` : null].filter(Boolean);
		if (extras.length) snapshot.push(`- ${extras.join(' · ')}`);
		snapshot.push(`- By type: ${sportBreakdown(ordered)}`);
	}

	const weekLines =
		weeksNewest.map(([wk, e]) => `- Week of ${wk}: ${formatWeekBits(e)}`).join('\n') ||
		'- (no weeks in this view)';

	const rows =
		ordered
			.map((r) => {
				return `| ${r.date} | ${activityLabel(r.activity_type)} | ${kmCell(r)} | ${metricText(r)} | ${r.time || '–'} | ${r.avg_hr ?? '–'}/${r.max_hr ?? '–'} | ${feelCell(r)} | ${sessionCell(r)} | ${notesForRow(r)} |`;
			})
			.join('\n') || '| – | – | – | – | – | – | – | – | – |';

	return `# The Long Run — activity log

Today: ${opts.todayIso}.
On screen: ${opts.summary} · ${countLabel}.
These are logged activities, not a week-by-week plan. Snapshot and weekly volume are this filtered view (not all-time, not necessarily ending today). Use them for high-level questions: race readiness, training load, what to change, when to plan a race. Do not invent sessions I did not log.

Feel = effort/shins/legs/energy. Effort and energy 1–10 (effort higher = harder, energy higher = better). Shins and legs 0–10 (higher = worse). – = not recorded. I'll ask a question after this log.

## Snapshot
${snapshot.join('\n')}

## Weekly volume (Monday weeks, newest first)
${weekLines}

## Activities (newest first)
| Date | Type | km | pace/speed | time | HR avg/max | Feel | Session | Notes |
|------|------|----|-----------|------|-----------|------|---------|-------|
${rows}
`;
}
