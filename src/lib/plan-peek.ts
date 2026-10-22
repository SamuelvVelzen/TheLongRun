import type { PlanCalendar, SessionRouteRef, WeekView } from '$lib/types';

export type PlanPeekData = {
	weekView: WeekView;
	calendar: PlanCalendar;
	planRoutes: SessionRouteRef[];
};
