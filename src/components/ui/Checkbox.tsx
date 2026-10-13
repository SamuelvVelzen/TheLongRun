import { cn } from '$lib/ui';
import type { ReactNode } from 'react';

/**
 * Accent-tinted checkbox with its label. `label` can be rich content (suggestion rows);
 * `hint` renders as a muted line under a plain-text label.
 */
export function Checkbox({
	checked,
	onChange,
	label,
	hint,
	disabled,
	size = 'md',
	boxPosition = 'start',
	className,
	boxClassName
}: {
	checked: boolean;
	onChange: (checked: boolean) => void;
	label: ReactNode;
	hint?: ReactNode;
	disabled?: boolean;
	size?: 'sm' | 'md';
	boxPosition?: 'start' | 'end';
	className?: string;
	boxClassName?: string;
}) {
	const box = (
		<input
			className={cn(
				'shrink-0 accent-[var(--accent,#c8f25a)]',
				size === 'sm' ? 'size-4' : 'size-5',
				boxClassName ?? (size === 'sm' ? '' : 'mt-1')
			)}
			type="checkbox"
			checked={checked}
			disabled={disabled}
			onChange={(e) => onChange(e.target.checked)}
		/>
	);
	const text =
		hint != null ? (
			<span className="flex-1 min-w-0">
				<span className="block text-fg font-semibold">{label}</span>
				<span className="block text-muted font-normal">{hint}</span>
			</span>
		) : (
			<span className="flex-1 min-w-0">{label}</span>
		);
	return (
		<label
			className={cn(
				'flex m-0 cursor-pointer select-none',
				size === 'sm' ? 'items-center gap-2.5' : 'items-start gap-3',
				disabled && 'cursor-not-allowed opacity-70',
				className
			)}
		>
			{boxPosition === 'start' ? box : null}
			{text}
			{boxPosition === 'end' ? box : null}
		</label>
	);
}
