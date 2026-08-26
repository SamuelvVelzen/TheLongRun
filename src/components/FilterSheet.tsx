import { useEffect, useId, useState, type ReactNode } from 'react';
import { activityLabel } from '$lib/activity';
import type { DateRange } from '$lib/date-range';
import { cn, ui } from '$lib/ui';

/** Compact trigger text, e.g. "Run · 30 days" or "All · All time · NL". */
export function filterSummary(
	sport: string,
	range: DateRange,
	location?: { country?: string; province?: string; place?: string }
): string {
	const sportPart = sport === 'all' ? 'All' : activityLabel(sport);
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
 * Mobile: a summary chip opens a bottom sheet above the tab bar.
 */
export function FilterSheet({ summary, children }: { summary: string; children: ReactNode }) {
	const [open, setOpen] = useState(false);
	const panelId = useId();
	const titleId = useId();

	useEffect(() => {
		if (!open) return;
		const mq = window.matchMedia('(max-width: 640px)');
		const lock = () => {
			document.body.style.overflow = mq.matches ? 'hidden' : '';
		};
		lock();
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setOpen(false);
		};
		mq.addEventListener('change', lock);
		window.addEventListener('keydown', onKey);
		return () => {
			document.body.style.overflow = '';
			mq.removeEventListener('change', lock);
			window.removeEventListener('keydown', onKey);
		};
	}, [open]);

	return (
		<div className="flex flex-wrap items-center gap-x-6 gap-y-[0.55rem] mt-4 mb-2 pt-[0.85rem] pb-[0.35rem] border-t border-line">
			<button
				type="button"
				className="hidden max-sm:inline-flex items-center gap-[0.55rem] max-w-full min-h-11 px-[0.95rem] py-[0.45rem] border border-line rounded-full bg-[rgba(16,20,15,0.85)] text-fg cursor-pointer"
				aria-haspopup="dialog"
				aria-expanded={open}
				aria-controls={panelId}
				onClick={() => setOpen(true)}
			>
				<span className="font-semibold shrink-0">Filters</span>
				<span className="text-muted overflow-hidden text-ellipsis whitespace-nowrap min-w-0">
					{summary}
				</span>
			</button>
			<div
				className={
					open
						? 'max-sm:block max-sm:fixed max-sm:inset-0 max-sm:z-[20000] max-sm:visible max-sm:pointer-events-auto sm:contents'
						: 'contents max-sm:block max-sm:fixed max-sm:inset-0 max-sm:z-[20000] max-sm:invisible max-sm:pointer-events-none'
				}
			>
				<div
					className="hidden max-sm:block absolute inset-0 bg-black/55"
					onClick={() => setOpen(false)}
					aria-hidden="true"
				/>
				<div
					id={panelId}
					className={cn(
						'contents max-sm:flex max-sm:flex-col max-sm:gap-[0.85rem] max-sm:absolute max-sm:left-0 max-sm:right-0 max-sm:bottom-0 max-sm:z-[1] max-sm:max-h-[min(88vh,100%)] max-sm:overflow-y-auto max-sm:[overscroll-behavior:contain] max-sm:px-[1.1rem] max-sm:pb-[calc(1.15rem+env(safe-area-inset-bottom,0px))] max-sm:border max-sm:border-line max-sm:border-b-0 max-sm:rounded-t-box max-sm:bg-surface max-sm:shadow-lift max-sm:transition-transform max-sm:duration-200 max-sm:ease-out',
						open ? 'max-sm:translate-y-0' : 'max-sm:translate-y-full'
					)}
					role={open ? 'dialog' : undefined}
					aria-modal={open ? true : undefined}
					aria-labelledby={open ? titleId : undefined}
				>
					<div className="hidden max-sm:block w-9 h-[0.28rem] mx-auto mt-2 mb-[0.1rem] rounded-full bg-line shrink-0" aria-hidden="true" />
					<div className="hidden max-sm:flex items-center justify-between gap-3">
						<strong id={titleId} className="font-display text-[1.15rem] tracking-[-0.03em]">
							Filters
						</strong>
						<button type="button" className={cn(ui.btnGhost, 'min-h-11 px-[0.95rem] py-[0.45rem]')} onClick={() => setOpen(false)}>
							Done
						</button>
					</div>
					{children}
				</div>
			</div>
		</div>
	);
}
