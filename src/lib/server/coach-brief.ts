import {
	activityCount,
	activityLabel,
	metricText,
	normalizeActivityType,
	showsField
} from '$lib/activity';
import { BODY_SAFETY_RULE } from '$lib/body-notes';
import { bodyScoreTracks } from '$lib/body-scores';
import type { DateRange, RangeKind } from '$lib/date-range';
import {
	formatGearKm,
	GEAR_KINDS,
	gearKey,
	gearMeta,
	wearByAllGear,
	type GearCatalog,
	type GearContext,
	type GearKind
} from '$lib/gear';
import { personalBestsLine, sportVolume } from '$lib/history-brief';
import {
	buildWeekView,
	formatWeekPlanMarkdown,
	planWeekDateRange,
	type PlanCalendar
} from '$lib/plan';
import { feelCell, hrCell } from '$lib/prompt';
import type { ActivityGroupInfo, PlanWeek, RunRecord } from '$lib/types';
import { parseStrengthNotes, strengthCompact } from '$lib/strength';
import { byDateNewestFirst, isImportNote } from './run-sort';

export function historyWindowPhrase(range: DateRange): string {
	return range.label.toLowerCase();
}

export function formatWeekNumberRange(weeks: number[]): string {
	if (!weeks.length) return '';
	const ranges: [number, number][] = [];
	let lo = weeks[0]!;
	let hi = weeks[0]!;
	for (let i = 1; i < weeks.length; i++) {
		const n = weeks[i]!;
		if (n === hi + 1) hi = n;
		else {
			ranges.push([lo, hi]);
			lo = hi = n;
		}
	}
	ranges.push([lo, hi]);
	return ranges.map(([a, b]) => (a === b ? `Week ${a}` : `Weeks ${a}–${b}`)).join(', ');
}

export function weekHasSessions(w: PlanWeek | undefined): boolean {
	return (w?.sessions?.length ?? 0) > 0;
}

/**
 * Compact plan for the coach brief: up to two previous weeks as one line per session (with
 * done / skipped states). The week to plan lives only in the reply JSON, never twice.
 */
export function formatTrainingPlanBrief(
	plan: PlanWeek[],
	targetWeek: number,
	cal: PlanCalendar,
	runs: RunRecord[],
	today: Date,
	groups: ActivityGroupInfo[] = []
): string {
	const byWeek = new Map(plan.map((w) => [w.week, w]));
	const previous = plan
		.filter((x) => x.week < targetWeek && weekHasSessions(x))
		.sort((a, b) => b.week - a.week)
		.slice(0, 2)
		.sort((a, b) => a.week - b.week);

	const emptyFuture: number[] = [];
	const filledFuture: number[] = [];
	for (let n = targetWeek + 1; n <= cal.weekCount; n++) {
		if (weekHasSessions(byWeek.get(n))) filledFuture.push(n);
		else emptyFuture.push(n);
	}

	const parts = previous.map((w) =>
		formatWeekPlanMarkdown(
			buildWeekView({ ...w, dates: planWeekDateRange(w.week, cal) }, runs, cal, today, groups)
		).replace(/^## /, '### ')
	);
	parts.push(`Week ${targetWeek} is the week to plan — its JSON is under When you reply.`);
	if (emptyFuture.length) parts.push(`${formatWeekNumberRange(emptyFuture)}: not planned yet.`);
	if (filledFuture.length) {
		parts.push(
			`${formatWeekNumberRange(filledFuture)} already have sessions in the plan file — omitted here; do not copy them into this week's JSON.`
		);
	}
	return parts.join('\n');
}

export function notesForBriefRow(r: RunRecord): string {
	if (normalizeActivityType(r.activity_type) === 'strength') {
		const p = parseStrengthNotes(r.notes);
		const extra = isImportNote(p.extra) ? '' : p.extra.replace(/\s+/g, ' ').trim().slice(0, 60);
		return [strengthCompact(p.exercises), extra].filter(Boolean).join(' — ').replace(/\|/g, '/');
	}
	const notesText = isImportNote(r.notes || '') ? '' : r.notes || '';
	return notesText.replace(/\s+/g, ' ').replace(/\|/g, '/').trim().slice(0, 140);
}

/** Activity table row; strength shows duration in the metric column and lifts in Notes. */
export function briefTableRow(r: RunRecord): string {
	const isStrength = normalizeActivityType(r.activity_type) === 'strength';
	const metric = isStrength ? r.time?.trim() || '–' : metricText(r);
	const km = isStrength ? '–' : (r.distance_km ?? '–');
	return `| ${r.id} | ${r.date} | ${activityLabel(r.activity_type)} | ${km} | ${metric} | ${hrCell(r)} | ${feelCell(r)} | ${notesForBriefRow(r)} |`;
}

export const BRIEF_TABLE_HEAD = `| Id | Date | Type | km | pace/speed/time | HR avg/max | Feel | Notes |
|------|------|------|----|-----------|-----------|------|-------|`;

export function catalogLinesForBrief(catalog: GearCatalog, kind: GearKind, runs: RunRecord[]): string[] {
	const wear = wearByAllGear(runs)[kind];
	const meta = gearMeta(kind);
	const line = (name: string) => {
		const w = wear[gearKey(name)];
		if (!w || w.count <= 0) return name;
		return `${name} — ${formatGearKm(w.km)} (${activityCount(w.count, meta.wearSport)})`;
	};
	const rotationRest = catalog.rotation.filter((n) => gearKey(n) !== gearKey(catalog.active));
	return [
		catalog.active ? `- ${meta.activeLabel}: ${line(catalog.active)}` : '',
		rotationRest.length ? `- Rotation: ${rotationRest.map(line).join('; ')}` : ''
	].filter(Boolean);
}

export function gearSectionForBrief(gear: GearContext, runs: RunRecord[]): string {
	const blocks: string[] = [];
	for (const kind of GEAR_KINDS) {
		const catalog = gear[kind];
		const lines = catalogLinesForBrief(catalog, kind, runs);
		const notes = catalog.notes.trim();
		if (!lines.length && !notes) continue;
		const meta = gearMeta(kind);
		blocks.push(
			`### ${meta.section} — ${meta.label}\n${[...lines, notes].filter(Boolean).join('\n')}`
		);
	}
	if (!blocks.length) return '';
	return `## Gear
Mileage is counted from logged activities. Imports do not include gear.

${blocks.join('\n\n')}`;
}

/** Detailed activity rows default to the last 30 days; older history is summarised in tiers. */
export const DEFAULT_BRIEF_RANGE: RangeKind = '30d';

export const HOW_TO_READ = `Goal and Timing come from the booked race and calendar I set. Look-aheads are not races — they constrain the horizon, they do not set race day. Every section with numbers (summary, paces, weekly/monthly volume, activity log, lift tops) is auto-computed from my logs and is **current**. Body notes and Notes from me are hand-written by me. ${BODY_SAFETY_RULE}`;

export function allTimeSummarySection(allRuns: RunRecord[]): string {
	if (!allRuns.length) return '';
	const runsAll = allRuns.filter((r) => normalizeActivityType(r.activity_type) === 'run');
	const firstDate = allRuns.reduce((min, r) => (r.date < min ? r.date : min), allRuns[0]!.date);
	const totalRunKm = Math.round(runsAll.reduce((a, r) => a + (r.distance_km ?? 0), 0));
	const longest = runsAll.reduce<RunRecord | null>(
		(best, r) => ((r.distance_km ?? 0) > (best?.distance_km ?? 0) ? r : best),
		null
	);
	const avg = (arr: number[]) =>
		arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null;
	const bodyLines = bodyScoreTracks(runsAll).map((t) => {
		const scores = t.points.map((p) => p.score).reverse();
		const recent = avg(scores.slice(0, 4));
		const prior = avg(scores.slice(4, 8));
		return `- ${t.area} trend (0–10, lower = better): last 4 runs avg ${recent}${prior != null ? ` vs prior 4 ${prior}` : ''}.`;
	});
	const lines = [
		`- Logged since ${firstDate}: ${sportVolume(allRuns)}.`,
		longest?.distance_km
			? `- Longest run: ${longest.distance_km} km (${longest.avg_pace || '—'}/km) on ${longest.date}.`
			: '',
		runsAll.length ? `- Running total: ${totalRunKm} km.` : '',
		personalBestsLine(allRuns),
		...bodyLines
	].filter(Boolean);
	return `## All-time summary\n${lines.join('\n')}`;
}

/** Median clock start of recent outdoor sessions, e.g. "07:10", or null when unknown. */
export function typicalStartTime(runs: RunRecord[]): string | null {
	const mins = [...runs]
		.filter((r) => normalizeActivityType(r.activity_type) !== 'strength')
		.sort(byDateNewestFirst)
		.slice(0, 20)
		.map((r) => /^(\d{1,2}):(\d{2})/.exec(r.start_time ?? ''))
		.filter((m): m is RegExpExecArray => m != null)
		.map((m) => Number(m[1]) * 60 + Number(m[2]))
		.sort((a, b) => a - b);
	if (mins.length < 3) return null;
	const mid = mins[Math.floor(mins.length / 2)]!;
	const rounded = Math.round(mid / 10) * 10;
	return `${String(Math.floor(rounded / 60) % 24).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}`;
}

export function forecastSectionForBrief(
	forecast: { date: string; line: string }[],
	weekPhrase: string,
	hasWardrobe: boolean,
	startTime: string | null
): string {
	if (!forecast.length) return '';
	const kitRule = hasWardrobe ? ' Use it with My clothing to suggest kit per session.' : '';
	const when = startTime
		? ` My sessions usually start around ${startTime} — weigh the temperature for that time of day.`
		: '';
	return `## Forecast (${weekPhrase}, home location, auto-fetched)
Daily range.${when}${kitRule} Days past the forecast horizon are missing; do not guess them.
${forecast.map((f) => `- ${f.line}`).join('\n')}`;
}
