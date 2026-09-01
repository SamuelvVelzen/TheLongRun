import { activityLabel, normalizeActivityType } from '$lib/activity';
import { weekDayGroups, type UnplannedActivity, type WeekView } from '$lib/plan';
import { cn, ui } from '$lib/ui';
import { Link } from '@tanstack/react-router';
import { ActivityIcon, Icon } from './Icon';
import { RouteChip } from './RouteChip';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function shortDate(iso: string | null): string {
	if (!iso) return '';
	const d = new Date(`${iso}T12:00:00`);
	if (Number.isNaN(d.getTime())) return iso.slice(5);
	return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

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
			<span className={cn(ui.statusPill, 'text-ok border border-[rgba(125,255,168,0.35)] bg-ok/10')}>
				<Icon name="check" size={11} />
				Completed
			</span>
		);
	}
	if (skipped) {
		return (
			<span className={cn(ui.statusPill, 'text-muted border border-line bg-black/20')}>
				<Icon name="skip" size={11} />
				Skipped
			</span>
		);
	}
	if (unlogged) {
		return (
			<span
				className={cn(
					ui.statusPill,
					'text-muted border border-dashed border-line bg-black/10'
				)}
			>
				<Icon name="circle" size={11} />
				No log
			</span>
		);
	}
	if (isNext) {
		return (
			<span
				className={cn(
					ui.statusPill,
					'text-accent-ink bg-accent border border-accent'
				)}
			>
				<Icon name={isToday ? 'sun' : 'arrow'} size={11} />
				{isToday ? 'Today' : 'Next'}
			</span>
		);
	}
	if (isToday) {
		return (
			<span
				className={cn(
					ui.statusPill,
					'text-accent border border-[rgba(200,242,90,0.4)] bg-[rgba(200,242,90,0.08)]'
				)}
			>
				<Icon name="sun" size={11} />
				Today
			</span>
		);
	}
	return null;
}

function UnplannedBadge() {
	return (
		<span
			className={cn(
				ui.statusPill,
				'text-accent border border-dashed border-[rgba(200,242,90,0.45)] bg-[rgba(200,242,90,0.06)]'
			)}
		>
			<Icon name="unplanned" size={11} />
			Unplanned
		</span>
	);
}

function UnplannedRow({
	item,
	divided
}: {
	item: UnplannedActivity;
	divided: boolean;
}) {
	return (
		<Link
			to="/runs/$slug"
			params={{ slug: item.slug }}
			className={cn(
				'flex flex-col gap-[0.2rem] min-w-0 text-inherit no-underline rounded-[10px] -mx-1 px-1 py-1 hover:bg-[rgba(200,242,90,0.06)]',
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

export function WeekPlanBoard({
	view,
	title
}: {
	view: WeekView;
	title?: string;
}) {
	const days = weekDayGroups(view);

	return (
		<section className="mb-5" aria-labelledby="week-plan-heading">
			<div className="mb-3 [&_h2]:text-[1.2rem] [&_h2]:font-bold [&_h2]:m-0 [&_p]:mt-1 [&_p]:mb-0 [&_p]:text-[0.92rem]">
				<h2 id="week-plan-heading">{title ?? `Week ${view.week.week}`}</h2>
				<p className={ui.muted}>
					{[view.week.dates, view.week.phase, view.week.focus].filter(Boolean).join(' · ')}
					{view.unplanned.length
						? ` · ${view.unplanned.length} unplanned logged`
						: ''}
				</p>
			</div>
			<div className="grid grid-cols-1 gap-3 min-[720px]:grid-cols-2">
				{days.map((group) => {
								const onlyUnplanned = group.sessions.length === 0 && group.unplanned.length > 0;
								const nextHere = group.sessions.some((s) => s.isNext);
								return (
									<article
										key={group.day}
										className={cn(
											'flex flex-col gap-3 min-w-0 p-[0.85rem_0.95rem] rounded-[14px] border',
											nextHere
												? 'border-[color-mix(in_srgb,var(--color-accent)_40%,var(--color-line))] bg-[color-mix(in_srgb,var(--color-accent)_10%,var(--color-panel))]'
												: onlyUnplanned
													? 'border-dashed border-[rgba(200,242,90,0.35)] bg-[color-mix(in_srgb,var(--color-panel)_55%,transparent)]'
													: 'border-line bg-[color-mix(in_srgb,var(--color-panel)_55%,transparent)]'
										)}
									>
							<header className="flex items-baseline justify-between gap-2">
								<div>
									<p className="m-0 text-[0.72rem] tracking-[0.08em] uppercase font-bold text-accent">
										{group.day}
									</p>
									{group.date && (
										<p className={cn(ui.muted, 'm-0 mt-[0.15rem] text-[0.82rem]')}>
											{shortDate(group.date)}
										</p>
									)}
								</div>
								{group.sessions.length + group.unplanned.length > 1 && (
									<span className={cn(ui.muted, 'text-[0.78rem]')}>
										{group.sessions.length + group.unplanned.length} sessions
									</span>
								)}
							</header>
							<div className="flex flex-col gap-3">
								{group.sessions.map((session, i) => (
									<div
										key={`${session.day}-${session.label}-${i}`}
										className={cn(
											'flex flex-col gap-[0.2rem] min-w-0',
											i > 0 && 'pt-3 border-t border-line',
											session.done && 'opacity-80',
											session.skipped && 'opacity-55',
											session.route &&
												!session.done &&
												'rounded-[10px] -mx-1 px-1 pb-1 border border-[color-mix(in_srgb,var(--color-accent)_28%,transparent)]'
										)}
									>
										<div className="flex items-center justify-between gap-2 min-w-0">
											<span className="inline-flex items-center gap-1 text-[0.78rem] font-semibold text-muted min-w-0 [overflow-wrap:anywhere]">
												<ActivityIcon type={session.activity_type ?? 'run'} size={13} />
												{activityLabel(session.activity_type ?? 'run')}
												{session.distance_km != null ? ` · ${session.distance_km} km` : ''}
											</span>
											<StatusBadge
												done={session.done}
												skipped={session.skipped}
												unlogged={session.unlogged}
												isNext={session.isNext}
												isToday={session.isToday}
											/>
										</div>
										<strong className="font-display text-[1.02rem] font-bold tracking-[-0.02em] leading-[1.25] [overflow-wrap:anywhere]">
											{session.label}
										</strong>
										<p className="m-0 text-[0.9rem] leading-[1.45] text-fg/90 [overflow-wrap:anywhere]">
											{session.detail}
										</p>
										{session.unlogged && (
											<Link
												className="inline-flex items-center gap-1 pt-1 text-[0.8rem] font-[650] text-accent hover:underline"
												to="/import"
												search={{
													mode:
														normalizeActivityType(session.activity_type) ===
														'strength'
															? 'manual'
															: 'gpx'
												}}
											>
												<Icon name="plus" size={13} />
												Log this
											</Link>
										)}
										{session.route && !session.done && (
											<RouteChip
												slug={session.route.slug}
												name={session.route.name}
												distanceKm={session.route.distance_km}
											/>
										)}
									</div>
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
