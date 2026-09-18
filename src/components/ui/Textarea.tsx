import { cn } from '$lib/ui';
import type { TextareaHTMLAttributes } from 'react';
import { ui } from './tokens';

export type TextareaVariant = 'default' | 'editor' | 'debrief';

export function Textarea({
	variant = 'default',
	className,
	...props
}: {
	variant?: TextareaVariant;
} & TextareaHTMLAttributes<HTMLTextAreaElement>) {
	return (
		<textarea
			className={cn(
				variant === 'editor' && ui.editor,
				variant === 'debrief' && ui.debriefWrite,
				className
			)}
			{...props}
		/>
	);
}
