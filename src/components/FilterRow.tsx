import { cn } from '$lib/ui';
import type { ReactNode } from 'react';

const rowLabel =
	'text-[0.78rem] font-semibold text-muted inline-flex items-center gap-1.5 shrink-0 max-sm:flex sm:hidden';

const rowShell = 'max-sm:w-full sm:contents';

/** Mobile: labeled, outlined row. Desktop: inline (contents). */
export function FilterRow({
	label,
	icon,
	children,
	className
}: {
	label: string;
	icon?: ReactNode;
	children: ReactNode;
	className?: string;
}) {
	return (
		<div className={cn('max-sm:flex max-sm:flex-col max-sm:gap-1.5 max-sm:w-full sm:contents', className)}>
			<span className={rowLabel}>
				{icon}
				{label}
			</span>
			<div className={rowShell}>{children}</div>
		</div>
	);
}
