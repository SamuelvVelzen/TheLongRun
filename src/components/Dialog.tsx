import { useEffect, useId, useState, type ReactNode } from 'react';
import { cn, ui } from '$lib/ui';

export function Dialog({
	open,
	title,
	onClose,
	children,
	actions
}: {
	open: boolean;
	title: string;
	onClose: () => void;
	children?: ReactNode;
	actions?: ReactNode;
}) {
	const titleId = useId();

	useEffect(() => {
		if (!open) return;
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		};
		window.addEventListener('keydown', onKey);
		return () => {
			document.body.style.overflow = prev;
			window.removeEventListener('keydown', onKey);
		};
	}, [open, onClose]);

	if (!open) return null;

	return (
		<div className={ui.dialogRoot} role="dialog" aria-modal="true" aria-labelledby={titleId}>
			<div className={ui.dialogBackdrop} onClick={onClose} aria-hidden="true" />
			<div className={ui.dialogPanel}>
				<div className="flex items-start justify-between gap-3">
					<strong id={titleId} className="font-display text-[1.2rem] tracking-[-0.03em]">
						{title}
					</strong>
					<button
						type="button"
						className={cn(ui.btnGhost, ui.btnIcon, 'text-[1.25rem]')}
						aria-label="Close"
						onClick={onClose}
					>
						×
					</button>
				</div>
				{children}
				{actions && <div className={ui.actions}>{actions}</div>}
			</div>
		</div>
	);
}

export function ConfirmDialog({
	open,
	title,
	description,
	confirmLabel = 'Delete',
	busyLabel,
	onClose,
	onConfirm
}: {
	open: boolean;
	title: string;
	description?: ReactNode;
	confirmLabel?: string;
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
					<button className={ui.btnGhost} type="button" disabled={busy} onClick={onClose}>
						Cancel
					</button>
					<button
						className={cn(ui.btnGhost, ui.btnDanger)}
						type="button"
						disabled={busy}
						onClick={() => void confirm()}
					>
						{busy ? (busyLabel ?? `${confirmLabel}…`) : confirmLabel}
					</button>
				</>
			}
		>
			{description ? <p className={cn(ui.muted, 'm-0')}>{description}</p> : null}
		</Dialog>
	);
}
