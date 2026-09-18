import { cn, ui } from '$lib/ui';
import type { HTMLAttributes } from 'react';

export function Tag({
	accent,
	className,
	...props
}: { accent?: boolean } & HTMLAttributes<HTMLSpanElement>) {
	return <span className={cn(ui.tag, accent && ui.tagAccent, className)} {...props} />;
}
