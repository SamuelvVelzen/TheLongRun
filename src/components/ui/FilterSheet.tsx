import type { DateRange } from '$lib/date-range';
import { useBottomSheetSwipe } from '$lib/bottom-sheet-swipe';
import { OverlayPortal, useOverlayLock } from '$lib/overlay';
import { stickyChrome, stickySectionBar } from '$lib/shell-layout';
import { cn } from '$lib/ui';
import { ui } from './tokens';
import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { Icon } from '../Icon';
import { sportSummaryLabel } from '../SportFilter';

/** Compact trigger text, e.g. "Run · 30 days" or "All · All time · NL". */
export function filterSummary(
	sport: string,
	range: DateRange,
	location?: { country?: string; province?: string; place?: string }
): string {
	const sportPart = sportSummaryLabel(sport);
	const rangePart =
		range.kind === '7d'
			? '7 days'
			: range.kind === '30d'
				? '30 days'
				: range.kind === 'all'
					? 'All time'
					: range.label;
	const parts = [sportPart, rangePart];
	if (location?.country && location.country !== 'all') parts.push(location.country);
	if (location?.province && location.province !== 'all') parts.push(location.province);
	if (location?.place && location.place !== 'all') parts.push(location.place);
	return parts.join(' · ');
}

/**
 * Desktop: children sit inline in the filter bar.
 * Mobile: a summary chip opens a bottom sheet portaled to document.body.
 * The bordered filter chip sticks under the app header. `actions` sit on the right.
 */
export function FilterSheet({
	summary,
	children,
	actions
}: {
	summary: string;
	children: ReactNode;
	actions?: ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const panelId = useId();
	const titleId = useId();
	const close = useCallback(() => setOpen(false), []);
	useOverlayLock(open);
	const { panelRef, panelStyle, backdropStyle, dragHandleProps } = useBottomSheetSwipe(close, open);

	useEffect(() => {
		if (!open) return;
		const mq = window.matchMedia('(max-width: 640px)');
		const onChange = () => {
			if (!mq.matches) setOpen(false);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setOpen(false);
		};
		mq.addEventListener('change', onChange);
		window.addEventListener('keydown', onKey);
		return () => {
			mq.removeEventListener('change', onChange);
			window.removeEventListener('keydown', onKey);
		};
	}, [open]);

	return (
		<div
			className={cn(
				stickySectionBar,
				stickyChrome,
				'flex items-center gap-3',
				'max-sm:items-start max-sm:mb-3',
				'sm:mb-4'
			)}
		>
			<div
				className={cn(
					'flex min-w-0 flex-1 items-center',
					'max-sm:flex-wrap max-sm:gap-x-6 max-sm:gap-y-[0.55rem]',
					'sm:flex-nowrap sm:gap-x-3 sm:overflow-x-auto sm:[scrollbar-width:none] sm:[&::-webkit-scrollbar]:hidden'
				)}
			>
				<button
					type="button"
					className="hidden w-full box-border justify-between max-sm:flex items-center gap-[0.55rem] max-w-full min-h-11 px-[0.95rem] py-[0.45rem] border border-line rounded-full bg-canvas/85 text-fg cursor-pointer aria-[expanded=true]:border-accent"
					aria-haspopup="dialog"
					aria-expanded={open}
					aria-controls={panelId}
					onClick={() => setOpen(true)}
				>
					<span className="inline-flex items-center gap-1.5 font-semibold shrink-0">
						<Icon name="filter" size={16} />
						Filters
					</span>
					<span className="text-muted overflow-hidden text-ellipsis whitespace-nowrap min-w-0">
						{summary}
					</span>
				</button>
				{open ? (
					<OverlayPortal>
						<div className={ui.dialogRoot}>
							<div
								className={ui.dialogBackdrop}
								style={backdropStyle}
								onClick={close}
								aria-hidden="true"
							/>
							<div
								ref={panelRef}
								id={panelId}
								className={cn(ui.dialogPanel, 'sm:max-w-none')}
								style={panelStyle}
								role="dialog"
								aria-modal="true"
								aria-labelledby={titleId}
							>
								<div
									className="flex flex-col items-center -mx-[1.2rem] px-[1.2rem] pt-1 pb-2 touch-none cursor-grab active:cursor-grabbing sm:hidden"
									{...dragHandleProps}
								>
									<div
										className="w-9 h-[0.28rem] rounded-full bg-line shrink-0"
										aria-hidden="true"
									/>
								</div>
								<div className="flex items-center justify-between gap-3">
									<strong
										id={titleId}
										className="inline-flex items-center gap-2 font-display text-[1.15rem] tracking-[-0.03em]"
									>
										<Icon name="filter" size={18} />
										Filters
									</strong>
									<button
										type="button"
										className={cn(ui.btnGhost, 'min-h-11 px-[0.95rem] py-[0.45rem]')}
										onClick={close}
									>
										Done
									</button>
								</div>
								{children}
							</div>
						</div>
					</OverlayPortal>
				) : (
					<div className="contents max-sm:hidden">{children}</div>
				)}
			</div>
			{actions ? <div className="shrink-0">{actions}</div> : null}
		</div>
	);
}
