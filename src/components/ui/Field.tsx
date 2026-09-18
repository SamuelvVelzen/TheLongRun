import { cn } from '$lib/ui';
import type { ReactNode } from 'react';
import { ui } from './tokens';

export const fieldClass = ui.field;
export const fieldHintClass = ui.fieldHint;
export const reqClass = ui.req;

export function Field({
	label,
	required,
	hint,
	error,
	as = 'label',
	className,
	children
}: {
	label?: ReactNode;
	required?: boolean;
	hint?: ReactNode;
	error?: ReactNode;
	as?: 'label' | 'div';
	className?: string;
	children: ReactNode;
}) {
	const Tag = as;
	return (
		<Tag className={cn(ui.field, className)}>
			{label != null ? <span className={required ? ui.req : undefined}>{label}</span> : null}
			{children}
			{hint != null ? <span className={cn(ui.fieldHint, ui.muted)}>{hint}</span> : null}
			{error != null ? <span className={cn(ui.fieldHint, 'text-warn')}>{error}</span> : null}
		</Tag>
	);
}
