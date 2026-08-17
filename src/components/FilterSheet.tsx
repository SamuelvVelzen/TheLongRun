import { useEffect, useId, useState, type ReactNode } from 'react';
import { activityLabel } from '$lib/activity';
import type { DateRange } from '$lib/date-range';

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
		<div className="filter-bar">
			<button
				type="button"
				className="filter-sheet-trigger"
				aria-haspopup="dialog"
				aria-expanded={open}
				aria-controls={panelId}
				onClick={() => setOpen(true)}
			>
				<span className="filter-sheet-trigger-label">Filters</span>
				<span className="filter-sheet-trigger-summary">{summary}</span>
			</button>
			<div className={`filter-sheet${open ? ' is-open' : ''}`}>
				<div
					className="filter-sheet-backdrop"
					onClick={() => setOpen(false)}
					aria-hidden="true"
				/>
				<div
					id={panelId}
					className="filter-sheet-panel"
					role={open ? 'dialog' : undefined}
					aria-modal={open ? true : undefined}
					aria-labelledby={open ? titleId : undefined}
				>
					<div className="filter-sheet-handle" aria-hidden="true" />
					<div className="filter-sheet-head">
						<strong id={titleId}>Filters</strong>
						<button type="button" className="btn btn-ghost filter-sheet-done" onClick={() => setOpen(false)}>
							Done
						</button>
					</div>
					{children}
				</div>
			</div>
		</div>
	);
}
