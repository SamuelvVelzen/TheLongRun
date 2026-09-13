import type { DateRange, RangeKind } from '$lib/date-range';
import { cn, ui } from '$lib/ui';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { SegmentedToggle } from './SegmentedToggle';

export type RangeSearch = { range?: RangeKind; from?: string; to?: string };

/** Always returns all range keys (undefined clears them) so it can be merged over prior search. */
export function rangeToSearch(kind: RangeKind, from?: string, to?: string): RangeSearch {
	if (kind === 'custom') {
		return { range: 'custom', from: from || undefined, to: to || undefined };
	}
	if (kind === 'all') return { range: undefined, from: undefined, to: undefined };
	return { range: kind, from: undefined, to: undefined };
}

const presets: { kind: RangeKind; label: string; shortLabel: string }[] = [
	{ kind: 'all', label: 'All time', shortLabel: 'All' },
	{ kind: '30d', label: '30 days', shortLabel: '30d' },
	{ kind: '7d', label: '7 days', shortLabel: '7d' }
];

export function DateRangeFilter({ range, to }: { range: DateRange; to: string }) {
	const navigate = useNavigate();
	const [customFrom, setCustomFrom] = useState('');
	const [customTo, setCustomTo] = useState('');
	const [customOpen, setCustomOpen] = useState(false);

	useEffect(() => {
		if (range.kind === 'custom') {
			setCustomFrom(range.from ?? '');
			setCustomTo(range.to ?? '');
			setCustomOpen(true);
		} else {
			setCustomOpen(false);
		}
	}, [range.kind, range.from, range.to]);

	function applyCustom(e: React.FormEvent) {
		e.preventDefault();
		navigate({
			to,
			replace: true,
			resetScroll: false,
			search: (prev: Record<string, unknown>) => ({
				...prev,
				...rangeToSearch('custom', customFrom, customTo)
			})
		});
	}

	function openCustom() {
		setCustomOpen(true);
		if (range.kind !== 'custom') {
			setCustomFrom(range.from ?? '');
			setCustomTo(range.to ?? '');
		}
	}

	return (
		<div className="contents" role="group" aria-label="Date range">
			<SegmentedToggle
				className="sm:[&_button]:min-h-9 sm:[&_button]:px-2.5 sm:[&_button]:text-[0.82rem] sm:[&_button]:gap-1"
				value={range.kind === 'custom' || customOpen ? 'custom' : range.kind}
				onChange={(kind) => {
					if (kind === 'custom') openCustom();
				}}
				options={[
					...presets.map((preset) => ({
						value: preset.kind,
						label: (
							<>
								<span className="sm:hidden">{preset.label}</span>
								<span className="hidden sm:inline">{preset.shortLabel}</span>
							</>
						),
						to,
						search: (prev: Record<string, unknown>) => ({
							...prev,
							...rangeToSearch(preset.kind)
						})
					})),
					{
						value: 'custom' as const,
						label: (
							<>
								<Icon name="calendar" size={14} />
								<span className="sm:hidden">Custom</span>
							</>
						)
					}
				]}
			/>

			{(customOpen || range.kind === 'custom') && (
				<form
					className={cn(
						'flex items-end gap-2 shrink-0',
						'max-sm:basis-full max-sm:flex-wrap max-sm:grid max-sm:grid-cols-2 max-sm:gap-3',
						'sm:flex-nowrap'
					)}
					onSubmit={applyCustom}
				>
					<label className={cn(ui.field, 'min-w-0 max-sm:flex-none sm:[&_span]:text-[0.78rem]')}>
						<span>From</span>
						<input
							type="date"
							name="from"
							className="min-h-11 sm:min-h-9 sm:px-2 sm:text-[0.82rem]"
							value={customFrom}
							onChange={(e) => setCustomFrom(e.target.value)}
						/>
					</label>
					<label className={cn(ui.field, 'min-w-0 max-sm:flex-none sm:[&_span]:text-[0.78rem]')}>
						<span>To</span>
						<input
							type="date"
							name="to"
							className="min-h-11 sm:min-h-9 sm:px-2 sm:text-[0.82rem]"
							value={customTo}
							onChange={(e) => setCustomTo(e.target.value)}
						/>
					</label>
					<button
						className={cn(
							ui.btnPrimary,
							'shrink-0 min-h-11 max-sm:col-span-full max-sm:w-full sm:min-h-9 sm:px-3 sm:text-[0.82rem]'
						)}
						type="submit"
					>
						Apply
					</button>
				</form>
			)}
		</div>
	);
}
