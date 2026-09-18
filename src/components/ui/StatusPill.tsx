import { cn, ui } from '$lib/ui';
import type { HTMLAttributes } from 'react';

export function StatusPill({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
	return <span className={cn(ui.statusPill, className)} {...props} />;
}
