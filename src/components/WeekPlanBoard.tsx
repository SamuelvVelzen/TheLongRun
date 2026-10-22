import { StatusPill } from './ui';
import { activityLabel } from '$lib/activity';
import {
	planDayKicker,
	planDaySubline,
	sessionMeasureLabel,
	weekDayGroups,
	type UnplannedActivity,
	type WeekSessionView,
	type WeekView
} from '$lib/plan';
import type { SessionRouteRef } from '$lib/types';
import { cn } from '$lib/ui';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { ActivityIcon, Icon } from './Icon';
import { PlanSessionBody } from './PlanSessionBody';
import { PlanSessionMenu } from './PlanSessionMenu';
import { PlanSessionRoute, PlanSessionRouteOpenLink } from './PlanSessionRoute';

function StatusBadge({
	done,
	skipped,
	unlogged,
	isNext,
	isToday
}: {
	done: boolean;
	skipped: boolean;
	unlogged: boolean;
	isNext: boolean;
	isToday: boolean;
}) {
	if (done) {
		return (
			<StatusPill className="text-ok border border-[rgba(125,255,168,0.35)] bg-ok/10">
				<Icon name="check" size={11} />
				Completed
			</StatusPill>
		);
	}
	if (skipped) {
		return (
			<StatusPill className="text-muted border border-line bg-inset">
				<Icon name="skip" size={11} />
				Skipped
			</StatusPill>
		);
	}
	if (unlogged) {
		return (
			<StatusPill className="text-muted border border-dashed border-line bg-inset">
				<Icon name="circle" size={11} />
				No log
			</StatusPill>
		);
	}
	if (isNext) {
		return (
			<StatusPill className="text-accent-ink bg-accent border border-accent">
				<Icon name={isToday ? 'sun' : 'arrow'} size={11} />
				{isToday ? 'Today' : 'Next'}
			</StatusPill>
		);
	}
	if (isToday) {
		return (
			<StatusPill className="text-accent-fg border border-accent/40 bg-accent/8">
				<Icon name="sun" size={11} />
				Today
			</StatusPill>
		);
	}
	return null;
}

function UnplannedBadge() {
	return (
		<StatusPill className="text-accent-fg border border-dashed border-accent/45 bg-accent/6">
			<Icon name="unplanned" size={11} />
			Unplanned
		</StatusPill>
	);
}

export function UnplannedRow({ item, divided }: { item: UnplannedActivity; divided: boolean }) {
	return (
		<Link
			to="/runs/$slug"
			params={{ slug: item.slug }}
			className={cn(
				'flex flex-col gap-[0.2rem] min-w-0 text-inherit no-underline rounded-inset -mx-1 px-1 py-1 hover:bg-accent/6',
				divided && 'pt-3 mt-0 border-t border-dashed border-line'
			)}
		>
			<div className="flex items-center justify-between gap-2 min-w-0">
				<span className="inline-flex items-center gap-1 text-[0.78rem] font-semibold text-muted min-w-0 [overflow-wrap:anywhere]">
					<ActivityIcon type={item.activity_type} size={13} />
					{activityLabel(item.activity_type)}
					{item.distance_km != null ? ` · ${item.distance_km} km` : ''}
				</span>
				<UnplannedBadge />
			</div>
			<strong className="font-display text-[1.02rem] font-bold tracking-[-0.02em] leading-[1.25] [overflow-wrap:anywhere]">
				Unplanned {activityLabel(item.activity_type).toLowerCase()}
			</strong>
			<p className="m-0 text-[0.9rem] leading-[1.45] text-fg/90 [overflow-wrap:anywhere]">
				Logged extra — not a planned session.
			</p>
		</Link>
	);
}

function sessionSportLine(session: WeekSessionView): string {
	return [activityLabel(session.activity_type ?? 'run'), sessionMeasureLabel(session)]
		.filter(Boolean)
		.join(' · ');
}

export function PlannedSessionRow({
	session,
	week,
	routes,
	divided,
	layout = 'board',
	coachPlanWeek,
	sessionDate = null,
	headingId,
	surface = 'coach'
}: {
	session: WeekSessionView;
	week: number;
	routes: SessionRouteRef[];
	divided: boolean;
	layout?: 'board' | 'compact';
	coachPlanWeek?: number;
	/** Compact header kicker; calendar date omitted when `session.isToday`. */
	sessionDate?: string | null;
	headingId?: string;
	surface?: 'coach' | 'nextUp';
}) {
	const [routePickerOpen, setRoutePickerOpen] = useState(false);
	const [confirmUnlink, setConfirmUnlink] = useState(false);
	const logSlug = session.done ? session.logSlug : null;
	const linked = Boolean(session.route && !session.done);
	const compact = layout === 'compact';
	const sportLine = sessionSportLine(session);
	const titleSuffix = sportLine ? (
		<span className="text-muted font-semibold text-[0.85rem] max-sm:text-[0.8rem]">
			{' · '}
			{sportLine}
		</span>
	) : null;
	const titleInner = (
		<>
			{session.label}
			{titleSuffix}
		</>
	);
	const titleContent = logSlug ? (
		<Link
			to="/runs/$slug"
			params={{ slug: logSlug }}
			className="text-inherit no-underline hover:text-accent-fg"
		>
			{titleInner}
		</Link>
	) : (
		titleInner
	);
	const className = cn(
		'flex flex-col min-w-0',
		compact ? 'gap-1' : 'gap-[0.2rem]',
		divided && !compact && 'pt-3 border-t border-line',
		divided && compact && 'pt-2 border-t border-line/80',
		session.done && 'opacity-80',
		session.skipped && 'opacity-55',
		logSlug && 'rounded-inset -mx-1 px-1 py-1'
	);
	const menu = (
		<PlanSessionMenu
			week={week}
			session={session}
			linked={linked}
			onAddRoute={() => setRoutePickerOpen(true)}
			onUnlinkRoute={linked ? () => setConfirmUnlink(true) : undefined}
			coachPlanWeek={coachPlanWeek}
		/>
	);
	const statusOnly =
		session.done || session.skipped || session.unlogged
			? (
					<StatusBadge
						done={session.done}
						skipped={session.skipped}
						unlogged={session.unlogged}
						isNext={false}
						isToday={false}
					/>
				)
			: null;

	const routeDialogs = (
		<PlanSessionRoute
			week={week}
			session={session}
			routes={routes}
			pickerOpen={routePickerOpen}
			onPickerClose={() => setRoutePickerOpen(false)}
			confirmUnlink={confirmUnlink}
			onConfirmUnlinkChange={setConfirmUnlink}
			variant="none"
		/>
	);
	const routeToolbar =
		linked && session.route ? (
			<PlanSessionRouteOpenLink
				route={session.route}
				compact={compact}
				onClick={(e) => e.stopPropagation()}
			/>
		) : null;
	const toolbar = (
		<div className="flex items-center gap-0.5 shrink-0 self-start -mt-0.5">
			{statusOnly}
			{routeToolbar}
			{menu}
		</div>
	);

	const body = compact ? (
		<>
			<div className="flex items-start justify-between gap-2 min-w-0">
				<div className="min-w-0 flex-1">
					{sessionDate ? (
						<p className="m-0 text-[0.7rem] tracking-[0.06em] uppercase font-bold text-accent-fg leading-snug">
							{planDayKicker(sessionDate)}
							{!session.isToday ? (
								<span className="text-muted font-semibold normal-case tracking-normal text-[0.78rem]">
									{' · '}
									{planDaySubline(sessionDate)}
								</span>
							) : null}
						</p>
					) : null}
					{headingId ? (
						<h2
							id={headingId}
							className={cn(
								'm-0 font-display font-[750] tracking-[-0.03em] leading-[1.2] [overflow-wrap:anywhere]',
								sessionDate ? 'mt-0.5 text-[1.25rem] max-sm:text-[1.1rem]' : 'text-[1.02rem]'
							)}
						>
							{titleContent}
						</h2>
					) : (
						<p
							className={cn(
								'm-0 font-display font-[750] tracking-[-0.03em] leading-[1.2] [overflow-wrap:anywhere]',
								sessionDate ? 'mt-0.5 text-[1.25rem] max-sm:text-[1.1rem]' : 'text-[1.02rem]'
							)}
						>
							{titleContent}
						</p>
					)}
				</div>
				{toolbar}
			</div>
			<PlanSessionBody
				session={session}
				compact
				surface={surface}
				className="[overflow-wrap:anywhere]"
			/>
			{routeDialogs}
		</>
	) : (
		<>
			<div className="flex items-start justify-between gap-2 min-w-0">
				<span className="inline-flex items-center gap-1 text-[0.78rem] font-semibold text-muted min-w-0 [overflow-wrap:anywhere] pt-0.5">
					<ActivityIcon type={session.activity_type ?? 'run'} size={13} />
					{sportLine}
				</span>
				<div className="flex items-center gap-0.5 shrink-0 self-start">
					<StatusBadge
						done={session.done}
						skipped={session.skipped}
						unlogged={session.unlogged}
						isNext={session.isNext}
						isToday={session.isToday}
					/>
					{routeToolbar}
					{menu}
				</div>
			</div>
			<strong className="font-display text-[1.02rem] font-bold tracking-[-0.02em] leading-[1.25] [overflow-wrap:anywhere]">
				{titleContent}
			</strong>
			<PlanSessionBody session={session} className="[overflow-wrap:anywhere]" />
			{routeDialogs}
		</>
	);
	return (
		<div className={className}>
			{body}
		</div>
	);
}

function isFinishedSession(session: WeekSessionView): boolean {
	return session.done || session.skipped;
}

export function WeekPlanBoard({
	view,
	title,
	routes = []
}: {
	view: WeekView;
	title?: string;
	routes?: SessionRouteRef[];
}) {
	const [showCompleted, setShowCompleted] = useState(false);
	const days = weekDayGroups(view);
	const finishedCount = view.sessions.filter(isFinishedSession).length;
	const visibleDays = days
		.map((group) => ({
			...group,
			sessions: showCompleted ? group.sessions : group.sessions.filter((s) => !isFinishedSession(s))
		}))
		.filter((group) => group.sessions.length > 0 || group.unplanned.length > 0);

	return (
		<section className="mb-5" aria-labelledby="week-plan-heading">
			<div className="mb-3 [&_h2]:text-[1.2rem] [&_h2]:font-bold [&_h2]:m-0 [&_p]:mt-1 [&_p]:mb-0 [&_p]:text-[0.92rem]">
				<h2 id="week-plan-heading">{title ?? `Week ${view.week.week}`}</h2>
				<p className={'text-muted'}>
					{[view.week.dates, view.week.phase, view.week.focus].filter(Boolean).join(' · ')}
					{view.unplanned.length ? ` · ${view.unplanned.length} unplanned logged` : ''}
					{finishedCount > 0 && (
						<>
							{' · '}
							<button
								type="button"
								className="appearance-none bg-transparent border-0 p-0 m-0 text-accent-fg font-semibold font-inherit cursor-pointer hover:underline underline-offset-2"
								aria-expanded={showCompleted}
								onClick={() => setShowCompleted((prev) => !prev)}
							>
								{showCompleted
									? 'Hide completed'
									: finishedCount === 1
										? 'Show 1 completed'
										: `Show ${finishedCount} completed`}
							</button>
						</>
					)}
				</p>
			</div>
			<div className="grid grid-cols-1 gap-3 min-[720px]:grid-cols-2">
				{visibleDays.map((group) => {
					const onlyUnplanned = group.sessions.length === 0 && group.unplanned.length > 0;
					const nextHere = group.sessions.some((s) => s.isNext);
					const sessionCount = group.sessions.length + group.unplanned.length;
					return (
						<article
							key={group.day}
							className={cn(
								'flex flex-col gap-2.5 min-w-0 h-full min-h-0 p-[0.85rem_0.95rem] rounded-[14px] border',
								nextHere
									? 'border-[color-mix(in_srgb,var(--color-accent)_40%,var(--color-line))] bg-[color-mix(in_srgb,var(--color-accent)_10%,var(--color-panel))]'
									: onlyUnplanned
										? 'border-dashed border-[rgba(200,242,90,0.35)] bg-[color-mix(in_srgb,var(--color-panel)_55%,transparent)]'
										: 'border-line bg-[color-mix(in_srgb,var(--color-panel)_55%,transparent)]'
							)}
						>
							<header className="flex items-baseline justify-between gap-2 shrink-0 min-h-[1.35rem]">
								<p className="m-0 text-[0.7rem] tracking-[0.06em] uppercase font-bold text-accent-fg leading-snug">
									{group.date ? planDayKicker(group.date) : group.day}
									{group.date && !group.isToday ? (
										<span className="text-muted font-semibold normal-case tracking-normal text-[0.78rem]">
											{' · '}
											{planDaySubline(group.date)}
										</span>
									) : null}
								</p>
								{sessionCount > 1 ? (
									<span className={cn('text-muted', 'text-[0.78rem] shrink-0')}>
										{sessionCount} sessions
									</span>
								) : null}
							</header>
							<div className="flex flex-col flex-1 gap-2.5 min-h-0">
								{group.sessions.map((session, i) => (
									<PlannedSessionRow
										key={`${session.day}-${session.label}-${i}`}
										session={session}
										week={view.week.week}
										routes={routes}
										divided={i > 0}
										layout="compact"
									/>
								))}
								{group.unplanned.map((item, i) => (
									<UnplannedRow
										key={item.slug}
										item={item}
										divided={group.sessions.length > 0 || i > 0}
									/>
								))}
							</div>
						</article>
					);
				})}
			</div>
		</section>
	);
}
