import { nextUpHighlightSessions, nextUpTodayUnplanned } from '$lib/plan-next-up';
import { useMapWrapFullscreen } from '$lib/map-fullscreen';
import { getPlanPeekData, type PlanPeekData } from '$lib/server/functions';
import { cn } from '$lib/ui';
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Icon } from './Icon';
import { PlannedSessionRow, UnplannedRow } from './WeekPlanBoard';
import { buttonClass } from './ui/Button';

const shell =
	'rounded-xl border border-line bg-surface shadow-[0_8px_28px_rgba(0,0,0,0.28)]';

type Peek = PlanPeekData;

function stopMapClick(e: MouseEvent) {
	e.stopPropagation();
}

function MapNextUpBody({ peek }: { peek: Peek }) {
	const { weekView, planRoutes } = peek;
	const highlightSessions = nextUpHighlightSessions(weekView);
	const highlightHead = highlightSessions[0];
	const todayUnplanned = nextUpTodayUnplanned(weekView, highlightHead);
	const unloggedCount = weekView.sessions.filter((s) => s.unlogged).length;
	if (highlightHead) {
		const allToday = highlightSessions.every((s) => s.isToday);
		return (
			<div className="flex flex-col gap-2 min-w-0">
				{allToday ? (
					<p className="m-0 text-[0.7rem] font-bold uppercase tracking-[0.08em] text-accent-fg">
						Today
					</p>
				) : null}
				<div className="flex flex-col min-w-0">
					{highlightSessions.map((session, i) => (
						<PlannedSessionRow
							key={`${session.day}-${session.label}-${session.planIndex}`}
							session={session}
							week={weekView.week.week}
							routes={planRoutes}
							divided={i > 0}
							layout="compact"
							surface="nextUp"
							nextUpTier="featured"
							nextUpMulti={highlightSessions.length > 1}
							coachPlanWeek={weekView.week.week}
							sessionDate={null}
						/>
					))}
					{todayUnplanned.map((item, i) => (
						<UnplannedRow
							key={item.slug}
							item={item}
							divided={highlightSessions.length > 0 || i > 0}
						/>
					))}
				</div>
			</div>
		);
	}

	const title = unloggedCount
		? unloggedCount === 1
			? 'One session needs a log'
			: `${unloggedCount} sessions need logs`
		: 'Nothing left on the plan';

	return (
		<div className="flex flex-col gap-2 min-w-0">
			<p className="m-0 text-[0.95rem] font-semibold leading-snug">{title}</p>
		</div>
	);
}

function collapsedSummary(peek: Peek): string {
	const sessions = nextUpHighlightSessions(peek.weekView);
	if (sessions.length === 1) return sessions[0].label;
	if (sessions.length > 1) return `${sessions.length} today`;
	const unlogged = peek.weekView.sessions.filter((s) => s.unlogged).length;
	if (unlogged) return unlogged === 1 ? 'Log needed' : `${unlogged} need logs`;
	return `Week ${peek.weekView.week.week}`;
}

export type MapPlanPeek = PlanPeekData;

export function MapNextUpPanel({
	peek: peekProp,
	className
}: {
	/** When omitted, loads plan peek on the client (for route pages). */
	peek?: Peek | null;
	className?: string;
}) {
	const hostRef = useRef<HTMLDivElement>(null);
	const fullscreen = useMapWrapFullscreen(hostRef);
	const [peek, setPeek] = useState<Peek | null>(peekProp ?? null);
	const [open, setOpen] = useState(false);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		if (!fullscreen) {
			setOpen(false);
			return;
		}
		if (peekProp !== undefined) {
			setPeek(peekProp);
			return;
		}
		let cancelled = false;
		getPlanPeekData()
			.then((data) => {
				if (!cancelled) setPeek(data?.weekView ? data : null);
			})
			.catch(() => {
				if (!cancelled) setFailed(true);
			});
		return () => {
			cancelled = true;
		};
	}, [fullscreen, peekProp]);

	const summary = useMemo(() => (peek ? collapsedSummary(peek) : null), [peek]);

	const show = fullscreen && !failed && Boolean(peek?.weekView);

	return (
		<>
			<div ref={hostRef} className="hidden" aria-hidden />
			{show ? (
				<div
					data-map-next-up
					className={cn(
						'absolute z-[3] right-[0.85rem] bottom-[0.85rem] max-w-[min(calc(100%-5.75rem),22rem)] pointer-events-auto',
						className
					)}
					onClick={stopMapClick}
					onPointerDown={stopMapClick}
				>
					{open ? (
						<div
							className={cn(
								shell,
								'p-2.5 max-h-[min(42vh,20rem)] overflow-y-auto overscroll-contain'
							)}
						>
							<div className="flex items-start justify-between gap-2 mb-2">
								<p className="m-0 text-[0.72rem] font-bold uppercase tracking-[0.08em] text-accent-fg">
									Next up
								</p>
								<button
									type="button"
									className={buttonClass({
										variant: 'ghost',
										size: 'sm',
										className: 'min-h-8 min-w-8 px-0 shrink-0'
									})}
									aria-label="Close plan panel"
									onClick={() => setOpen(false)}
								>
									<Icon name="close" size={16} />
								</button>
							</div>
							<MapNextUpBody peek={peek!} />
						</div>
					) : (
						<button
							type="button"
							className={cn(
								shell,
								'flex items-center gap-2 px-3 py-2 min-h-11 text-left w-full max-w-full',
								'hover:border-accent/40 transition-colors'
							)}
							aria-expanded={false}
							onClick={() => setOpen(true)}
						>
							<Icon name="coach" size={16} className="shrink-0 text-accent-fg" />
							<span className="min-w-0 flex flex-col gap-0.5">
								<span className="text-[0.65rem] font-bold uppercase tracking-[0.08em] text-accent-fg">
									Next up
								</span>
								<span className="text-[0.86rem] font-semibold leading-tight truncate">
									{summary}
								</span>
							</span>
							<Icon name="arrowUp" size={14} className="shrink-0 text-muted ml-auto" />
						</button>
					)}
				</div>
			) : null}
		</>
	);
}
