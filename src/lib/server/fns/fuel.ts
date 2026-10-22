import { normalizeFuelEntry, normalizeFuelLog, renameFuelItemIn, type FuelEntry, type FuelLog, type FuelPhase } from '$lib/fuel';
import { parseFuelReply } from '$lib/fuel-schema';
import type { ActivityAttachOption, ActivityGroupInfo, Goal, PlanAttachOption, PlannedRoute, PlannedRouteActivityLink, PlannedRoutePlanLink, PlanWeek, RouteTrack, RunRecord, RunWithMap, SessionRouteRef } from '$lib/types';
import type { ActivityFeelInput, DebriefRaceHint } from '$lib/debrief-types';
import type { GoalBriefDraft } from '$lib/goal-brief';
import type { PlanPeekData } from '$lib/plan-peek';
import type { CreateRunInput, UpdateRunInput } from '$lib/run-input';
import { createServerFn } from '@tanstack/react-start';
import { requireAuth } from '../auth';
import { loadFuelLog, persistFuelLog } from '../context';
import { listRuns } from '../runs';
import { buildFuelPromptTemplate, fuelRunRefs, runDatesBySlug } from '../fuel-prompt';
import { parseJsonPayload } from '../plan-mutations';

// ---------- reads ----------

/** Root-loader data shared by every page: sign-in state + the open body notes to score. */

export const getFuelData = createServerFn({ method: 'GET' }).handler(async () => {
	const [log, runs] = await Promise.all([loadFuelLog(), listRuns()]);
	return {
		log,
		runsBySlug: fuelRunRefs(runs, log),
		promptTemplate: buildFuelPromptTemplate(log, runs)
	};
});

export const saveFuelLog = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: FuelLog) => normalizeFuelLog(d))
	.handler(async ({ data }) => {
		return persistFuelLog(data);
	});

export const addFuelEntries = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: FuelEntry[]) =>
		(Array.isArray(d) ? d : []).map(normalizeFuelEntry).filter((e): e is FuelEntry => e != null)
	)
	.handler(async ({ data }) => {
		const log = await loadFuelLog();
		const saved = await persistFuelLog({ ...log, entries: [...log.entries, ...data] });
		return { log: saved, added: data.length };
	});

export const renameFuelItem = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: { phase: FuelPhase; from: string; to: string }) => d)
	.handler(async ({ data }) => {
		const log = await loadFuelLog();
		return persistFuelLog(renameFuelItemIn(log, data.phase, data.from, data.to));
	});

/** Describe-what-you-ate reply: validated with zod and saved straight away. */

export const saveFuelReply = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((jsonText: string) => jsonText)
	.handler(async ({ data: jsonText }) => {
		const [log, runs] = await Promise.all([loadFuelLog(), listRuns()]);
		const entries = parseFuelReply(parseJsonPayload(jsonText), runDatesBySlug(runs));
		const saved = await persistFuelLog({ ...log, entries: [...log.entries, ...entries] });
		return { log: saved, addedIds: entries.map((e) => e.id) };
	});
