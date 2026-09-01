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

const presets: { kind: RangeKind; label: string }[] = [
	{ kind: 'all', label: 'All time' },
	{ kind: '30d', label: '30 days' },
	{ kind: '7d', label: '7 days' }
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
				className="max-[720px]:overflow-x-auto [&_button]:max-[720px]:shrink-0 [&_button]:max-[720px]:px-3 [&_button]:max-[720px]:py-[0.55rem]"
				value={range.kind === 'custom' || customOpen ? 'custom' : range.kind}
				onChange={(kind) => {
					if (kind === 'custom') openCustom();
				}}
				options={[
					...presets.map((preset) => ({
						value: preset.kind,
						label: preset.label,
						to,
						search: (prev: Record<string, unknown>) => ({
							...prev,
							...rangeToSearch(preset.kind)
						})
					})),
					{ value: 'custom' as const, label: (
						<>
							<Icon name="calendar" size={14} />
							Custom
						</>
					) }
				]}
			/>

			{(customOpen || range.kind === 'custom') && (
				<form className="flex flex-wrap items-end gap-3 basis-full max-[720px]:grid max-[720px]:grid-cols-2" onSubmit={applyCustom}>
					<label className={cn(ui.field, 'flex-1 basis-36 min-w-0 max-[720px]:flex-none')}>
						<span>From</span>
						<input
							type="date"
							name="from"
							className="min-h-11"
							value={customFrom}
							onChange={(e) => setCustomFrom(e.target.value)}
						/>
					</label>
					<label className={cn(ui.field, 'flex-1 basis-36 min-w-0 max-[720px]:flex-none')}>
						<span>To</span>
						<input
							type="date"
							name="to"
							className="min-h-11"
							value={customTo}
							onChange={(e) => setCustomTo(e.target.value)}
						/>
					</label>
					<button className={cn(ui.btnPrimary, 'shrink-0 min-h-11 max-[720px]:col-span-full max-[720px]:w-full')} type="submit">
						Apply
					</button>
				</form>
			)}
		</div>
	);
}
