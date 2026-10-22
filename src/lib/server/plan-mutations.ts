import { mergeBodyScores, resolveAiBodyScores } from '$lib/body-scores';
import { feelingsRowToPatch, type ParsedFeelingsActivity } from '$lib/feelings-schema';
import { looksLikePlanWeek } from '$lib/plan-schema';
import { planWeekDateRange, planWeekStartIso } from '$lib/plan';
import type { PlanWeek } from '$lib/types';
import { loadTrainingContext, loadPlan, savePlan, rememberGearName } from './context';
import { loadBodyNotes } from './profile';
import { getRun, getRunById, updateRunFeelings, type FeelingsPatch } from './runs';

export function parseJsonPayload(text: string): unknown {
	const trimmed = text.trim();
	if (!trimmed) throw new Error('Nothing to save — paste the JSON your AI returned.');
	const tryParse = (s: string) => {
		try {
			return { ok: true as const, value: JSON.parse(s) as unknown };
		} catch {
			return { ok: false as const };
		}
	};
	const direct = tryParse(trimmed);
	if (direct.ok) return direct.value;
	const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (fence) {
		const parsed = tryParse(fence[1]!.trim());
		if (parsed.ok) return parsed.value;
	}
	const start = trimmed.search(/[[{]/);
	if (start >= 0) {
		const parsed = tryParse(trimmed.slice(start));
		if (parsed.ok) return parsed.value;
	}
	throw new Error('That is not valid JSON — paste the JSON block your AI returned.');
}

/** Objects in the paste that look like plan weeks (`week` + `sessions`). */
export function planWeekCandidates(parsed: unknown): unknown[] {
	return (Array.isArray(parsed) ? parsed : [parsed]).filter(looksLikePlanWeek);
}

export async function mergePlanWeeks(
	incoming: PlanWeek[]
): Promise<{ weeks: number; updated: number[] }> {
	if (!incoming.length) throw new Error('No plan week found in that JSON.');
	const { calendar } = await loadTrainingContext();
	for (const w of incoming) {
		if (w.week > calendar.weekCount) {
			throw new Error(
				calendar.rolling
					? 'With no race on the calendar, paste a single week (week 1).'
					: `Week ${w.week} is outside this ${calendar.weekCount}-week block.`
			);
		}
	}
	const current = await loadPlan();
	const byWeek = new Map<number, PlanWeek>(current.map((w) => [w.week, w]));
	for (const w of incoming) {
		byWeek.set(w.week, {
			...w,
			start: planWeekStartIso(w.week, calendar),
			dates: w.dates?.trim() ? w.dates : planWeekDateRange(w.week, calendar)
		});
	}
	const merged = [...byWeek.values()]
		.filter((w) => w.week >= 1 && w.week <= calendar.weekCount)
		.sort((a, b) => a.week - b.week);
	await savePlan(merged);
	return { weeks: merged.length, updated: incoming.map((w) => w.week) };
}

export async function applyFeelingsRows(
	rows: ParsedFeelingsActivity[]
): Promise<{ updated: number; updatedSlugs: string[]; missing: string[] }> {
	const updated: string[] = [];
	const missing: string[] = [];
	const body = rows.some((r) => r.body_scores?.length || r.shins != null)
		? await loadBodyNotes()
		: null;
	for (const row of rows) {
		let runId = row.id ?? null;
		if (!runId && row.slug) {
			const bySlug = await getRun(row.slug);
			runId = bySlug?.id ?? null;
		}
		const key = runId != null ? String(runId) : (row.slug ?? '?');
		if (!runId) {
			missing.push(key);
			continue;
		}
		const patch = feelingsRowToPatch(row) as FeelingsPatch;
		const scores = body ? resolveAiBodyScores(row.body_scores, row.shins, body) : undefined;
		if (scores) {
			const current = await getRunById(runId);
			if (current) patch.body_scores = mergeBodyScores(current.body_scores, scores);
		}
		const ok = await updateRunFeelings(runId, patch);
		if (ok && row.gear !== undefined) {
			const run = await getRunById(runId);
			if (run) await rememberGearName(run.gear, run.activity_type);
		}
		if (ok) {
			const run = await getRunById(runId);
			if (run) updated.push(run.slug);
			else missing.push(key);
		} else missing.push(key);
	}
	return { updated: updated.length, updatedSlugs: updated, missing };
}
