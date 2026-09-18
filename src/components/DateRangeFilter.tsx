import type { DateRange, RangeKind } from '$lib/date-range';
import { cn } from '$lib/ui';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { Icon } from './Icon';
import { SegmentedToggle } from './SegmentedToggle';
import { Button, useAppForm } from './ui';

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
	const [customOpen, setCustomOpen] = useState(false);
	const form = useAppForm({
		defaultValues: { from: '', to: '' },
		validators: {
			onSubmit: z.object({
				from: z.string(),
				to: z.string()
			})
		},
		onSubmit: ({ value }) => {
			navigate({
				to,
				replace: true,
				resetScroll: false,
				search: (prev: Record<string, unknown>) => ({
					...prev,
					...rangeToSearch('custom', value.from, value.to)
				})
			});
		}
	});

	useEffect(() => {
		if (range.kind === 'custom') {
			form.reset({ from: range.from ?? '', to: range.to ?? '' });
			setCustomOpen(true);
		} else {
			setCustomOpen(false);
		}
	}, [range.kind, range.from, range.to]);

	function openCustom() {
		setCustomOpen(true);
		if (range.kind !== 'custom') {
			form.reset({ from: range.from ?? '', to: range.to ?? '' });
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
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						void form.handleSubmit();
					}}
				>
					<form.AppField
						name="from"
						children={(field) => (
							<field.TextField
								label="From"
								type="date"
								className="min-w-0 max-sm:flex-none sm:[&_span]:text-[0.78rem] [&_input]:min-h-11 sm:[&_input]:min-h-9 sm:[&_input]:px-2 sm:[&_input]:text-[0.82rem]"
							/>
						)}
					/>
					<form.AppField
						name="to"
						children={(field) => (
							<field.TextField
								label="To"
								type="date"
								className="min-w-0 max-sm:flex-none sm:[&_span]:text-[0.78rem] [&_input]:min-h-11 sm:[&_input]:min-h-9 sm:[&_input]:px-2 sm:[&_input]:text-[0.82rem]"
							/>
						)}
					/>
					<Button
						type="submit"
						variant="primary"
						className="shrink-0 min-h-11 max-sm:col-span-full max-sm:w-full sm:min-h-9 sm:px-3 sm:text-[0.82rem]"
					>
						Apply
					</Button>
				</form>
			)}
		</div>
	);
}
