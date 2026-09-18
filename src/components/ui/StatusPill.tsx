import { cn } from '$lib/ui';
import type { HTMLAttributes } from 'react';
import { ui } from './tokens';

export function statusPillClass(...parts: Array<string | false | null | undefined>) {
	return cn(ui.statusPill, ...parts);
}

export function StatusPill({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
	return <span className={statusPillClass(className)} {...props} />;
}
