import { cn } from '$lib/ui';
import type { HTMLAttributes } from 'react';
import { ui } from './tokens';

export function panelClass(...parts: Array<string | false | null | undefined>) {
	return cn(ui.panel, ...parts);
}

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
	return <div className={panelClass(className)} {...props} />;
}
