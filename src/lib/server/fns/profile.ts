import { activityLabel } from '$lib/activity';
import { parseFeelingsReply } from '$lib/feelings-schema';
import { normalizeBodyNotes, type BodyNote, type BodyNotes } from '$lib/body-notes';
import { openBodyAreas } from '$lib/body-scores';
import { feelScale, tidyPrompt } from '$lib/prompt';
import type { ActivityAttachOption, ActivityGroupInfo, Goal, PlanAttachOption, PlannedRoute, PlannedRouteActivityLink, PlannedRoutePlanLink, PlanWeek, RouteTrack, RunRecord, RunWithMap, SessionRouteRef } from '$lib/types';
import { loadProfile, persistBodyNotes, persistCoachNotes } from '../profile';
import type { ActivityFeelInput, DebriefRaceHint } from '$lib/debrief-types';
import type { GoalBriefDraft } from '$lib/goal-brief';
import type { PlanPeekData } from '$lib/plan-peek';
import type { CreateRunInput, UpdateRunInput } from '$lib/run-input';
import { createServerFn } from '@tanstack/react-start';
import { requireAuth } from '../auth';
import { listRuns } from '../runs';
import { applyFeelingsRows, parseJsonPayload } from '../plan-mutations';
import { bodyScoresExample, hasFeel } from '../debrief-prompt';

// ---------- reads ----------

/** Root-loader data shared by every page: sign-in state + the open body notes to score. */

export const getProfileData = createServerFn({ method: 'GET' }).handler(async () => {
	return loadProfile();
});

export const saveBodyNotes = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: BodyNotes) => normalizeBodyNotes(d))
	.handler(async ({ data }) => persistBodyNotes(data));

export const saveCoachNotes = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: { text: string }) => ({ text: typeof d?.text === 'string' ? d.text : '' }))
	.handler(async ({ data }) => ({ coachNotes: await persistCoachNotes(data.text) }));

/** Upsert picked debrief suggestions into the body notes (same area → same note). */

export const applyBodySuggestions = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: BodyNote[]) => (Array.isArray(d) ? d : []))
	.handler(async ({ data }) => {
		const { body } = await loadProfile();
		const picked = normalizeBodyNotes({ notes: data }).notes;
		const byId = new Map(picked.map((n) => [n.id, n]));
		const kept = body.notes.map((n) => byId.get(n.id) ?? n);
		const added = picked.filter((n) => !body.notes.some((o) => o.id === n.id));
		return persistBodyNotes({ notes: [...kept, ...added] });
	});

// ---------- weekly feelings round-trip ----------

/**
 * Build a ready-to-paste prompt asking the AI to summarise, per activity, how each one felt —
 * using the week's conversation. `scope: 'window'` covers the last `weeks`; `scope: 'missing'`
 * covers every activity that still lacks feel data. The AI returns JSON keyed by slug, saved back
 * via saveFeelings.
 */

export const getFeelingsPrompt = createServerFn({ method: 'GET' })
	.validator((d: { scope: 'window' | 'missing'; weeks: number }) => ({
		scope: d.scope === 'missing' ? 'missing' : 'window',
		weeks: Number.isFinite(d.weeks) && d.weeks > 0 ? Math.floor(d.weeks) : 1
	}))
	.handler(async ({ data }) => {
		const [runs, profile] = await Promise.all([listRuns(), loadProfile()]);
		const scoreAreas = openBodyAreas(profile.body);
		const bodyExample = bodyScoresExample(scoreAreas);
		const all = runs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
		let targets: RunRecord[];
		let rangeLabel: string;
		if (data.scope === 'missing') {
			targets = all.filter((r) => !hasFeel(r));
			rangeLabel = 'all activities still missing how they felt';
		} else {
			const cutoff = new Date();
			cutoff.setDate(cutoff.getDate() - data.weeks * 7);
			const cutoffIso = cutoff.toISOString().slice(0, 10);
			targets = all.filter((r) => r.date >= cutoffIso);
			rangeLabel = `the last ${data.weeks} week${data.weeks === 1 ? '' : 's'}`;
		}

		const from = targets[0]?.date ?? '—';
		const to = targets[targets.length - 1]?.date ?? '—';

		const table = targets.length
			? targets
					.map((r) => {
						const feel = hasFeel(r) ? 'has notes — refine only if I said more' : 'none yet';
						return `| ${r.id} | ${r.date} | ${activityLabel(r.activity_type)} | ${
							r.distance_km != null ? `${r.distance_km} km` : '—'
						} | ${feel} |`;
					})
					.join('\n')
			: '| — | — | — | — | — |';

		const exampleId = targets[0]?.id ?? 0;
		const example = JSON.stringify({
			activities: [
				{
					id: exampleId,
					effort: 6,
					...(bodyExample ? { body_scores: bodyExample } : {}),
					legs: 7,
					energy: 7,
					wanted_faster: true,
					surface: 'wet asphalt',
					notes: 'Tight for the first 2 km, then opened up after the turnaround.'
				}
			]
		});
		const prompt = tidyPrompt(`# The Long Run — capture how each activity felt

From our conversation, summarise how I felt for each activity below (${rangeLabel}): terrain, ${scoreAreas.length ? `${scoreAreas.map((a) => a.area.toLowerCase()).join(', ')}, ` : ''}energy, legs, and whether I wanted to go more or faster.

Return ONLY a JSON block in exactly this shape — no prose before or after:

\`\`\`json
${example}
\`\`\`

Rules:
- Copy \`id\` from the table — do not use the example id if it is not in the table. Do not copy example numbers.
- ${feelScale()}${scoreAreas.length ? ` \`body_scores\` holds one 0–10 score per body area (runs/walks), keyed by the exact area name: ${scoreAreas.map((a) => a.area).join(', ')}.` : ''} \`wanted_faster\` is true/false.
- Omit any field you have no information for; omit an activity entirely if I said nothing about it.
- Keep \`notes\` short and in my voice (first person).

## Activities (${from} → ${to})
| id | date | type | distance | current feel |
|------|------|------|----------|--------------|
${table}`);
		return { prompt, count: targets.length, from, to };
	});

/** Save AI-summarised feelings back onto activities by id (subjective fields only). */

export const saveFeelings = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((jsonText: string) => jsonText)
	.handler(async ({ data: jsonText }) => {
		const rows = parseFeelingsReply(parseJsonPayload(jsonText));
		return applyFeelingsRows(rows);
	});
