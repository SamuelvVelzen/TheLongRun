import { cn } from '$lib/ui';
import type { HTMLAttributes, ReactNode } from 'react';
import { ui } from './tokens';

export function PanelTitle({
	children,
	className,
	...props
}: { children: ReactNode } & HTMLAttributes<HTMLHeadingElement>) {
	return (
		<h3 className={cn(ui.formSectionTitle, className)} {...props}>
			{children}
		</h3>
	);
}
