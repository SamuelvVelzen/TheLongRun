import { cn } from '$lib/ui';
import type { HTMLAttributes } from 'react';
import { ui } from './tokens';

export function tagClass(...parts: Array<string | boolean | false | null | undefined>) {
	return cn(
		ui.tag,
		parts.some((p) => p === true) && ui.tagAccent,
		...parts.filter((p): p is string => typeof p === 'string')
	);
}

export function Tag({
	accent,
	className,
	...props
}: { accent?: boolean } & HTMLAttributes<HTMLSpanElement>) {
	return <span className={tagClass(accent && ui.tagAccent, className)} {...props} />;
}
