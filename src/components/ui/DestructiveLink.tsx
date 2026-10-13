import { cn } from '$lib/ui';
import type { AnchorHTMLAttributes, MouseEventHandler, ReactNode } from 'react';
const destructiveLink =
	'inline-flex items-center justify-center gap-1.5 min-h-11 px-3 py-2 rounded-full text-warn font-semibold no-underline transition-colors duration-150 hover:bg-warn/10 hover:text-warn active:bg-warn/10 focus-visible:outline-2 focus-visible:outline-warn focus-visible:outline-offset-2';

export function DestructiveLink({
	className,
	children,
	...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { children?: ReactNode }) {
	return (
		<a className={cn(destructiveLink, className)} {...props}>
			{children}
		</a>
	);
}

/** Nav-style destructive row (e.g. sign out in more menu). */
export function destructiveNavLinkClass(...parts: Array<string | false | null | undefined>) {
	return cn(
		'flex items-center gap-[0.65rem] min-h-11 px-[0.9rem] py-[0.55rem] rounded-xl text-warn font-semibold no-underline transition-colors duration-150 hover:bg-warn/10 active:bg-warn/10',
		...parts
	);
}
