import { cn } from '$lib/ui';
import { Link } from '@tanstack/react-router';
import type { ButtonHTMLAttributes, ComponentProps, MouseEvent, ReactNode } from 'react';
import { Icon } from '../Icon';
import { Button, buttonClass, type ButtonSize, type ButtonVariant } from './Button';

const iconLabelMobile =
	'max-sm:min-w-11 max-sm:w-11 max-sm:px-0 max-sm:justify-center max-sm:gap-0';

const compactIcon =
	'size-8 min-h-8! min-w-8 p-0! px-0! py-0! rounded-full leading-none shrink-0 self-center box-border max-sm:flex-none max-sm:size-8 max-sm:min-h-8! max-sm:min-w-8 max-sm:p-0! max-sm:px-0! max-sm:py-0!';

/** Ghost toolbar control: icon + label on `sm+`, icon-only on mobile (label stays in `aria-label`). */
export function IconLabelButton({
	label,
	icon,
	variant = 'ghost',
	size = 'sm',
	className,
	...props
}: {
	label: string;
	icon: ReactNode;
	variant?: ButtonVariant;
	size?: ButtonSize;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
	return (
		<Button
			variant={variant}
			size={size}
			aria-label={label}
			title={label}
			className={cn(iconLabelMobile, className)}
			{...props}
		>
			{icon}
			<span className="max-sm:hidden">{label}</span>
		</Button>
	);
}

/** Router link styled like `IconLabelButton`. */
export function IconLabelLink({
	label,
	icon,
	variant = 'ghost',
	size = 'sm',
	className,
	...props
}: {
	label: string;
	icon: ReactNode;
	variant?: ButtonVariant;
	size?: ButtonSize;
} & Omit<ComponentProps<typeof Link>, 'children'>) {
	return (
		<Link
			aria-label={label}
			title={label}
			className={cn(buttonClass({ variant, size }), iconLabelMobile, className)}
			{...props}
		>
			{icon}
			<span className="max-sm:hidden">{label}</span>
		</Link>
	);
}

export function TrashIcon({ className }: { className?: string } = {}) {
	return (
		<svg className={cn('block size-5 shrink-0', className)} viewBox="0 0 24 24" aria-hidden="true">
			<path
				fill="currentColor"
				d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9zm-1 12h12l1-12H5l1 12z"
			/>
		</svg>
	);
}

export function EditButton({
	label,
	onClick,
	disabled,
	className,
	compact
}: {
	label: string;
	onClick: (event: MouseEvent<HTMLButtonElement>) => void;
	disabled?: boolean;
	className?: string;
	compact?: boolean;
}) {
	return (
		<Button
			variant="ghost"
			size={compact ? 'default' : 'icon'}
			className={cn(compact && compactIcon, className)}
			aria-label={label}
			title={label}
			disabled={disabled}
			onClick={onClick}
		>
			<Icon name="pencil" size={compact ? 14 : 16} />
		</Button>
	);
}

export function DeleteButton({
	label,
	onClick,
	disabled,
	className,
	compact
}: {
	label: string;
	onClick: (event: MouseEvent<HTMLButtonElement>) => void;
	disabled?: boolean;
	className?: string;
	compact?: boolean;
}) {
	return (
		<Button
			variant="danger"
			size={compact ? 'default' : 'icon'}
			className={cn(compact && compactIcon, className)}
			aria-label={label}
			title={label}
			disabled={disabled}
			onClick={onClick}
		>
			<TrashIcon className={compact ? 'size-3.5' : undefined} />
		</Button>
	);
}
