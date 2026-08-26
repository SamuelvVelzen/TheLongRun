import { activityLabel } from '$lib/activity';
import { weekDayGroups, type WeekView } from '$lib/plan';
import { cn, ui } from '$lib/ui';
import { Link } from '@tanstack/react-router';

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
	isNext,
	isToday
}: {
	done: boolean;
	skipped: boolean;
	isNext: boolean;
	isToday: boolean;
}) {
	if (done) {
		return (
			<span className={cn(ui.statusPill, 'text-ok border border-[rgba(125,255,168,0.35)] bg-ok/10')}>
				Completed
			</span>
		);
	}
	if (skipped) {
		return (
			<span className={cn(ui.statusPill, 'text-muted border border-line bg-black/20')}>Skipped</span>
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
				Today
			</span>
		);
	}
	return null;
}

export function WeekPlanBoard({ view }: { view: WeekView }) {
	const days = weekDayGroups(view);

	return (
		<section className="mb-5" aria-labelledby="week-plan-heading">
			<div className="mb-3 [&_h2]:text-[1.2rem] [&_h2]:font-bold [&_h2]:m-0 [&_p]:mt-1 [&_p]:mb-0 [&_p]:text-[0.92rem]">
				<h2 id="week-plan-heading">This week</h2>
				<p className={ui.muted}>
					Week {view.week.week} · {view.week.phase}
					{view.week.focus ? ` · ${view.week.focus}` : ''}
				</p>
			</div>
			<div className="grid grid-cols-1 gap-3 min-[720px]:grid-cols-2">
				{days.map((group) => {
					const nextHere = group.sessions.some((s) => s.isNext);
					return (
						<article
							key={group.day}
							className={cn(
								'flex flex-col gap-3 min-w-0 p-[0.85rem_0.95rem] rounded-[14px] border',
								nextHere
									? 'border-[color-mix(in_srgb,var(--color-accent)_40%,var(--color-line))] bg-[color-mix(in_srgb,var(--color-accent)_10%,var(--color-panel))]'
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
								{group.sessions.length > 1 && (
									<span className={cn(ui.muted, 'text-[0.78rem]')}>
										{group.sessions.length} sessions
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
											session.skipped && 'opacity-55'
										)}
									>
										<div className="flex items-center justify-between gap-2 min-w-0">
											<span className="text-[0.78rem] font-semibold text-muted min-w-0 [overflow-wrap:anywhere]">
												{activityLabel(session.activity_type ?? 'run')}
												{session.distance_km != null ? ` · ${session.distance_km} km` : ''}
											</span>
											<StatusBadge
												done={session.done}
												skipped={session.skipped}
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
										{session.route && (
											<Link
												className="block pt-1 text-[0.8rem] font-[650] text-accent overflow-hidden text-ellipsis whitespace-nowrap hover:underline"
												to="/routes/$slug"
												params={{ slug: session.route.slug }}
												title={session.route.name}
											>
												{session.route.name}
											</Link>
										)}
									</div>
								))}
							</div>
						</article>
					);
				})}
			</div>
		</section>
	);
}
