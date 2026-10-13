import { cn } from '$lib/ui';
import type { ReactNode } from 'react';
import { Panel } from './Panel';

export function EmptyState({
	children,
	action,
	className
}: {
	children: ReactNode;
	action?: ReactNode;
	className?: string;
}) {
	return (
		<Panel
			className={cn(
				'text-muted',
				action ? 'grid gap-[0.85rem] justify-items-start' : false,
				className
			)}
		>
			{typeof children === 'string' ? <p className="m-0">{children}</p> : children}
			{action}
		</Panel>
	);
}
