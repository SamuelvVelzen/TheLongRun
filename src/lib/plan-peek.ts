import type { PlanCalendar, WeekView } from '$lib/plan';
import type { SessionRouteRef } from '$lib/types';

export type PlanPeekData = {
	weekView: WeekView;
	calendar: PlanCalendar;
	planRoutes: SessionRouteRef[];
};
