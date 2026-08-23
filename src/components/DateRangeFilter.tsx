import type { DateRange, RangeKind } from '$lib/date-range';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
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
		<div className="range-filter" role="group" aria-label="Date range">
			<SegmentedToggle
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
					{ value: 'custom' as const, label: 'Custom' }
				]}
			/>

			{(customOpen || range.kind === 'custom') && (
				<form className="range-custom" onSubmit={applyCustom}>
					<label className="field range-date">
						<span>From</span>
						<input
							type="date"
							name="from"
							value={customFrom}
							onChange={(e) => setCustomFrom(e.target.value)}
						/>
					</label>
					<label className="field range-date">
						<span>To</span>
						<input
							type="date"
							name="to"
							value={customTo}
							onChange={(e) => setCustomTo(e.target.value)}
						/>
					</label>
					<button className="btn btn-primary range-apply" type="submit">
						Apply
					</button>
				</form>
			)}
		</div>
	);
}
