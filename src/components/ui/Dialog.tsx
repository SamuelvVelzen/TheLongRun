import { OverlayPortal, useOverlayLock } from '$lib/overlay';
import { cn } from '$lib/ui';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Icon } from '../Icon';
import { Actions } from './Actions';
import { Button } from './Button';
import { ui } from './tokens';

const dialogHeaderPad =
	'px-[1.15rem] pt-[1.15rem] pb-3 sm:px-[1.35rem] sm:pt-[1.25rem] sm:pb-3.5';
const dialogBodyPad = 'px-[1.15rem] py-4 sm:px-[1.35rem]';
const dialogFooterPad =
	'px-[1.15rem] pt-3 pb-[calc(1.15rem+env(safe-area-inset-bottom,0px))] sm:px-[1.35rem] sm:pb-[1.25rem]';
const dialogWidePad = 'sm:px-[1.5rem]';

export function Dialog({
	open,
	title,
	onClose,
	children,
	actions,
	size = 'default',
	className,
	compactClose = false
}: {
	open: boolean;
	title: string;
	onClose: () => void;
	children?: ReactNode;
	actions?: ReactNode;
	size?: 'default' | 'wide';
	className?: string;
	compactClose?: boolean;
}) {
	const titleId = useId();
	useOverlayLock(open);

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		};
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('keydown', onKey);
		};
	}, [open, onClose]);

	if (!open) return null;

	const padX = size === 'wide' ? cn(dialogHeaderPad, dialogWidePad) : dialogHeaderPad;
	const bodyPadX = size === 'wide' ? cn(dialogBodyPad, dialogWidePad) : dialogBodyPad;
	const footerPadX = size === 'wide' ? cn(dialogFooterPad, dialogWidePad) : dialogFooterPad;

	return (
		<OverlayPortal>
			<div className={ui.dialogRoot} role="dialog" aria-modal="true" aria-labelledby={titleId}>
				<div className={ui.dialogBackdrop} onClick={onClose} aria-hidden="true" />
				<div
					className={cn(
						ui.dialogPanel,
						size === 'wide' && ui.dialogPanelWide,
						'!gap-0 overflow-hidden !p-0',
						size === 'wide' && '!sm:p-0',
						className
					)}
					onClick={(e) => e.stopPropagation()}
					onPointerDown={(e) => e.stopPropagation()}
				>
					<div
						className={cn(
							padX,
							'shrink-0 flex items-start justify-between gap-3 border-b border-line bg-surface'
						)}
					>
						<strong id={titleId} className="font-display text-[1.2rem] tracking-[-0.03em]">
							{title}
						</strong>
						<Button
							variant="ghost"
							size="icon"
							className={cn(
								'shrink-0 text-[1.25rem]',
								compactClose &&
									'size-8! min-h-8! min-w-8! max-sm:!size-8 max-sm:!min-h-8 max-sm:!min-w-8'
							)}
							aria-label="Close"
							onClick={onClose}
						>
							<Icon name="close" size={compactClose ? 14 : 16} />
						</Button>
					</div>
					<div
						className={cn(
							bodyPadX,
							'min-h-0 flex-1 overflow-y-auto overscroll-contain [overscroll-behavior:contain]'
						)}
					>
						{children}
					</div>
					{actions ? (
						<div
							className={cn(
								footerPadX,
								'shrink-0 border-t border-line bg-surface/95 backdrop-blur-[6px]'
							)}
						>
							<Actions>{actions}</Actions>
						</div>
					) : null}
				</div>
			</div>
		</OverlayPortal>
	);
}

export function ConfirmDialog({
	open,
	title,
	description,
	confirmLabel = 'Delete',
	cancelLabel = 'Cancel',
	busyLabel,
	onClose,
	onConfirm
}: {
	open: boolean;
	title: string;
	description?: ReactNode;
	confirmLabel?: string;
	cancelLabel?: string;
	busyLabel?: string;
	onClose: () => void;
	onConfirm: () => void | Promise<void>;
}) {
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		if (!open) setBusy(false);
	}, [open]);

	async function confirm() {
		if (busy) return;
		setBusy(true);
		try {
			await onConfirm();
			onClose();
		} catch {
			setBusy(false);
		}
	}

	return (
		<Dialog
			open={open}
			title={title}
			onClose={busy ? () => {} : onClose}
			actions={
				<>
					<Button variant="ghost" disabled={busy} onClick={onClose}>
						{cancelLabel}
					</Button>
					<Button variant="danger" disabled={busy} onClick={() => void confirm()}>
						{busy ? (busyLabel ?? `${confirmLabel}…`) : confirmLabel}
					</Button>
				</>
			}
		>
			{description ? <p className={cn(ui.muted, 'm-0')}>{description}</p> : null}
		</Dialog>
	);
}
