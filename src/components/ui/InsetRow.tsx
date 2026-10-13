import { cn } from '$lib/ui';
import type { HTMLAttributes } from 'react';
export function InsetRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn(
				'flex items-center gap-[0.6rem] p-[0.5rem_0.7rem] border border-line rounded-inset bg-inset text-[0.9rem]',
				className
			)}
			{...props}
		/>
	);
}
