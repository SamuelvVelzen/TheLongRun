import type { DateRange, RangeKind } from '$lib/date-range';
import { cn } from '$lib/ui';
import { useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { Icon } from './Icon';
import { Field } from './ui/Field';
import { Input } from './ui/Input';
import { SegmentedToggle, useAppForm } from './ui';
import { ui } from './ui/tokens';
import { useDeferFilterUntilDone, useFilterSheetCommit } from './ui/filter-sheet-commit';

export type RangeSearch = { range?: RangeKind; from?: string; to?: string };

/**
 * Always returns all range keys (undefined clears them) so it can be merged over prior search.
 * The page's default range is the bare URL; any other preset is written out.
 */
export function rangeToSearch(
	kind: RangeKind,
	from?: string,
	to?: string,
	defaultKind: RangeKind = 'all'
): RangeSearch {
	if (kind === 'custom') {
		return { range: 'custom', from: from || undefined, to: to || undefined };
	}
	if (kind === defaultKind) return { range: undefined, from: undefined, to: undefined };
	return { range: kind, from: undefined, to: undefined };
}

const presets: { kind: RangeKind; label: string; shortLabel: string }[] = [
	{ kind: 'all', label: 'All time', shortLabel: 'All' },
	{ kind: '30d', label: '30 days', shortLabel: '30d' },
	{ kind: '7d', label: '7 days', shortLabel: '7d' }
];

const customDateFieldClass = cn(
	'min-w-0 max-sm:flex-none sm:[&_span]:text-[0.78rem]',
	ui.filterControlInput
);

export function DateRangeFilter({
	range,
	to: routeTo,
	defaultKind = 'all'
}: {
	range: DateRange;
	to: string;
	defaultKind?: RangeKind;
}) {
	const navigate = useNavigate();
	const deferCustom = useDeferFilterUntilDone();
	const [customOpen, setCustomOpen] = useState(false);
	const form = useAppForm({
		defaultValues: { from: '', to: '' },
		validators: {
			onSubmit: z.object({
				from: z.string(),
				to: z.string()
			})
		},
		onSubmit: () => {}
	});

	const applyCustom = useCallback(
		(from: string, toDate: string) => {
			if (range.kind === 'custom' && range.from === from && range.to === toDate) return;
			navigate({
				to: routeTo,
				replace: true,
				resetScroll: false,
				search: (prev) => ({
					...prev,
					...rangeToSearch('custom', from, toDate)
				})
			});
		},
		[navigate, range.from, range.kind, range.to, routeTo]
	);

	const commitCustomDraft = useCallback(() => {
		const { from, to: toDate } = form.state.values;
		if (!from && !toDate) return;
		applyCustom(from, toDate);
	}, [applyCustom, form]);

	const customEditing = customOpen || range.kind === 'custom';
	useFilterSheetCommit(commitCustomDraft, deferCustom && customEditing);

	useEffect(() => {
		if (range.kind === 'custom') {
			form.reset({ from: range.from ?? '', to: range.to ?? '' });
			setCustomOpen(true);
		} else {
			setCustomOpen(false);
		}
	}, [range.kind, range.from, range.to, form]);

	function openCustom() {
		setCustomOpen(true);
		if (range.kind !== 'custom') {
			form.reset({ from: range.from ?? '', to: range.to ?? '' });
		}
	}

	function onDateChange(field: 'from' | 'to', value: string) {
		form.setFieldValue(field, value);
		if (deferCustom) return;
		const from = field === 'from' ? value : form.state.values.from;
		const toDate = field === 'to' ? value : form.state.values.to;
		if (from || toDate) applyCustom(from, toDate);
	}

	return (
		<div
			className={cn('contents', customEditing && 'max-sm:flex max-sm:flex-col max-sm:gap-3 sm:contents')}
			role="group"
			aria-label="Date range"
		>
			<SegmentedToggle
				fill
				className="max-sm:w-full sm:[&_button]:min-h-9 sm:[&_button]:px-2.5 sm:[&_button]:text-[0.82rem] sm:[&_button]:gap-1 sm:w-fit sm:max-w-none"
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
						to: routeTo,
						search: (prev: Record<string, unknown>) => ({
							...prev,
							...rangeToSearch(preset.kind, undefined, undefined, defaultKind)
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

			{customEditing ? (
				<div
					className={cn(
						'flex items-end gap-2 shrink-0',
						'max-sm:grid max-sm:grid-cols-2 max-sm:gap-3',
						'sm:flex-nowrap'
					)}
				>
					<form.Field name="from">
						{(field) => (
							<Field label="From" className={customDateFieldClass}>
								<Input
									type="date"
									value={field.state.value ?? ''}
									onChange={(e) => onDateChange('from', e.target.value)}
									onBlur={field.handleBlur}
								/>
							</Field>
						)}
					</form.Field>
					<form.Field name="to">
						{(field) => (
							<Field label="To" className={customDateFieldClass}>
								<Input
									type="date"
									value={field.state.value ?? ''}
									onChange={(e) => onDateChange('to', e.target.value)}
									onBlur={field.handleBlur}
								/>
							</Field>
						)}
					</form.Field>
				</div>
			) : null}
		</div>
	);
}
