import type { ReactNode } from 'react';
import { Button, type ButtonVariant } from './Button';
import { useFormContext } from './form-context';

export function SubmitButton({
	children,
	busyLabel,
	variant = 'primary',
	stickyPrimary,
	className
}: {
	children: ReactNode;
	busyLabel?: string;
	variant?: ButtonVariant;
	stickyPrimary?: boolean;
	className?: string;
}) {
	const form = useFormContext();
	return (
		<form.Subscribe selector={(state) => state.isSubmitting}>
			{(isSubmitting) => (
				<Button
					type="submit"
					variant={variant}
					stickyPrimary={stickyPrimary}
					className={className}
					disabled={isSubmitting}
				>
					{isSubmitting && busyLabel ? busyLabel : children}
				</Button>
			)}
		</form.Subscribe>
	);
}
