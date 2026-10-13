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
	action,
	className,
	children
}: {
	title?: ReactNode;
	action?: ReactNode;
	className?: string;
	children: ReactNode;
}) {
	return (
		<div className={cn(ui.formSection, className)}>
			{title != null && action != null ? (
				<div className={cn(ui.formSectionTitle, 'flex items-baseline justify-between gap-2')}>
					<h3 className="m-0 text-[inherit] font-[inherit]">{title}</h3>
					<span className="font-sans text-[0.85rem] normal-case tracking-normal">{action}</span>
				</div>
			) : title != null ? (
				<h3 className={ui.formSectionTitle}>{title}</h3>
			) : null}
			{children}
		</div>
	);
}
