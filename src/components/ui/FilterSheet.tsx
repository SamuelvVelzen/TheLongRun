import type { DateRange } from '$lib/date-range';
import { useBottomSheetSwipe } from '$lib/bottom-sheet-swipe';
import { OverlayPortal, useOverlayLock } from '$lib/overlay';
import { stickyChrome, stickySectionBar } from '$lib/shell-layout';
import { cn } from '$lib/ui';
import { ui } from './tokens';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../Icon';
import { feelSummaryLabel } from '$lib/feel';
import type { GearFilterOption } from '$lib/gear-filter';
import { gearSummaryLabel } from '$lib/gear-filter';
import {
	gearFilterApplies,
	mapFilterApplies,
	sessionFilterApplies
} from '$lib/activity-filter-scope';
import { mapSummaryLabel } from '../MapFilter';
import { sessionSummaryLabel } from '../SessionFilter';
import { sportSummaryLabel } from '../SportFilter';
import {
	FilterSheetCommitProvider,
	useFilterSheetCommitActions
} from './filter-sheet-commit';

function FilterSheetDoneButton({ onClose }: { onClose: () => void }) {
	const commit = useFilterSheetCommitActions();
	return (
		<button
			type="button"
			className={cn(ui.btnGhost, 'min-h-11 px-[0.95rem] py-[0.45rem]')}
			onClick={() => {
				commit?.runCommits();
				onClose();
			}}
		>
			Done
		</button>
	);
}

/** Compact trigger text, e.g. "Run · 30 days" or "All · All time · NL". */
export function filterSummary(
	sport: string,
	range: DateRange,
	location?: { country?: string; province?: string; place?: string },
	extra?: {
		session?: string;
		map?: string;
		feel?: string;
		gear?: string;
		gearOptions?: GearFilterOption[];
	}
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
	if (extra?.session && extra.session !== 'all' && sessionFilterApplies(sport)) {
		parts.push(sessionSummaryLabel(extra.session));
	}
	if (extra?.map && extra.map !== 'all' && mapFilterApplies(sport)) {
		parts.push(mapSummaryLabel(extra.map));
	}
	if (extra?.feel && extra.feel !== 'all') parts.push(feelSummaryLabel(extra.feel));
	if (
		extra?.gear &&
		extra.gear !== 'all' &&
		gearFilterApplies(sport)
	) {
		if (extra.gear === 'none') {
			parts.push('No gear');
		} else if (extra.gearOptions?.length) {
			parts.push(gearSummaryLabel(extra.gear, extra.gearOptions));
		}
	}
	if (location?.country && location.country !== 'all') parts.push(location.country);
	if (location?.province && location.province !== 'all') parts.push(location.province);
	if (location?.place && location.place !== 'all') parts.push(location.place);
	return parts.join(' · ');
}

/**
 * Desktop: single horizontal scroll row (vertical wheel scrolls sideways when overflowed).
 * Mobile: summary chip opens a bottom sheet.
 * The bordered filter chip sticks under the app header. `actions` sit on the right.
 */
export function FilterSheet({
	summary,
	children,
	actions,
	filtersActive = false,
	onClearFilters
}: {
	summary: string;
	children: ReactNode;
	actions?: ReactNode;
	filtersActive?: boolean;
	onClearFilters?: () => void;
}) {
	const [open, setOpen] = useState(false);
	const panelId = useId();
	const titleId = useId();
	const close = useCallback(() => setOpen(false), []);
	const desktopScrollRef = useRef<HTMLDivElement>(null);
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

	useEffect(() => {
		const el = desktopScrollRef.current;
		if (!el) return;
		const mq = window.matchMedia('(min-width: 640px)');
		const onWheel = (e: WheelEvent) => {
			if (!mq.matches) return;
			if (el.scrollWidth <= el.clientWidth) return;
			if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
			el.scrollLeft += e.deltaY;
			e.preventDefault();
		};
		el.addEventListener('wheel', onWheel, { passive: false });
		return () => el.removeEventListener('wheel', onWheel);
	}, []);

	return (
		<FilterSheetCommitProvider sheetOpen={open}>
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
					'max-sm:flex-wrap max-sm:gap-x-6 max-sm:gap-y-[0.55rem]'
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
									<div className="flex items-center gap-1 shrink-0">
										{filtersActive && onClearFilters ? (
											<button
												type="button"
												className={cn(ui.btnGhost, 'min-h-11 px-[0.85rem] py-[0.45rem] text-[0.88rem]')}
												onClick={() => onClearFilters()}
											>
												Clear all
											</button>
										) : null}
										<FilterSheetDoneButton onClose={close} />
									</div>
								</div>
								<div className="mt-3 flex flex-col gap-3">{children}</div>
							</div>
						</div>
					</OverlayPortal>
				) : (
					<div
						ref={desktopScrollRef}
						className="max-sm:hidden sm:min-w-0 sm:flex-1 sm:overflow-x-auto sm:overflow-y-hidden sm:overscroll-x-contain sm:pb-3 sm:[scrollbar-gutter:stable] sm:[scrollbar-width:thin]"
					>
						<div className="flex w-max flex-nowrap items-center gap-3 pr-1 pt-0.5">
							{children}
						</div>
					</div>
				)}
			</div>
			{actions ? <div className="shrink-0">{actions}</div> : null}
		</div>
		</FilterSheetCommitProvider>
	);
}
