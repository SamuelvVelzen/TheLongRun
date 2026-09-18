import { cn, ui } from '$lib/ui';
import type { HTMLAttributes } from 'react';

export function Actions({
	sticky,
	className,
	...props
}: { sticky?: boolean } & HTMLAttributes<HTMLDivElement>) {
	return <div className={cn(ui.actions, sticky && ui.stickyActions, className)} {...props} />;
}
