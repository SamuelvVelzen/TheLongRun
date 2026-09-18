import { cn, ui } from '$lib/ui';
import type { HTMLAttributes } from 'react';

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
	return <div className={cn(ui.panel, className)} {...props} />;
}
