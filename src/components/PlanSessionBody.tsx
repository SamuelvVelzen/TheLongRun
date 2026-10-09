import { workoutLines, workoutSummary } from '$lib/run-workout';
import type { PlanSession } from '$lib/types';
import { cn } from '$lib/ui';
import { useState, type MouseEvent } from 'react';

/**
 * Plan session text: runs with a `workout` show a generated one-line summary and keep the
 * step list + `detail` behind a closed toggle. Everything else shows `detail` as before.
 */
export function PlanSessionBody({
	session,
	className
}: {
	session: Pick<PlanSession, 'detail' | 'workout'>;
	className?: string;
}) {
	const [open, setOpen] = useState(false);
	const { workout } = session;
	if (!workout) {
		return <p className={cn('m-0', className)}>{session.detail}</p>;
	}

	// The card can be wrapped in a <Link>; toggle by hand so a tap never navigates.
	const toggle = (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setOpen((v) => !v);
	};

	return (
		<div className={cn('flex flex-col gap-1 min-w-0', className)}>
			<p className="m-0 font-semibold [overflow-wrap:anywhere]">{workoutSummary(workout)}</p>
			<details open={open} className="min-w-0">
				<summary
					onClick={toggle}
					className="list-none cursor-pointer inline-flex items-center gap-1 text-[0.8rem] font-semibold text-muted hover:text-fg [&::-webkit-details-marker]:hidden"
				>
					<span
						aria-hidden
						className={cn('inline-block transition-transform', open && 'rotate-90')}
					>
						›
					</span>
					{open ? 'Hide details' : 'Details'}
				</summary>
				<ul className="m-0 mt-1 p-0 list-none flex flex-col gap-0.5 text-[0.86rem]">
					{workoutLines(workout).map((line, i) => (
						<li
							key={i}
							className={cn(
								'[overflow-wrap:anywhere]',
								line.depth ? 'pl-4 text-fg/80' : 'font-medium'
							)}
						>
							{line.text}
						</li>
					))}
				</ul>
				{session.detail.trim() ? (
					<p className="m-0 mt-1.5 text-fg/80 [overflow-wrap:anywhere]">{session.detail}</p>
				) : null}
			</details>
		</div>
	);
}
