import { cn } from '$lib/ui';
import type { FormHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { ui } from './tokens';

export const formClass = ui.form;
export const formSectionTitleClass = ui.formSectionTitle;

export function Form({ className, ...props }: FormHTMLAttributes<HTMLFormElement>) {
	return <form className={cn(ui.form, className)} {...props} />;
}

export function FormGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
	return <div className={cn(ui.formGrid, className)} {...props} />;
}

export function FormSection({
	title,
	className,
	children
}: {
	title?: ReactNode;
	className?: string;
	children: ReactNode;
}) {
	return (
		<div className={cn(ui.formSection, className)}>
			{title != null ? <h3 className={ui.formSectionTitle}>{title}</h3> : null}
			{children}
		</div>
	);
}
