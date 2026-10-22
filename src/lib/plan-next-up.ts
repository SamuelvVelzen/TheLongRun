import { weekDayGroups, type WeekView } from '$lib/plan';

/** Next up: still to do or needs a log — not logged (done) or plan-skipped. */
export function isNextUpActionable(session: WeekView['sessions'][number]): boolean {
	return !session.done && !session.skipped;
}

export function nextUpHighlightSessions(weekView: WeekView): WeekView['sessions'] {
	if (weekView.next?.isToday) {
		return weekView.sessions.filter((s) => s.isToday && isNextUpActionable(s));
	}
	if (weekView.next && isNextUpActionable(weekView.next)) {
		return [weekView.next];
	}
	return [];
}

export function nextUpTodayUnplanned(weekView: WeekView, highlightHead: WeekView['sessions'][number] | undefined) {
	if (!highlightHead?.isToday) return [];
	const todayGroup = weekDayGroups(weekView).find((g) => g.isToday);
	return todayGroup?.unplanned ?? [];
}
