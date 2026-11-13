import type { GearContext } from '$lib/gear';
import type { PlanCalendar, WeekView } from '$lib/plan';
import type { ActivityGroupInfo, Goal, PlanWeek, RouteTrack, RunWithMap, SessionRouteRef } from '$lib/types';
import {
	dashboardCoreDataSchema,
	emptyDashboardCoreData,
	formatDashboardCoreIssues
} from './page-data-schema';

export type DashboardPageData = {
	runs: RunWithMap[];
	tracks: RouteTrack[];
	gear: GearContext;
	groups: ActivityGroupInfo[];
	week: PlanWeek | null;
	weekView: WeekView | null;
	planRoutes: SessionRouteRef[];
	streak: number;
	activeGoal: Goal | null;
	nextIntention: Goal | null;
	lastMedal: Goal | null;
	calendar: PlanCalendar;
};

function isRecord(v: unknown): v is Record<string, unknown> {
	return v != null && typeof v === 'object';
}

/** Server — validates core lists before the response is serialized. */
export function assertDashboardPageData(raw: unknown): DashboardPageData {
	dashboardCoreDataSchema.parse(raw);
	return raw as DashboardPageData;
}

/** Client loader boundary — keep plan/calendar payload, but never read a broken runs list. */
export function parseDashboardPageData(raw: unknown): DashboardPageData {
	if (!isRecord(raw)) {
		console.error('Invalid dashboard page data: (root): not an object');
		const core = emptyDashboardCoreData();
		return {
			runs: core.runs,
			groups: core.groups,
			gear: core.gear,
			tracks: [],
			week: null,
			weekView: null,
			planRoutes: [],
			streak: 0,
			activeGoal: null,
			nextIntention: null,
			lastMedal: null,
			calendar: { startIso: '', weekCount: 0, rolling: false }
		};
	}
	const result = dashboardCoreDataSchema.safeParse(raw);
	if (!result.success) {
		console.error('Invalid dashboard page data:', formatDashboardCoreIssues(result.error));
		const core = emptyDashboardCoreData();
		return { ...(raw as DashboardPageData), ...core };
	}
	return raw as DashboardPageData;
}
