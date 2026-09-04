import type { MouseEvent } from 'react';
import { cn, ui } from '$lib/ui';

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
		<button
			className={cn(
				ui.btnGhost,
				ui.btnDanger,
				compact
					? 'size-8 min-h-8! min-w-8 p-0! px-0! py-0! rounded-full leading-none shrink-0 self-center box-border max-sm:flex-none max-sm:size-8 max-sm:min-h-8! max-sm:min-w-8 max-sm:p-0! max-sm:px-0! max-sm:py-0!'
					: ui.btnIcon,
				className
			)}
			type="button"
			aria-label={label}
			title={label}
			disabled={disabled}
			onClick={onClick}
		>
			<TrashIcon className={compact ? 'size-3.5' : undefined} />
		</button>
	);
}
