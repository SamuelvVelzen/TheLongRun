import { activityLabel } from '$lib/activity';
import type { FuelLog, FuelRunRef } from '$lib/fuel';
import { FUEL_TEXT_TOKEN } from '$lib/fuel-prompt';
import { fuelItemNames } from '$lib/fuel';
import { section, tidyPrompt } from '$lib/prompt';
import type { RunRecord } from '$lib/types';
import { byDateNewestFirst } from './run-sort';

export function fuelRunRefs(runs: RunRecord[], log: FuelLog): Record<string, FuelRunRef> {
	const linked = new Set(log.entries.map((e) => e.slug).filter(Boolean));
	const out: Record<string, FuelRunRef> = {};
	for (const r of runs) {
		if (!linked.has(r.slug)) continue;
		out[r.slug] = { date: r.date, distance_km: r.distance_km, activity_type: r.activity_type };
	}
	return out;
}

export function runDatesBySlug(runs: RunRecord[]): Record<string, string> {
	return Object.fromEntries(runs.map((r) => [r.slug, r.date]));
}

export function buildFuelPromptTemplate(log: FuelLog, runs: RunRecord[]): string {
	const recent = [...runs].sort(byDateNewestFirst).slice(0, 10);
	const recentLines = recent
		.map(
			(r) =>
				`- \`${r.slug}\` · ${r.date} · ${activityLabel(r.activity_type)}${
					r.distance_km != null ? ` · ${r.distance_km} km` : ''
				}`
		)
		.join('\n');
	const names = fuelItemNames(log);
	const example = JSON.stringify({
		fuel: [
			{
				phase: 'before',
				item: 'Coffee',
				timing: '20 min before',
				outcome: 'good',
				notes: '',
				slug: recent[0]?.slug ?? ''
			}
		]
	});
	return tidyPrompt(`# The Long Run — log what I ate

Turn what I wrote below into fuel tries for my log: what I ate or drank before, during, or after a run, and how it went.

## What I wrote
${FUEL_TEXT_TOKEN}

${section('Items already in my log', names.length ? `Reuse one of these exact names when it is the same food or drink: ${names.join(', ')}` : '')}

${section('Recent activities', recentLines ? `Link a try to one of these only when I clearly mean it (e.g. "my 18 km on Sunday").\n${recentLines}` : '')}

## Reply
Return ONLY one JSON block in exactly this shape — no prose before or after:

\`\`\`json
${example}
\`\`\`

Rules:
- One entry per item + phase + timing. If I tried the same thing at two timings, that is two entries.
- \`phase\` is \`before\`, \`during\` or \`after\` the run.
- \`timing\` in my own words ("20 min before", "every 5 km", "at the water stations", "night before"). If I did not say, use "not noted".
- \`outcome\`: \`good\` (fine / no issues), \`mixed\`, or \`bad\` (cramps, stitch, nausea, energy crash). Only from what I said — if I said nothing went wrong, use \`good\`.
- \`notes\`: short, my words — symptoms, amounts, conditions. Empty if nothing to add.
- \`slug\`: only from Recent activities, otherwise \`""\`. Do not copy the example slug unless it fits.
- Never invent food I did not mention.`);
}
