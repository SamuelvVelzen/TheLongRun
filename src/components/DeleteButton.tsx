import type { MouseEvent } from 'react';
import { cn, ui } from '$lib/ui';

export function TrashIcon() {
	return (
		<svg className="block size-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
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
	className
}: {
	label: string;
	onClick: (event: MouseEvent<HTMLButtonElement>) => void;
	disabled?: boolean;
	className?: string;
}) {
	return (
		<button
			className={cn(ui.btnGhost, ui.btnDanger, ui.btnIcon, className)}
			type="button"
			aria-label={label}
			title={label}
			disabled={disabled}
			onClick={onClick}
		>
			<TrashIcon />
		</button>
	);
}
