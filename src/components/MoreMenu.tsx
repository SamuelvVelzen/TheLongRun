import { OverlayPortal } from '$lib/overlay';
import { cn } from '$lib/ui';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { Icon } from './Icon';
import { buttonClass } from './ui/Button';

import { compactIconButtonClass } from './ui/IconButtons';

/** Compact ⋮ trigger — same footprint as `EditButton` compact. */
const compactMoreTriggerClass = cn(
	compactIconButtonClass,
	'inline-flex items-center justify-center appearance-none bg-transparent border border-solid border-line text-muted cursor-pointer transition-colors duration-150 hover:text-fg hover:bg-fg/[0.08]'
);

export type MoreMenuItem = {
	label: string;
	icon: ReactNode;
	onClick: () => void;
	disabled?: boolean;
	danger?: boolean;
};

const itemClass =
	'flex w-full items-center gap-[0.65rem] min-h-11 px-[0.9rem] py-[0.55rem] rounded-xl border-0 bg-transparent text-muted text-left font-inherit cursor-pointer transition-colors duration-150 hover:text-fg hover:bg-panel disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:text-muted disabled:hover:bg-transparent';

const dangerItemClass =
	'text-warn! hover:text-warn hover:bg-warn/10 [&_svg]:text-warn';

const menuPanelClass =
	'grid min-w-[12.5rem] gap-[0.2rem] p-[0.45rem] border border-line rounded-box bg-surface shadow-lift';

function menuBox(trigger: HTMLElement, menu: HTMLElement): CSSProperties {
	const rect = trigger.getBoundingClientRect();
	const gap = 6;
	const margin = 8;
	const width = Math.min(12.5 * 16, window.innerWidth - margin * 2);
	let left = rect.right - width;
	if (left < margin) left = margin;
	const menuH = menu.scrollHeight || 120;
	const below = window.innerHeight - rect.bottom - gap - margin;
	const above = rect.top - gap - margin;
	const openUp = menuH > below && above > below;
	const top = openUp
		? Math.max(margin, rect.top - gap - menuH)
		: rect.bottom + gap;
	return { position: 'fixed', top, left, width, zIndex: 20001 };
}

export function MoreMenu({
	items,
	label = 'More actions',
	compact = false,
	trigger = 'more'
}: {
	items: MoreMenuItem[];
	label?: string;
	compact?: boolean;
	/** `edit` uses a pencil icon (gear rows, etc.); default is the ⋮ menu. */
	trigger?: 'more' | 'edit';
}) {
	const [open, setOpen] = useState(false);
	const [box, setBox] = useState<CSSProperties>({});
	const triggerRef = useRef<HTMLButtonElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);

	const close = useCallback(() => setOpen(false), []);

	const position = useCallback(() => {
		const el = triggerRef.current;
		const menu = menuRef.current;
		if (!el || !menu) return;
		setBox(menuBox(el, menu));
	}, []);

	useLayoutEffect(() => {
		if (!open) return;
		position();
		window.addEventListener('resize', position);
		window.addEventListener('scroll', position, true);
		return () => {
			window.removeEventListener('resize', position);
			window.removeEventListener('scroll', position, true);
		};
	}, [open, position, items.length]);

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				close();
				triggerRef.current?.focus();
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [open, close]);

	if (!items.length) return null;

	const onItemClick = (e: MouseEvent<HTMLButtonElement>, onClick: () => void) => {
		close();
		onClick();
		e.stopPropagation();
	};

	return (
		<div className="relative z-30 shrink-0 max-sm:flex-none">
			<button
				ref={triggerRef}
				type="button"
				className={cn(
					compact
						? compactMoreTriggerClass
						: buttonClass({ variant: 'ghost', size: 'icon' }),
					open && 'text-fg'
				)}
				aria-label={label}
				aria-haspopup="menu"
				aria-expanded={open}
				title={label}
				onClick={() => setOpen((v) => !v)}
			>
				<Icon name={trigger === 'edit' ? 'pencil' : 'more'} size={compact ? 12 : 16} />
			</button>
			{open ? (
				<OverlayPortal>
					<div
						className="fixed inset-0 z-[20000] cursor-pointer"
						onClick={close}
						aria-hidden="true"
					/>
					<div
						ref={menuRef}
						role="menu"
						aria-label={label}
						className={menuPanelClass}
						style={box}
					>
						{items.map((item) => (
							<button
								key={item.label}
								type="button"
								role="menuitem"
								className={cn(itemClass, item.danger && dangerItemClass)}
								disabled={item.disabled}
								onClick={(e) => onItemClick(e, item.onClick)}
							>
								{item.icon}
								{item.label}
							</button>
						))}
					</div>
				</OverlayPortal>
			) : null}
		</div>
	);
}
