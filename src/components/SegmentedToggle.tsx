import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';

type SearchFn = (prev: Record<string, unknown>) => Record<string, unknown>;

export type SegmentedOption<T extends string = string> = {
	value: T;
	label: ReactNode;
	/** When set, this option is a TanStack `Link` (URL search), not a button. */
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
	return (
		<div
			className={['seg-toggle', className].filter(Boolean).join(' ')}
			role={ariaLabel ? 'group' : undefined}
			aria-label={ariaLabel}
		>
			{options.map((opt) => {
				const selected = opt.value === value;
				const itemClass = `seg-toggle-item${selected ? ' active' : ''}`;
				if (opt.to != null) {
					return (
						<Link
							key={opt.value}
							to={opt.to}
							search={opt.search}
							className={itemClass}
							aria-current={selected ? 'true' : undefined}
							activeOptions={{ exact: true, includeSearch: true }}
						>
							{opt.label}
						</Link>
					);
				}
				return (
					<button
						key={opt.value}
						type="button"
						className={itemClass}
						aria-pressed={selected}
						onClick={() => onChange?.(opt.value)}
					>
						{opt.label}
					</button>
				);
			})}
		</div>
	);
}
