import {
	activityLabel,
	metricText,
	normalizeActivityType,
	showsFeel,
	showsField
} from '$lib/activity';
import { distanceLabel, formatEffortTime, supportsBestEfforts } from '$lib/best-efforts';
import { bodyScoreRows } from '$lib/body-scores';
import { debriefUnitLead, debriefUnitSlug, type DebriefSessionUnit } from '$lib/debrief-group';
import type { DebriefRaceHint } from '$lib/debrief-types';
import { activityLooksLikeRace, canPinRaceResult } from '$lib/goals';
import { combineRunStats, groupedSessionTitle, groupMembership, sortGroupMembers } from '$lib/group';
import {
	buildWeekView,
	weekNumberForDate,
	type PlanCalendar,
	type WeekSessionView
} from '$lib/plan';
import { feelCell } from '$lib/prompt';
import { workoutMarkdown, workoutSummary } from '$lib/run-workout';
import type { RouteAnalytics } from '$lib/splits';
import { parseStrengthNotes } from '$lib/strength';
import type { BodyArea } from '$lib/body-scores';
import type { ActivityGroupInfo, PlanWeek, RunRecord } from '$lib/types';
import { notesForBriefRow } from './coach-brief';
import { isImportNote } from './run-sort';

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

/**
 * No scores and no real write-up yet — still waiting on After an activity.
 * Only fields the user can actually set for that sport count as evidence of a
 * debrief: surface is run/walk-only (it used to be auto-filled on strength logs,
 * hiding them from the list), body scores are run/walk, wanted-faster is run.
 */
export function stillNeedsDebrief(r: RunRecord): boolean {
	const t = normalizeActivityType(r.activity_type);
	if (r.effort != null || r.legs != null || r.energy != null) return false;
	if (showsFeel(t, 'body') && r.body_scores.length > 0) return false;
	if (showsFeel(t, 'wanted_faster') && r.wanted_faster != null) return false;
	if (showsField(t, 'surface') && (r.surface ?? '').trim() !== '') return false;
	if (t === 'strength') {
		const extra = parseStrengthNotes(r.notes).extra.trim();
		return !extra || isImportNote(extra);
	}
	const notes = (r.notes ?? '').trim();
	return !notes || isImportNote(notes);
}

export function formatRunBriefLine(r: RunRecord): string {
	const feel = feelCell(r);
	const notes = notesForBriefRow(r);
	const km =
		normalizeActivityType(r.activity_type) === 'strength' ? '' : ` ${r.distance_km ?? '–'} km`;
	return `- ${r.date} (${r.day || '—'}) ${activityLabel(r.activity_type)}${km} · ${metricText(r)} · HR ${r.avg_hr ?? '–'}/${r.max_hr ?? '–'} · feel ${feel}${notes ? ` · ${notes}` : ''} · id ${r.id}`;
}

export const DEBRIEF_CHUNK_KM = 5;

export function formatSplitBit(s: RouteAnalytics['splits'][number]): string {
	const km = s.isPartial ? s.distanceKm.toFixed(2) : String(s.km);
	const pace = s.pace || '—';
	const hr = s.avgHr != null ? ` HR${s.avgHr}` : '';
	return `${km} ${pace}${hr}`;
}

export function splitKmLabel(s: RouteAnalytics['splits'][number]): string {
	return s.isPartial ? s.distanceKm.toFixed(2) : String(s.km);
}

/** One line per 5 km — compact but scannable in the debrief prompt. */
export function formatKmSplitsLines(splits: RouteAnalytics['splits']): string[] {
	if (!splits.length) return [];
	const lines: string[] = [];
	for (let i = 0; i < splits.length; i += DEBRIEF_CHUNK_KM) {
		const chunk = splits.slice(i, i + DEBRIEF_CHUNK_KM);
		const first = chunk[0]!;
		const last = chunk[chunk.length - 1]!;
		const start = splitKmLabel(first);
		const end = splitKmLabel(last);
		const range = start === end ? start : `${start}–${end}`;
		lines.push(`Pace km ${range}: ${chunk.map(formatSplitBit).join(' · ')}`);
	}
	return lines;
}

export function formatHrZonesLine(analytics: RouteAnalytics | null): string {
	const zones = analytics?.hrZones;
	if (!zones) return '';
	const source =
		zones.source === 'profile'
			? 'saved'
			: zones.source === 'alltime'
				? 'all-time max'
				: "this activity's max";
	const head = `HR zones (HRmax ${zones.hrMax}, ${source})`;
	const bits = (zones.distribution ?? [])
		.filter((z) => z.pct > 0)
		.map((z) => `Z${z.zone} ${z.pct}%`);
	if (bits.length) return `${head}: ${bits.join(' · ')}`;
	if (zones.avgZone != null && zones.avgHr != null) {
		return `${head}: avg ${zones.avgHr} → Z${zones.avgZone}`;
	}
	return '';
}

export function formatBestEffortsLine(r: RunRecord): string {
	if (!supportsBestEfforts(r.activity_type) || !r.best_efforts?.length) return '';
	const bits = [...r.best_efforts]
		.sort((a, b) => a.meters - b.meters)
		.map((e) => `${distanceLabel(e.key)} ${formatEffortTime(e.seconds)}`);
	return bits.length ? `Best efforts: ${bits.join(' · ')}` : '';
}

export function formatDebriefGpsFacts(r: RunRecord): string {
	const t = normalizeActivityType(r.activity_type);
	const parts: string[] = [];
	if (t !== 'strength' && r.distance_km != null) parts.push(`${r.distance_km} km`);
	if (r.time) parts.push(`moving ${r.time}`);
	if (r.elapsed_time && r.elapsed_time !== r.time) parts.push(`elapsed ${r.elapsed_time}`);
	if (t === 'bike') {
		const speed = metricText(r);
		if (speed && !speed.startsWith('—')) parts.push(speed);
	} else if (showsField(r.activity_type, 'pace') && r.avg_pace) {
		parts.push(`${r.avg_pace}/km`);
	}
	if (showsField(r.activity_type, 'elevation') && r.elev_gain != null) {
		parts.push(`+${r.elev_gain} m`);
	}
	if (showsField(r.activity_type, 'hr') && (r.avg_hr != null || r.max_hr != null)) {
		parts.push(`HR ${r.avg_hr ?? '–'}/${r.max_hr ?? '–'}`);
	}
	if (showsField(r.activity_type, 'cadence') && r.cadence != null) {
		parts.push(`cadence ${r.cadence}`);
	}
	return parts.join(' · ');
}

export function formatDebriefCombinedGpsFacts(stats: ReturnType<typeof combineRunStats>): string {
	const t = normalizeActivityType(stats.activity_type);
	const parts: string[] = [];
	if (t !== 'strength' && stats.distance_km != null) parts.push(`${stats.distance_km} km total`);
	if (stats.time) parts.push(`moving ${stats.time}`);
	if (stats.elapsed_time && stats.elapsed_time !== stats.time) {
		parts.push(`elapsed ${stats.elapsed_time}`);
	}
	if (!stats.mixed && showsField(stats.activity_type, 'pace') && stats.avg_pace) {
		parts.push(`${stats.avg_pace}/km`);
	}
	if (!stats.mixed && showsField(stats.activity_type, 'elevation') && stats.elev_gain != null) {
		parts.push(`+${stats.elev_gain} m`);
	}
	if (
		!stats.mixed &&
		showsField(stats.activity_type, 'hr') &&
		(stats.avg_hr != null || stats.max_hr != null)
	) {
		parts.push(`HR ${stats.avg_hr ?? '–'}/${stats.max_hr ?? '–'}`);
	}
	if (stats.mixed) parts.push(`mixed: ${stats.types.map((x) => activityLabel(x)).join(' + ')}`);
	return parts.join(' · ');
}

export function formatDebriefFeatured(r: RunRecord, analytics: RouteAnalytics | null): string {
	const head = `- ${r.date} (${r.day || '—'}) ${activityLabel(r.activity_type)} · id ${r.id}`;
	const extra = [
		formatDebriefGpsFacts(r),
		...(analytics ? formatKmSplitsLines(analytics.splits) : []),
		formatHrZonesLine(analytics),
		formatBestEffortsLine(r)
	].filter(Boolean);
	if (!extra.length) return head;
	return [head, ...extra.map((line) => `  ${line}`)].join('\n');
}

export function formatDebriefGroupSession(
	unit: Extract<DebriefSessionUnit, { kind: 'group' }>,
	analyticsById: Map<number, RouteAnalytics | null>
): string {
	const { group, members, stats } = unit;
	const title = groupedSessionTitle(group, members.length, stats.date);
	const lead = debriefUnitLead(unit);
	const head = `- ${title} · grouped session (${members.length} parts) · lead id ${lead.id}`;
	const combined = formatDebriefCombinedGpsFacts(stats);
	const lines = [head];
	if (combined) lines.push(`  Combined: ${combined}`);
	for (const m of members) {
		const partHead = `  Part · id ${m.id} · ${m.start_time || '—'} ${activityLabel(m.activity_type)}`;
		const partFacts = formatDebriefGpsFacts(m);
		const analytics = analyticsById.get(m.id) ?? null;
		const partExtra = [
			partFacts,
			...(analytics ? formatKmSplitsLines(analytics.splits) : []),
			formatHrZonesLine(analytics),
			formatBestEffortsLine(m)
		].filter(Boolean);
		if (!partExtra.length) lines.push(partHead);
		else lines.push(partHead, ...partExtra.map((line) => `    ${line}`));
	}
	return lines.join('\n');
}

export function formatDebriefSessionUnit(
	unit: DebriefSessionUnit,
	analyticsById: Map<number, RouteAnalytics | null>
): string {
	if (unit.kind === 'group') return formatDebriefGroupSession(unit, analyticsById);
	const r = unit.members[0]!;
	return formatDebriefFeatured(r, analyticsById.get(r.id) ?? null);
}

export function formatFeelForUnit(unit: DebriefSessionUnit, areas: BodyArea[]): string {
	const slug = debriefUnitSlug(unit);
	const lead = debriefUnitLead(unit);
	if (unit.kind === 'group') {
		const inner = formatFeelLogged(lead, areas).replace(/^- `\S+`: /, '');
		return `- \`${slug}\` (grouped, ${unit.members.length} parts, save feelings on id ${lead.id}): ${inner}`;
	}
	return formatFeelLogged(lead, areas);
}

export function parseDebriefIds(raw: string): number[] {
	return [
		...new Set(
			raw
				.split(',')
				.map((s) => Number(s.trim()))
				.filter((n) => Number.isFinite(n) && n > 0)
		)
	];
}

/** Legacy debrief URLs used comma-separated slugs before numeric ids. */
export function parseDebriefSlugLabels(raw: string): string[] {
	return [
		...new Set(
			raw
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean)
		)
	];
}

export function compareDebriefRuns(a: RunRecord, b: RunRecord) {
	if (a.date !== b.date) return a.date < b.date ? -1 : 1;
	const ta = a.start_time || '';
	const tb = b.start_time || '';
	if (ta !== tb) return ta < tb ? -1 : 1;
	return (a.slug ?? '').localeCompare(b.slug ?? '');
}

/**
 * Same-day companions (AM+PM commutes) that still need a write-up, plus other
 * this-week logs that still need one — so an earlier import this week is not
 * dropped when a later slug is in the URL. Finished sessions drop out even if
 * their id is still in the URL.
 */
export function addDebriefPoolRow(
	byId: Map<number, RunRecord>,
	r: RunRecord,
	membership: Map<number, import('$lib/types').ActivityGroupInfo>,
	pool: RunRecord[]
) {
	byId.set(r.id, r);
	const group = membership.get(r.id);
	if (!group) return;
	for (const id of group.member_ids) {
		const mate = pool.find((x) => x.id === id);
		if (mate) byId.set(id, mate);
	}
}

export function expandDebriefFeatured(
	seed: RunRecord[],
	pool: RunRecord[],
	weekStart: string,
	weekEnd: string,
	groups: import('$lib/types').ActivityGroupInfo[]
): RunRecord[] {
	if (!seed.length) return [];
	const dates = new Set(seed.map((r) => r.date));
	const membership = groupMembership(groups);
	const byId = new Map<number, RunRecord>();
	for (const r of pool) {
		const sameDay = dates.has(r.date) && stillNeedsDebrief(r);
		const pendingThisWeek =
			Boolean(weekStart) && r.date >= weekStart && r.date <= weekEnd && stillNeedsDebrief(r);
		if (sameDay || pendingThisWeek) addDebriefPoolRow(byId, r, membership, pool);
	}
	// URL ids are a hint, not a lock — once feel is saved, drop them unless still pending.
	for (const r of seed) {
		if (stillNeedsDebrief(r)) addDebriefPoolRow(byId, r, membership, pool);
	}
	return [...byId.values()].sort(compareDebriefRuns);
}

export type { DebriefRaceHint } from '$lib/debrief-types';

export function debriefRaceHint(
	run: RunRecord,
	goals: import('$lib/types').Goal[]
): DebriefRaceHint | null {
	const open = goals.find(
		(g) => g.status !== 'done' && activityLooksLikeRace(g, run) && canPinRaceResult(g)
	);
	if (open) {
		return {
			kind: 'match',
			goalId: open.id,
			goalName: open.name,
			pinned: false,
			missingMedalDetails: false,
			bib_number: open.bib_number,
			result_url: open.result_url,
			medal_notes: open.medal_notes
		};
	}
	const done = goals.find((g) => g.status === 'done' && g.result?.activity_slug === run.slug);
	if (done) {
		const missing = !done.bib_number.trim() || !done.result_url.trim() || !done.medal_notes.trim();
		return {
			kind: 'match',
			goalId: done.id,
			goalName: done.name,
			pinned: true,
			missingMedalDetails: missing,
			bib_number: done.bib_number,
			result_url: done.result_url,
			medal_notes: done.medal_notes
		};
	}
	if (run.session === 'race') return { kind: 'race_no_goal' };
	return null;
}

export function debriefRunSummary(r: RunRecord) {
	return {
		id: r.id,
		slug: r.slug,
		date: r.date,
		day: r.day,
		distance_km: r.distance_km,
		start_time: r.start_time,
		avg_pace: r.avg_pace,
		hasFeel: hasFeel(r),
		activity_type: r.activity_type,
		session: r.session,
		cadence: r.cadence,
		gear: r.gear,
		effort: r.effort,
		body_scores: r.body_scores,
		legs: r.legs,
		energy: r.energy,
		wanted_faster: r.wanted_faster,
		surface: r.surface,
		notes: r.notes,
		before_notes: r.before_notes,
		after_notes: r.after_notes
	};
}

export type PlannedMatch =
	{ kind: 'planned'; session: WeekSessionView } | { kind: 'unplanned' } | { kind: 'missing' };

/** The plan session this activity filled, or why there is none. */
export function plannedSessionForActivity(
	run: RunRecord,
	plan: PlanWeek[],
	runs: RunRecord[],
	cal: PlanCalendar,
	groups: ActivityGroupInfo[] = []
): PlannedMatch {
	const weekNum = weekNumberForDate(run.date, cal);
	const planWeek = weekNum != null ? plan.find((w) => w.week === weekNum) : undefined;
	if (!planWeek?.sessions?.length) return { kind: 'missing' };
	const view = buildWeekView(planWeek, runs, cal, undefined, groups);
	const session = view.sessions.find((s) => s.logSlug === run.slug);
	if (session) return { kind: 'planned', session };

	const group = groupMembership(groups).get(run.id);
	if (group) {
		const byId = new Map(runs.map((r) => [r.id, r] as const));
		const members = group.member_ids
			.map((id) => byId.get(id))
			.filter((r): r is RunRecord => r != null);
		if (members.length >= 2) {
			const types = new Set(members.map((m) => normalizeActivityType(m.activity_type)));
			if (types.size === 1) {
				const lead = sortGroupMembers(members)[0]!;
				if (lead.id !== run.id) {
					const leadSession = view.sessions.find((s) => s.logSlug === lead.slug);
					if (leadSession) return { kind: 'planned', session: leadSession };
				}
			}
		}
	}

	if (view.unplanned.some((u) => u.slug === run.slug)) return { kind: 'unplanned' };
	return { kind: 'missing' };
}

export function formatPlannedForActivity(run: RunRecord, match: PlannedMatch): string {
	const head = `- ${run.date} ${activityLabel(run.activity_type)} (id ${run.id})`;
	if (match.kind === 'unplanned') {
		return `${head}: Unplanned — no session was planned for this day and sport. Coach it as extra load.`;
	}
	if (match.kind === 'missing') {
		return `${head}: Can't find a planned session for this activity — no plan covers this date.`;
	}
	const s = match.session;
	const km = s.distance_km != null ? ` · ${s.distance_km} km planned` : '';
	const lines = [`${head}: **${s.label}**${km}`];
	if (s.workout) {
		lines.push(`  Summary: ${workoutSummary(s.workout)}`);
		lines.push('  Steps:');
		lines.push(workoutMarkdown(s.workout, '    '));
	}
	if (s.exercises?.length) {
		lines.push(
			`  Lifts: ${s.exercises
				.map(
					(e) =>
						`${e.name} ${e.sets}×${e.sec != null ? `${e.sec}s` : e.reps}${e.kg != null ? ` @ ${e.kg}kg` : ''}`
				)
				.join('; ')}`
		);
	}
	if (s.detail.trim()) lines.push(`  Intent: ${s.detail.trim()}`);
	return lines.join('\n');
}

export function formatFeelLogged(r: RunRecord, areas: BodyArea[]): string {
	const body = showsFeel(r.activity_type, 'body')
		? bodyScoreRows(r.body_scores, areas).map((row) => `${row.area} ${row.score ?? '–'}`)
		: [];
	const scores = [
		`effort ${r.effort ?? '–'}`,
		...body,
		`legs ${r.legs ?? '–'}`,
		`energy ${r.energy ?? '–'}`
	];
	if (showsFeel(r.activity_type, 'wanted_faster')) {
		scores.push(
			`wanted faster ${r.wanted_faster === true ? 'yes' : r.wanted_faster === false ? 'no' : '–'}`
		);
	}
	const surface = (r.surface ?? '').trim();
	const manual: string[] = [];
	if (normalizeActivityType(r.activity_type) === 'run') {
		manual.push(`session ${r.session || '–'}`);
		manual.push(`cadence ${r.cadence ?? '–'}`);
	}
	if (showsField(r.activity_type, 'gear') && (r.gear ?? '').trim()) {
		manual.push(`gear ${r.gear}`);
	} else if (showsField(r.activity_type, 'gear')) {
		manual.push('gear –');
	}
	const manualBit = manual.length ? ` · ${manual.join(' · ')}` : '';
	return `- \`${r.slug}\`: ${scores.join(' · ')}${surface ? ` · surface ${surface}` : ''}${manualBit}`;
}

/** `{ "Shins": 2, "Left knee": 1 }` for the open body notes, or null when there are none. */
export function bodyScoresExample(areas: BodyArea[]): Record<string, number> | null {
	if (!areas.length) return null;
	return Object.fromEntries(areas.map((a, i) => [a.area, i === 0 ? 2 : 1]));
}

/** One `feelings` row per debrief session (grouped imports count as one). */
export function feelingsExample(units: DebriefSessionUnit[], areas: BodyArea[]): unknown {
	const body = bodyScoresExample(areas);
	const row = (r: RunRecord) => ({
		id: r.id,
		...(normalizeActivityType(r.activity_type) === 'run' ? { session: 'easy' } : {}),
		effort: 6,
		...(showsFeel(r.activity_type, 'body') && body ? { body_scores: body } : {}),
		legs: 4,
		energy: 7,
		...(showsFeel(r.activity_type, 'wanted_faster') ? { wanted_faster: false } : {}),
		...(showsField(r.activity_type, 'surface') ? { surface: 'asphalt' } : {}),
		...(showsField(r.activity_type, 'gear') ? { gear: 'shoe name' } : {}),
		notes: 'Short first-person summary of What I wrote.'
	});
	if (!units.length) return { id: 0, notes: '…' };
	const rows = units.map((u) => row(debriefUnitLead(u)));
	return rows.length === 1 ? rows[0]! : rows;
}
