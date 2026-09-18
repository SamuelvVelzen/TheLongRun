import { cn } from '$lib/ui';
import type { HTMLAttributes } from 'react';
import { ui } from './tokens';

export function actionsClass(...parts: Array<string | boolean | false | null | undefined>) {
	return cn(
		ui.actions,
		parts.some((p) => p === true) && ui.stickyActions,
		...parts.filter((p): p is string => typeof p === 'string')
	);
}

export function Actions({
	sticky,
	className,
	...props
}: { sticky?: boolean } & HTMLAttributes<HTMLDivElement>) {
	return <div className={actionsClass(sticky && ui.stickyActions, className)} {...props} />;
}
