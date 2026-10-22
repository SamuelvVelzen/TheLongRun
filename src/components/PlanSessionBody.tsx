import { planStrengthLines, planStrengthSummary } from '$lib/plan-strength';
import { workoutLines, workoutSummary } from '$lib/run-workout';
import type { PlanSession } from '$lib/types';
import { cn } from '$lib/ui';
import { useState, type MouseEvent, type ReactNode } from 'react';
import { PlanSessionFuelKit } from './PlanSessionFuelKit';

const compactBodyText = 'text-[0.84rem] leading-snug text-fg/90';
const boardBodyText = 'text-[0.9rem] leading-[1.45] text-fg/90';

function sessionBodyText(compact: boolean) {
	return compact ? compactBodyText : boardBodyText;
}

const detailsPanelClass = (compact: boolean) =>
	cn(
		'mt-1.5 rounded-[10px] border border-line/70',
		'bg-[color-mix(in_srgb,var(--color-inset)_55%,transparent)]',
		'px-2.5 py-2 max-h-[min(16rem,42vh)] overflow-y-auto overscroll-contain',
		compact && 'max-h-[min(14rem,38vh)] px-2 py-1.5 text-[0.82rem]'
	);

/**
 * Plan session text: coach note on the card; workout steps, fuel, and kit behind Details.
 * Next up: same fuel/kit in Details; prescription stays a one-line summary only (no step list).
 */
export function PlanSessionBody({
	session,
	className,
	compact = false,
	surface = 'coach'
}: {
	session: Pick<PlanSession, 'detail' | 'workout' | 'exercises' | 'fuel' | 'kit'>;
	className?: string;
	compact?: boolean;
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
	const hasFuelKit = Boolean(session.fuel?.length || session.kit?.trim());
	const isNextUp = surface === 'nextUp';
	const showCoachDetails = Boolean(structured || hasFuelKit);

	const bodyLine = cn('m-0 [overflow-wrap:anywhere]', sessionBodyText(compact));

	const fuelKitPanel = hasFuelKit ? (
		<PlanSessionFuelKit
			fuel={session.fuel}
			kit={session.kit}
			compact={compact}
			className={
				structured && !isNextUp ? 'mb-2 pb-2 border-b border-line/60' : undefined
			}
		/>
	) : null;

	const prescriptionList =
		structured && !isNextUp ? (
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
		) : null;

	if (isNextUp) {
		if (!detailNote && !structured && !hasFuelKit) return null;
		return (
			<div className={cn('flex flex-col gap-1 min-w-0', className)}>
				{detailNote ? <p className={bodyLine}>{detailNote}</p> : null}
				{structured ? <p className={bodyLine}>{structured.summary}</p> : null}
				{hasFuelKit ? (
					<SessionDetails
						open={open}
						setOpen={setOpen}
						compact={compact}
						detailNote=""
						summary={null}
					>
						{fuelKitPanel}
					</SessionDetails>
				) : null}
			</div>
		);
	}

	if (!structured) {
		if (!detailNote && !hasFuelKit) return null;
		if (!showCoachDetails) {
			return (
				<div className={cn('flex flex-col gap-1 min-w-0', className)}>
					{detailNote ? (
						<p className={cn('m-0 [overflow-wrap:anywhere]', sessionBodyText(compact))}>{detailNote}</p>
					) : null}
				</div>
			);
		}
		return (
			<SessionDetails
				open={open}
				setOpen={setOpen}
				compact={compact}
				className={className}
				detailNote={detailNote}
				summary={null}
			>
				{fuelKitPanel}
			</SessionDetails>
		);
	}

	return (
		<SessionDetails
			open={open}
			setOpen={setOpen}
			compact={compact}
			className={className}
			detailNote={detailNote}
			summary={!open && !detailNote ? structured.summary : null}
		>
			{fuelKitPanel}
			{prescriptionList}
		</SessionDetails>
	);
}

function SessionDetails({
	open,
	setOpen,
	compact,
	className,
	detailNote,
	summary,
	children
}: {
	open: boolean;
	setOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
	compact: boolean;
	className?: string;
	detailNote: string;
	summary: string | null;
	children: ReactNode;
}) {
	const toggle = (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setOpen((v) => !v);
	};

	const bodyLine = cn('m-0 [overflow-wrap:anywhere]', sessionBodyText(compact));
	const coachGap = compact ? 'gap-1' : 'gap-0.5';

	return (
		<div className={cn('flex flex-col min-w-0', coachGap, className)}>
			{detailNote ? (
				<p className={cn(bodyLine, compact && 'line-clamp-3')}>{detailNote}</p>
			) : null}
			{summary ? <p className={bodyLine}>{summary}</p> : null}
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
				<div className={detailsPanelClass(compact)}>{children}</div>
			</details>
		</div>
	);
}
