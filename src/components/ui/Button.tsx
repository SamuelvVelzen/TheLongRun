import { cn } from '$lib/ui';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { ui } from './tokens';

export type ButtonVariant = 'primary' | 'ghost' | 'danger';
export type ButtonSize = 'default' | 'sm' | 'icon';

export function buttonClass({
	variant = 'primary',
	size = 'default',
	stickyPrimary,
	className
}: {
	variant?: ButtonVariant;
	size?: ButtonSize;
	stickyPrimary?: boolean;
	className?: string;
} = {}) {
	return cn(
		variant === 'primary' && ui.btnPrimary,
		variant === 'ghost' && ui.btnGhost,
		variant === 'danger' && cn(ui.btnGhost, ui.btnDanger),
		size === 'sm' && ui.btnSm,
		size === 'icon' && ui.btnIcon,
		stickyPrimary && ui.stickyPrimary,
		className
	);
}

export function Button({
	variant = 'primary',
	size = 'default',
	stickyPrimary,
	className,
	type = 'button',
	children,
	...props
}: {
	variant?: ButtonVariant;
	size?: ButtonSize;
	stickyPrimary?: boolean;
	children?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
	return (
		<button type={type} className={buttonClass({ variant, size, stickyPrimary, className })} {...props}>
			{children}
		</button>
	);
}
