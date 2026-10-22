import {
	isRestLike,
	planDayKicker,
	planDaySubline,
	weekDayGroups,
	weekDayGroupsCalendarOrder,
	weekToPlan,
	weekViewIsClosed,
	type PlanCalendar,
	type WeekDayGroup,
	type WeekView
} from '$lib/plan';
import type { SessionRouteRef } from '$lib/types';
import { cn } from '$lib/ui';
import { Link } from '@tanstack/react-router';
import { Icon } from './Icon';
import { PlannedSessionRow, UnplannedRow } from './WeekPlanBoard';
import { buttonClass } from './ui/Button';

const nextUpBase =
	'p-[0.9rem_1rem] border border-line rounded-xl max-sm:p-[0.7rem_0.8rem]';
const nextUp = cn(nextUpBase, 'bg-[color-mix(in_srgb,var(--color-accent)_10%,var(--color-panel))]');
const nextUpDone = cn(nextUpBase, 'bg-panel');
const nextUpKicker = 'text-[0.72rem] tracking-[0.08em] uppercase font-bold text-accent-fg m-0';
const dateSubline = 'text-muted m-0 mt-0.5 mb-1.5 text-[0.82rem] max-sm:text-[0.78rem]';
const sectionGap = 'mb-7 max-sm:mb-6';

const fmtDayChip = new Intl.DateTimeFormat('en-GB', { weekday: 'short' });

const DAY_CHIP = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;

/** Next up: still to do or needs a log — not logged (done) or plan-skipped. */
function isNextUpActionable(session: WeekView['sessions'][number]): boolean {
	return !session.done && !session.skipped;
}

function dayChipLabel(day: string, date: string | null): string {
	if (date) {
		const d = new Date(`${date}T12:00:00`);
		if (!Number.isNaN(d.getTime())) {
			return fmtDayChip.format(d).slice(0, 2);
		}
	}
	const i = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].findIndex(
		(d) => d.toLowerCase() === day.trim().toLowerCase()
	);
	return i >= 0 ? DAY_CHIP[i] : day.slice(0, 2);
}

type DayStripState = 'rest' | 'done' | 'next' | 'unlogged' | 'upcoming' | 'today' | 'idle';

function dayStripState(group: WeekDayGroup): DayStripState {
	if (!group.sessions.length && !group.unplanned.length) return 'idle';
	if (group.unplanned.length && !group.sessions.length) return 'unlogged';
	const workouts = group.sessions.filter((s) => !isRestLike(s.label));
	if (!workouts.length) return 'rest';
	if (workouts.some((s) => s.isNext)) return 'next';
	if (workouts.some((s) => s.unlogged)) return 'unlogged';
	if (workouts.every((s) => s.done || s.skipped)) return 'done';
	if (group.isToday) return 'today';
	return 'upcoming';
}

function iconForPlanDate(date: string | null): 'sun' | 'calendar' | 'arrow' {
	if (!date) return 'arrow';
	const k = planDayKicker(date);
	if (k === 'Today') return 'sun';
	if (k === 'Tomorrow') return 'calendar';
	return 'arrow';
}

function WeekProgressStrip({
	view,
	calendar,
	coachSearch,
	embedded = false
}: {
	view: WeekView;
	calendar: PlanCalendar;
	coachSearch: { tab: 'plan'; planWeek: number };
	/** Inside week meta block (below week title). */
	embedded?: boolean;
}) {
	const groups = weekDayGroupsCalendarOrder(view, calendar);

	return (
		<div
			className={cn(
				'flex justify-between gap-0.5',
				embedded ? 'mt-2 mb-1 max-sm:mt-1.5 max-sm:mb-0.5' : 'mt-3 mb-2 max-sm:mt-2 max-sm:mb-1.5'
			)}
			role="list"
			aria-label="This week Monday through Sunday"
		>
			{groups.map((group) => {
				const state = dayStripState(group);
				const isNext = state === 'next';
				return (
					<Link
						key={group.day}
						role="listitem"
						to="/coach"
						search={coachSearch}
						className={cn(
							'flex flex-col items-center gap-0.5 min-w-0 flex-1 px-0 py-0.5 rounded-md no-underline text-inherit transition-colors hover:bg-accent/8',
							isNext && 'ring-1 ring-accent ring-offset-1 ring-offset-transparent',
							group.isToday && !isNext && 'bg-accent/6'
						)}
						title={group.date ? planDaySubline(group.date) : group.day}
					>
						<span className="text-[0.6rem] font-semibold text-muted uppercase max-sm:text-[0.58rem]">
							{dayChipLabel(group.day, group.date)}
						</span>
						<span
							className={cn(
								'w-1.5 h-1.5 rounded-full max-sm:w-1.5 max-sm:h-1.5',
								state === 'idle' && 'bg-transparent border border-line/50',
								state === 'done' && 'bg-ok/80',
								state === 'next' && 'bg-accent',
								state === 'unlogged' && 'bg-muted border border-dashed border-line',
								state === 'rest' && 'bg-transparent border border-line/70',
								state === 'today' && 'bg-accent/45',
								state === 'upcoming' && 'bg-line'
							)}
							aria-hidden
						/>
					</Link>
				);
			})}
		</div>
	);
}

function WeekMetaBlock({
	weekView,
	calendar,
	coachPlanSearch,
	unloggedCount
}: {
	weekView: WeekView;
	calendar: PlanCalendar;
	coachPlanSearch: { tab: 'plan'; planWeek: number };
	unloggedCount: number;
}) {
	const weekShort = [`Week ${weekView.week.week}`, weekView.week.phase].filter(Boolean).join(' · ');

	return (
		<div className="mt-3 pt-2.5 border-t border-line/80 max-sm:mt-2.5 max-sm:pt-2">
			<Link
				to="/coach"
				search={coachPlanSearch}
				className="text-[0.86rem] font-semibold text-accent-fg no-underline hover:underline underline-offset-2 max-sm:text-[0.82rem]"
			>
				{weekShort}
			</Link>
			<WeekProgressStrip
				view={weekView}
				calendar={calendar}
				coachSearch={coachPlanSearch}
				embedded
			/>
			{weekView.week.focus ? (
				<p
					className={cn(
						'text-muted',
						'm-0 mt-1 text-[0.84rem] leading-snug max-sm:hidden'
					)}
				>
					{weekView.week.focus}
				</p>
			) : null}
			{(weekView.unplanned.length > 0 || unloggedCount > 0) && (
				<div className="flex flex-wrap gap-1.5 mt-2 max-sm:mt-1.5">
					{weekView.unplanned.length ? (
						<Link
							to="/coach"
							search={coachPlanSearch}
							className="inline-flex items-center rounded-full border border-dashed border-accent/45 bg-accent/6 px-2 py-0.5 text-[0.72rem] font-semibold text-accent-fg no-underline max-sm:text-[0.68rem]"
						>
							{weekView.unplanned.length} unplanned
						</Link>
					) : null}
					{unloggedCount ? (
						<Link
							to="/coach"
							search={coachPlanSearch}
							className="inline-flex items-center rounded-full border border-dashed border-line px-2 py-0.5 text-[0.72rem] font-semibold text-muted no-underline max-sm:text-[0.68rem]"
						>
							{unloggedCount === 1 ? '1 needs log' : `${unloggedCount} need logs`}
						</Link>
					) : null}
				</div>
			)}
		</div>
	);
}

function HighlightSessions({
	sessions,
	week,
	routes,
	todayUnplanned
}: {
	sessions: WeekView['sessions'];
	week: number;
	routes: SessionRouteRef[];
	todayUnplanned: WeekView['unplanned'];
}) {
	return (
		<div className="flex flex-col gap-2 max-sm:gap-1.5">
			{sessions.map((session, i) => (
				<PlannedSessionRow
					key={`${session.day}-${session.label}-${session.planIndex}`}
					session={session}
					week={week}
					routes={routes}
					divided={i > 0}
					layout="compact"
					surface="nextUp"
					coachPlanWeek={week}
					sessionDate={i === 0 ? session.date : null}
					headingId={sessions.length === 1 && i === 0 ? 'next-up-heading' : undefined}
				/>
			))}
			{todayUnplanned.map((item, i) => (
				<UnplannedRow
					key={item.slug}
					item={item}
					divided={sessions.length > 0 || i > 0}
				/>
			))}
		</div>
	);
}

function DayHeader({
	date,
	fallbackKicker,
	fallbackIcon
}: {
	date: string | null;
	fallbackKicker: string;
	fallbackIcon: 'sun' | 'calendar' | 'arrow' | 'circle' | 'check';
}) {
	const kicker = date ? planDayKicker(date) : fallbackKicker;
	const sub = date ? planDaySubline(date) : null;
	const icon = date ? iconForPlanDate(date) : fallbackIcon;
	return (
		<header className="mb-2 max-sm:mb-1.5">
			<p className={cn(nextUpKicker, 'inline-flex items-center gap-1.5')}>
				<Icon name={icon} size={12} className="max-sm:w-3 max-sm:h-3" />
				{kicker}
			</p>
			{sub ? <p className={dateSubline}>{sub}</p> : null}
		</header>
	);
}

export function DashboardNextUp({
	weekView,
	calendar,
	planRoutes
}: {
	weekView: WeekView;
	calendar: PlanCalendar;
	planRoutes: SessionRouteRef[];
}) {
	const currentWeekNum = weekToPlan(calendar);
	const nextWeekNum = currentWeekNum + 1;
	const laterWeek = weekView.week.week > currentWeekNum;
	const highlightSessions = weekView.next?.isToday
		? weekView.sessions.filter((s) => s.isToday && isNextUpActionable(s))
		: weekView.next && isNextUpActionable(weekView.next)
			? [weekView.next]
			: [];
	const highlightHead = highlightSessions[0];
	const todayGroup = weekDayGroups(weekView).find((g) => g.isToday);
	const todayUnplanned = todayGroup?.unplanned ?? [];
	const unloggedCount = weekView.sessions.filter((s) => s.unlogged).length;
	const coachPlanSearch = { tab: 'plan' as const, planWeek: weekView.week.week };
	const coachNextWeekSearch = { tab: 'generate' as const, planWeek: nextWeekNum };
	const canPlanNext =
		weekView.week.week === currentWeekNum &&
		weekViewIsClosed(weekView) &&
		nextWeekNum <= calendar.weekCount;

	const kickerUnlogged = !highlightHead && unloggedCount > 0;
	const fallbackKicker = kickerUnlogged
		? 'Catch up'
		: laterWeek
			? 'Next week'
			: 'This week';
	const fallbackIcon = kickerUnlogged
		? 'circle'
		: canPlanNext
			? 'calendar'
			: 'check';

	if (highlightHead) {
		return (
			<section className={cn(nextUp, sectionGap)} aria-labelledby="next-up-heading">
				{highlightSessions.length > 1 ? (
					<h2 id="next-up-heading" className="sr-only">Today&apos;s sessions</h2>
				) : null}
				{laterWeek ? (
					<p className={cn('text-muted', 'm-0 mb-1.5 text-[0.8rem] max-sm:hidden')}>
						Showing week {weekView.week.week} — this week is complete.
					</p>
				) : null}
				<HighlightSessions
					sessions={highlightSessions}
					week={weekView.week.week}
					routes={planRoutes}
					todayUnplanned={highlightHead.isToday ? todayUnplanned : []}
				/>
				<WeekMetaBlock
					weekView={weekView}
					calendar={calendar}
					coachPlanSearch={coachPlanSearch}
					unloggedCount={unloggedCount}
				/>
			</section>
		);
	}

	return (
		<section
			className={cn(canPlanNext ? nextUp : nextUpDone, sectionGap)}
			aria-labelledby="next-up-heading"
		>
			<DayHeader date={null} fallbackKicker={fallbackKicker} fallbackIcon={fallbackIcon} />
			<h2
				id="next-up-heading"
				className="text-[1.35rem] font-[750] tracking-[-0.03em] m-0 mb-2 [overflow-wrap:anywhere] max-sm:text-[1.1rem]"
			>
				{unloggedCount
					? unloggedCount === 1
						? 'One session still needs a log'
						: `${unloggedCount} sessions still need logs`
					: canPlanNext
						? 'Plan next week'
						: weekView.sessions.some((s) => s.skipped)
							? 'Week complete — some sessions skipped'
							: 'All planned sessions logged'}
			</h2>
			{canPlanNext ? (
				<Link
					to="/coach"
					search={coachNextWeekSearch}
					className={buttonClass({
						variant: 'primary',
						size: 'sm',
						className: 'inline-flex items-center justify-center gap-2 w-full mt-2 max-sm:min-h-10'
					})}
				>
					<Icon name="sparkle" size={15} />
					Plan week {nextWeekNum}
				</Link>
			) : (
				<Link
					to="/coach"
					search={coachPlanSearch}
					className={buttonClass({
						variant: 'primary',
						size: 'sm',
						className: 'inline-flex items-center justify-center gap-2 w-full mt-2 max-sm:min-h-10'
					})}
				>
					<Icon name="board" size={15} />
					Open week in Coach
				</Link>
			)}
			<WeekMetaBlock
				weekView={weekView}
				calendar={calendar}
				coachPlanSearch={coachPlanSearch}
				unloggedCount={unloggedCount}
			/>
		</section>
	);
}
