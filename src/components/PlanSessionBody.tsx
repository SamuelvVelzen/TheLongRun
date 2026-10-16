import { planStrengthLines, planStrengthSummary } from '$lib/plan-strength';
import { workoutLines, workoutSummary } from '$lib/run-workout';
import type { PlanSession } from '$lib/types';
import { cn } from '$lib/ui';
import { useState, type MouseEvent } from 'react';

const compactBodyText = 'text-[0.84rem] leading-snug text-fg/90';
const boardBodyText = 'text-[0.9rem] leading-[1.45] text-fg/90';

function sessionBodyText(compact: boolean) {
	return compact ? compactBodyText : boardBodyText;
}

/**
 * Plan session text: runs with a `workout` and strength with `exercises` show a generated
 * Coach: `detail` when present; prescription behind Details when structured. Next up: note + prescription only.
 * Everything else shows `detail` as before.
 */
export function PlanSessionBody({
	session,
	className,
	compact = false,
	surface = 'coach'
}: {
	session: Pick<PlanSession, 'detail' | 'workout' | 'exercises'>;
	className?: string;
	compact?: boolean;
	/** Dashboard next up: coach note + prescription only; no step list. */
	surface?: 'coach' | 'nextUp';
}) {
	const [open, setOpen] = useState(false);
	const { workout, exercises } = session;
	const structured =
		workout != null
			? { summary: workoutSummary(workout), lines: workoutLines(workout) }
			: exercises?.length
				? { summary: planStrengthSummary(exercises), lines: planStrengthLines(exercises) }
				: null;
	const detailNote = session.detail.trim();

	const bodyLine = cn('m-0 [overflow-wrap:anywhere]', sessionBodyText(compact));

	if (!structured) {
		if (!detailNote) return null;
		return (
			<p className={cn('m-0 [overflow-wrap:anywhere]', sessionBodyText(compact), className)}>
				{detailNote}
			</p>
		);
	}

	if (surface === 'nextUp') {
		return (
			<div className={cn('flex flex-col gap-1 min-w-0', className)}>
				{detailNote ? <p className={bodyLine}>{detailNote}</p> : null}
				<p className={bodyLine}>{structured.summary}</p>
			</div>
		);
	}

	// The card can be wrapped in a <Link>; toggle by hand so a tap never navigates.
	const toggle = (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setOpen((v) => !v);
	};

	const coachGap = compact ? 'gap-1' : 'gap-0.5';

	return (
		<div className={cn('flex flex-col min-w-0', coachGap, className)}>
			{detailNote ? <p className={bodyLine}>{detailNote}</p> : null}
			{!open && !detailNote ? <p className={bodyLine}>{structured.summary}</p> : null}
			<details open={open} className="min-w-0 group/details">
				<summary
					onClick={toggle}
					className="list-none cursor-pointer inline-flex items-center gap-1 text-[0.78rem] font-semibold text-muted hover:text-fg [&::-webkit-details-marker]:hidden"
				>
					<span
						aria-hidden
						className={cn(
							'inline-block text-[0.9rem] leading-none transition-transform',
							open && 'rotate-90'
						)}
					>
						›
					</span>
					{open ? 'Hide details' : 'Details'}
				</summary>
				<div
					className={cn(
						'mt-1.5 rounded-[10px] border border-line/70',
						'bg-[color-mix(in_srgb,var(--color-inset)_55%,transparent)]',
						'px-2.5 py-2 max-h-[min(12rem,38vh)] overflow-y-auto overscroll-contain',
						compact && 'max-h-[min(10rem,32vh)] px-2 py-1.5 text-[0.82rem]'
					)}
				>
					<ul className="m-0 p-0 list-none flex flex-col gap-0.5 text-[0.84rem] leading-snug">
						{structured.lines.map((line, i) => (
							<li
								key={i}
								className={cn(
									'[overflow-wrap:anywhere]',
									line.depth ? 'pl-3 text-fg/75 text-[0.8rem]' : 'font-medium text-fg/95'
								)}
							>
								{line.text}
							</li>
						))}
					</ul>
				</div>
			</details>
		</div>
	);
}
