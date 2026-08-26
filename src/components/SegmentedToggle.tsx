import { useNavigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { cn, ui } from '$lib/ui';

type SearchFn = (prev: Record<string, unknown>) => Record<string, unknown>;

export type SegmentedOption<T extends string = string> = {
	value: T;
	label: ReactNode;
	/** When set, this option updates the route search via soft navigate (not a full reload). */
	to?: string;
	search?: true | Record<string, unknown> | SearchFn;
};

export function SegmentedToggle<T extends string>({
	value,
	onChange,
	options,
	className,
	'aria-label': ariaLabel
}: {
	value: T;
	onChange?: (value: T) => void;
	options: SegmentedOption<T>[];
	className?: string;
	'aria-label'?: string;
}) {
	const navigate = useNavigate();

	return (
		<div
			className={cn(ui.segToggle, className)}
			role={ariaLabel ? 'group' : undefined}
			aria-label={ariaLabel}
		>
			{options.map((opt) => {
				const selected = opt.value === value;
				return (
					<button
						key={opt.value}
						type="button"
						className={cn(ui.segItem, selected && ui.segItemActive)}
						aria-pressed={selected}
						onClick={() => {
							if (selected) return;
							if (opt.to != null) {
								navigate({
									to: opt.to,
									search: opt.search,
									replace: true,
									resetScroll: false
								});
								return;
							}
							onChange?.(opt.value);
						}}
					>
						{opt.label}
					</button>
				);
			})}
		</div>
	);
}
