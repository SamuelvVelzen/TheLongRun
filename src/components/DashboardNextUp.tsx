import type { Goal } from '$lib/types';
import {
	isRestLike,
	weekDayGroups,
	weekToPlan,
	weekViewIsClosed,
	type PlanCalendar,
	type WeekSessionView,
	type WeekView
} from '$lib/plan';
import type { SessionRouteRef } from '$lib/types';
import { cn } from '$lib/ui';
import { Link } from '@tanstack/react-router';
import { Icon } from './Icon';
import {
	canLogPlannedStrength,
	plannedSessionLogSearch,
	plannedStrengthLogSearch
} from './LogPlannedStrength';
import { PlannedSessionRow, UnplannedRow } from './WeekPlanBoard';
import { buttonClass } from './ui/Button';
import { IconLabelLink } from './ui';

const nextUpBase =
	'p-[1rem_1.1rem_1.05rem] border border-line rounded-xl max-sm:p-[0.85rem_0.9rem_0.9rem]';
const nextUp = cn(nextUpBase, 'bg-[color-mix(in_srgb,var(--color-accent)_10%,var(--color-panel))]');
const nextUpDone = cn(nextUpBase, 'bg-panel');
const nextUpKicker = 'text-[0.72rem] tracking-[0.08em] uppercase font-bold text-accent-fg m-0 mb-1';
const sectionGap = 'mb-8 max-sm:mb-7';

const DAY_SHORT = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;

function dayShortLabel(day: string): string {
	const i = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].findIndex(
		(d) => d.toLowerCase() === day.trim().toLowerCase()
	);
	return i >= 0 ? DAY_SHORT[i] : day.slice(0, 2);
}

type DayStripState = 'empty' | 'rest' | 'done' | 'next' | 'unlogged' | 'upcoming' | 'today';

function dayStripState(group: ReturnType<typeof weekDayGroups>[number]): DayStripState {
	if (!group.sessions.length && !group.unplanned.length) return 'empty';
	if (group.unplanned.length && !group.sessions.length) return 'unlogged';
	const workouts = group.sessions.filter((s) => !isRestLike(s.label));
	if (!workouts.length) return 'rest';
	if (workouts.some((s) => s.isNext)) return 'next';
	if (workouts.some((s) => s.unlogged)) return 'unlogged';
	if (workouts.every((s) => s.done || s.skipped)) return 'done';
	if (group.isToday) return 'today';
	return 'upcoming';
}

function WeekProgressStrip({
	view,
	coachSearch
}: {
	view: WeekView;
	coachSearch: { tab: 'plan'; planWeek: number };
}) {
	const groups = weekDayGroups(view);
	if (!groups.length) return null;

	return (
		<div
			className="flex flex-wrap gap-1.5 mt-3 mb-4"
			role="list"
			aria-label="This week at a glance"
		>
			{groups.map((group) => {
				const state = dayStripState(group);
				if (state === 'empty') return null;
				return (
					<Link
						key={group.day}
						role="listitem"
						to="/coach"
						search={coachSearch}
						className={cn(
							'flex flex-col items-center gap-0.5 min-w-[2.35rem] px-1 py-1 rounded-lg no-underline text-inherit transition-colors hover:bg-accent/8',
							state === 'next' && 'ring-2 ring-accent ring-offset-2 ring-offset-[var(--color-panel)]',
							group.isToday && state !== 'next' && 'bg-accent/6'
						)}
						title={`${group.day}${group.date ? ` · ${group.date}` : ''}`}
					>
						<span className="text-[0.65rem] font-semibold text-muted">{dayShortLabel(group.day)}</span>
						<span
							className={cn(
								'w-2 h-2 rounded-full',
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

function SessionPrimaryAction({
	session,
	className
}: {
	session: WeekSessionView;
	className?: string;
}) {
	if (session.done || session.skipped || isRestLike(session.label)) return null;
	if (canLogPlannedStrength(session)) {
		return (
			<Link
				to="/import"
				search={plannedStrengthLogSearch(session)}
				className={buttonClass({ variant: 'primary', size: 'sm', className: cn('w-full max-sm:w-full', className) })}
			>
				<Icon name="plus" size={15} />
				Log as planned
			</Link>
		);
	}
	return (
		<Link
			to="/import"
			search={plannedSessionLogSearch(session)}
			className={buttonClass({ variant: 'primary', size: 'sm', className: cn('w-full max-sm:w-full', className) })}
		>
			<Icon name="plus" size={15} />
			Log activity
		</Link>
	);
}

function PlanContextLine({
	weekView,
	activeGoal,
	raceDays
}: {
	weekView: WeekView;
	activeGoal: Goal | null;
	raceDays: number | null;
}) {
	const phase = [weekView.week.phase, weekView.week.focus].filter(Boolean).join(' · ');
	const raceBit =
		activeGoal && raceDays != null && raceDays >= 0
			? raceDays === 0
				? `${activeGoal.name} is today`
				: `${raceDays} days to ${activeGoal.name}`
			: activeGoal && raceDays != null && raceDays < 0
				? `Since ${activeGoal.name}`
				: null;
	const bits = [phase, raceBit].filter(Boolean);
	if (!bits.length) return null;
	return <p className={cn('text-muted', 'm-0 mb-2 text-[0.88rem] leading-snug')}>{bits.join(' · ')}</p>;
}

function NextUpFooter({
	weekView,
	coachPlanSearch,
	unloggedCount
}: {
	weekView: WeekView;
	coachPlanSearch: { tab: 'plan'; planWeek: number };
	unloggedCount: number;
}) {
	return (
		<div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-line/80">
			<Link
				to="/coach"
				search={coachPlanSearch}
				className="inline-flex items-center gap-1 rounded-full border border-line bg-inset px-2.5 py-1 text-[0.78rem] font-semibold text-accent-fg no-underline hover:border-accent/40"
			>
				Week {weekView.week.week}
				{weekView.week.phase ? ` · ${weekView.week.phase}` : ''}
			</Link>
			{weekView.week.focus ? (
				<span className="rounded-full border border-line/80 px-2.5 py-1 text-[0.78rem] text-muted">
					{weekView.week.focus}
				</span>
			) : null}
			{weekView.unplanned.length ? (
				<Link
					to="/coach"
					search={coachPlanSearch}
					className="inline-flex items-center gap-1 rounded-full border border-dashed border-accent/45 bg-accent/6 px-2.5 py-1 text-[0.78rem] font-semibold text-accent-fg no-underline"
				>
					{weekView.unplanned.length} unplanned logged
				</Link>
			) : null}
			{unloggedCount ? (
				<Link
					to="/coach"
					search={coachPlanSearch}
					className="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-2.5 py-1 text-[0.78rem] font-semibold text-muted no-underline hover:text-fg"
				>
					{unloggedCount === 1 ? '1 needs a log' : `${unloggedCount} need logs`}
				</Link>
			) : null}
		</div>
	);
}

function HighlightSessions({
	sessions,
	week,
	routes,
	todayUnplanned
}: {
	sessions: WeekSessionView[];
	week: number;
	routes: SessionRouteRef[];
	todayUnplanned: WeekView['unplanned'];
}) {
	const nextSession = sessions.find((s) => s.isNext && !s.done && !s.skipped);
	return (
		<div className="flex flex-col gap-3">
			{sessions.map((session, i) => (
				<PlannedSessionRow
					key={`${session.day}-${session.label}-${session.planIndex}`}
					session={session}
					week={week}
					routes={routes}
					divided={i > 0}
				/>
			))}
			{todayUnplanned.map((item, i) => (
				<UnplannedRow
					key={item.slug}
					item={item}
					divided={sessions.length > 0 || i > 0}
				/>
			))}
			{nextSession ? (
				<div className="flex flex-col gap-2 sm:flex-row sm:items-center pt-1">
					<SessionPrimaryAction session={nextSession} className="sm:flex-1" />
					<IconLabelLink
						label="Full week in Coach"
						size="sm"
						variant="ghost"
						to="/coach"
						search={{ tab: 'plan', planWeek: week }}
						icon={<Icon name="board" size={15} />}
						className="justify-center"
					/>
				</div>
			) : (
				<IconLabelLink
					label="Full week in Coach"
					size="sm"
					variant="ghost"
					to="/coach"
					search={{ tab: 'plan', planWeek: week }}
					icon={<Icon name="board" size={15} />}
					className="mt-1"
				/>
			)}
		</div>
	);
}

export function DashboardNextUp({
	weekView,
	calendar,
	planRoutes,
	activeGoal,
	raceDays
}: {
	weekView: WeekView;
	calendar: PlanCalendar;
	planRoutes: SessionRouteRef[];
	activeGoal: Goal | null;
	raceDays: number | null;
}) {
	const currentWeekNum = weekToPlan(calendar);
	const nextWeekNum = currentWeekNum + 1;
	const laterWeek = weekView.week.week > currentWeekNum;
	const highlightSessions = weekView.next?.isToday
		? weekView.sessions.filter((s) => s.isToday)
		: weekView.next
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
	const kickerLabel = kickerUnlogged
		? 'Catch up'
		: highlightHead?.isToday
			? 'Today'
			: laterWeek
				? 'Next week'
				: 'Next up';

	const kickerIcon = kickerUnlogged
		? 'circle'
		: highlightHead?.isToday
			? 'sun'
			: laterWeek
				? 'calendar'
				: 'arrow';

	if (highlightHead) {
		const title =
			highlightSessions.length === 1
				? `${highlightHead.label}${highlightHead.date ? ` · ${highlightHead.day} ${highlightHead.date.slice(5)}` : ''}`
				: `${highlightHead.day}${highlightHead.date ? ` · ${highlightHead.date.slice(5)}` : ''}`;

		return (
			<section className={cn(nextUp, sectionGap)} aria-labelledby="next-up-heading">
				<p className={cn(nextUpKicker, 'inline-flex items-center gap-1.5')}>
					<Icon name={kickerIcon} size={13} />
					{kickerLabel}
				</p>
				<PlanContextLine weekView={weekView} activeGoal={activeGoal} raceDays={raceDays} />
				{laterWeek ? (
					<p className={cn('text-muted', 'm-0 mb-2 text-[0.84rem]')}>
						This week is complete — showing week {weekView.week.week}.
					</p>
				) : null}
				<h2
					id="next-up-heading"
					className="text-[1.45rem] font-[750] tracking-[-0.03em] m-0 mb-3 [overflow-wrap:anywhere] max-sm:text-[1.2rem]"
				>
					{title}
				</h2>
				<WeekProgressStrip view={weekView} coachSearch={coachPlanSearch} />
				<HighlightSessions
					sessions={highlightSessions}
					week={weekView.week.week}
					routes={planRoutes}
					todayUnplanned={highlightHead.isToday ? todayUnplanned : []}
				/>
				<NextUpFooter
					weekView={weekView}
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
			<p className={cn(nextUpKicker, 'inline-flex items-center gap-1.5')}>
				<Icon name={canPlanNext ? 'calendar' : kickerUnlogged ? 'circle' : 'check'} size={13} />
				{canPlanNext ? 'Next week' : kickerUnlogged ? 'Catch up' : 'This week'}
			</p>
			<PlanContextLine weekView={weekView} activeGoal={activeGoal} raceDays={raceDays} />
			<h2
				id="next-up-heading"
				className="text-[1.45rem] font-[750] tracking-[-0.03em] m-0 mb-2 [overflow-wrap:anywhere] max-sm:text-[1.2rem]"
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
			<WeekProgressStrip view={weekView} coachSearch={coachPlanSearch} />
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
				{canPlanNext ? (
					<Link
						to="/coach"
						search={coachNextWeekSearch}
						className={buttonClass({
							variant: 'primary',
							size: 'default',
							className: 'inline-flex items-center justify-center gap-2 w-full sm:flex-1'
						})}
					>
						<Icon name="sparkle" size={16} />
						Plan week {nextWeekNum} in Coach
					</Link>
				) : (
					<Link
						to="/coach"
						search={coachPlanSearch}
						className={buttonClass({
							variant: 'primary',
							size: 'default',
							className: 'inline-flex items-center justify-center gap-2 w-full sm:flex-1'
						})}
					>
						<Icon name="board" size={16} />
						See the week in Coach
					</Link>
				)}
			</div>
			<NextUpFooter
				weekView={weekView}
				coachPlanSearch={coachPlanSearch}
				unloggedCount={unloggedCount}
			/>
		</section>
	);
}
