import { normalizeActivityHabits, type ActivityHabits } from '$lib/activity-habits';
import { wearByAllGear, type GearContext } from '$lib/gear';
import { normalizeWardrobe, type Wardrobe } from '$lib/wardrobe';
import type { ActivityAttachOption, ActivityGroupInfo, Goal, PlanAttachOption, PlannedRoute, PlannedRouteActivityLink, PlannedRoutePlanLink, PlanWeek, RouteTrack, RunRecord, RunWithMap, SessionRouteRef } from '$lib/types';
import type { ActivityFeelInput, DebriefRaceHint } from '$lib/debrief-types';
import type { GoalBriefDraft } from '$lib/goal-brief';
import type { PlanPeekData } from '$lib/plan-peek';
import type { CreateRunInput, UpdateRunInput } from '$lib/run-input';
import { createServerFn } from '@tanstack/react-start';
import { requireAuth } from '../auth';
import { loadActivityHabits, loadGear, loadWardrobe, persistActivityHabits, persistGear, persistWardrobe } from '../context';
import { listRuns } from '../runs';

// ---------- reads ----------

/** Root-loader data shared by every page: sign-in state + the open body notes to score. */

export const getGearData = createServerFn({ method: 'GET' }).handler(async () => {
	const [gear, runs, habits, wardrobe] = await Promise.all([
		loadGear(),
		listRuns(),
		loadActivityHabits(),
		loadWardrobe()
	]);
	return { gear, gearWear: wearByAllGear(runs), habits, wardrobe };
});

export const saveGear = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: GearContext) => d)
	.handler(async ({ data }) => {
		await persistGear(data);
		return { ok: true };
	});

export const saveWardrobe = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: Wardrobe) => normalizeWardrobe(d))
	.handler(async ({ data }) => {
		return persistWardrobe(data);
	});

export const saveActivityHabits = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: ActivityHabits) => normalizeActivityHabits(d))
	.handler(async ({ data }) => {
		return persistActivityHabits(data);
	});

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_HORIZON_RE = /^\d{4}-\d{2}$/;

export type { GoalBriefDraft } from '$lib/goal-brief';

/** Prompt to invent race priorities/notes (and fill empty race fields) from recent training. */
