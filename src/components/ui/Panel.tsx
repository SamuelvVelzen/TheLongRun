import { cn } from '$lib/ui';
import type { HTMLAttributes } from 'react';
import { ui } from './tokens';

export function panelClass(...parts: Array<string | false | null | undefined>) {
	return cn(ui.panel, ...parts);
}

export function Panel({
	form,
	className,
	...props
}: { form?: boolean } & HTMLAttributes<HTMLDivElement>) {
	return <div className={panelClass(form && ui.form, className)} {...props} />;
}
