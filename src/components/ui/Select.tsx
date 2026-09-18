import { OverlayPortal, useOverlayLock } from '$lib/overlay';
import { cn } from '$lib/ui';
import { ui } from './tokens';
import {
	useCallback,
	useEffect,
	useId,
	useLayoutEffect,
	useRef,
	useState,
	type CSSProperties,
	type KeyboardEvent as ReactKeyboardEvent,
	type ReactNode
} from 'react';
import { Icon } from '../Icon';

export type SelectOption = {
	value: string;
	label: ReactNode;
	/** Plain text for typeahead when `label` is not a string. */
	text?: string;
	disabled?: boolean;
};

const TYPEAHEAD_MS = 700;

const optionClass =
	'flex w-full items-center justify-between gap-[0.65rem] min-h-11 px-[0.9rem] py-[0.55rem] rounded-xl border-0 bg-transparent text-muted text-left text-base font-inherit cursor-pointer transition-colors duration-150 hover:text-fg hover:bg-panel disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:text-muted disabled:hover:bg-transparent';

function optionText(opt: SelectOption): string {
	if (opt.text != null) return opt.text;
	if (typeof opt.label === 'string' || typeof opt.label === 'number') return String(opt.label);
	return opt.value;
}

function firstEnabled(options: SelectOption[]): number {
	return options.findIndex((o) => !o.disabled);
}

function lastEnabled(options: SelectOption[]): number {
	for (let i = options.length - 1; i >= 0; i--) {
		if (!options[i]?.disabled) return i;
	}
	return -1;
}

function stepEnabled(options: SelectOption[], from: number, dir: 1 | -1): number {
	const n = options.length;
	if (!n) return 0;
	let i = from;
	for (let nStep = 0; nStep < n; nStep++) {
		i = (i + dir + n) % n;
		if (!options[i]?.disabled) return i;
	}
	return from;
}

function indexOfValue(options: SelectOption[], value: string): number {
	const i = options.findIndex((o) => o.value === value && !o.disabled);
	if (i >= 0) return i;
	return firstEnabled(options);
}

function matchTypeahead(options: SelectOption[], query: string, from: number): number {
	const q = query.toLowerCase();
	const n = options.length;
	if (!n || !q) return -1;
	const sameChar = [...q].every((c) => c === q[0]);
	const needle = sameChar ? q[0]! : q;
	for (let step = 0; step < n; step++) {
		const i = (from + 1 + step) % n;
		const opt = options[i]!;
		if (opt.disabled) continue;
		if (optionText(opt).toLowerCase().startsWith(needle)) return i;
	}
	return -1;
}

function menuBox(trigger: HTMLElement, menu: HTMLElement): CSSProperties {
	const rect = trigger.getBoundingClientRect();
	const gap = 6;
	const margin = 8;
	const minW = rect.width;
	const width = Math.min(Math.max(minW, 12.5 * 16), window.innerWidth - margin * 2);
	const below = window.innerHeight - rect.bottom - gap - margin;
	const above = rect.top - gap - margin;
	const needed = Math.min(menu.scrollHeight || 320, 320);
	const openUp = below < needed && above > below;
	const maxHeight = Math.max(132, Math.min(320, openUp ? above : below));
	const top = openUp
		? Math.max(margin, rect.top - gap - Math.min(menu.scrollHeight, maxHeight))
		: rect.bottom + gap;
	let left = rect.left;
	if (left + width > window.innerWidth - margin) left = window.innerWidth - margin - width;
	if (left < margin) left = margin;
	return { position: 'fixed', top, left, width, maxHeight, zIndex: 20001 };
}

function useMobileSheet() {
	const [mobile, setMobile] = useState(() =>
		typeof window !== 'undefined' ? window.matchMedia('(max-width: 640px)').matches : false
	);
	useEffect(() => {
		const mq = window.matchMedia('(max-width: 640px)');
		const sync = () => setMobile(mq.matches);
		sync();
		mq.addEventListener('change', sync);
		return () => mq.removeEventListener('change', sync);
	}, []);
	return mobile;
}

export function Select({
	value: valueProp,
	defaultValue,
	onChange,
	options,
	name,
	disabled,
	id,
	className,
	placeholder,
	size = 'default',
	'aria-label': ariaLabel,
	'aria-labelledby': ariaLabelledBy
}: {
	value?: string;
	defaultValue?: string;
	onChange?: (value: string) => void;
	options: SelectOption[];
	name?: string;
	disabled?: boolean;
	id?: string;
	className?: string;
	placeholder?: string;
	size?: 'default' | 'compact';
	'aria-label'?: string;
	'aria-labelledby'?: string;
}) {
	const isControlled = valueProp !== undefined;
	const [uncontrolled, setUncontrolled] = useState(defaultValue ?? '');
	const value = isControlled ? valueProp : uncontrolled;
	const [open, setOpen] = useState(false);
	const [activeIndex, setActiveIndex] = useState(() => indexOfValue(options, value));
	const [box, setBox] = useState<CSSProperties>({});
	const mobile = useMobileSheet();
	const autoId = useId();
	const listId = `${autoId}-list`;
	const triggerId = id ?? `${autoId}-trigger`;
	const titleId = `${autoId}-title`;
	const triggerRef = useRef<HTMLButtonElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const typeRef = useRef({ buf: '', at: 0 });
	const sheet = mobile && open;
	useOverlayLock(sheet);

	const selected = options.find((o) => o.value === value);
	const triggerLabel = selected?.label ?? placeholder ?? '';
	const isEmpty = !selected || selected.value === '';
	const fieldLabelId = `${autoId}-label`;
	const labelledBy = ariaLabelledBy ?? (ariaLabel ? fieldLabelId : undefined);
	const dialogTitle = ariaLabel ?? placeholder ?? 'Choose';

	const close = useCallback(() => setOpen(false), []);

	const apply = useCallback(
		(next: string) => {
			if (!isControlled) setUncontrolled(next);
			onChange?.(next);
		},
		[isControlled, onChange]
	);

	const commit = useCallback(
		(next: string) => {
			apply(next);
			setOpen(false);
			queueMicrotask(() => triggerRef.current?.focus());
		},
		[apply]
	);

	const openMenu = useCallback(
		(fromIndex?: number) => {
			if (disabled || !options.length) return;
			const start = fromIndex ?? indexOfValue(options, value);
			setActiveIndex(start < 0 ? 0 : start);
			setOpen(true);
		},
		[disabled, options, value]
	);

	useLayoutEffect(() => {
		if (!open || mobile) return;
		const trigger = triggerRef.current;
		const menu = menuRef.current;
		if (!trigger || !menu) return;
		const update = () => setBox(menuBox(trigger, menu));
		update();
		window.addEventListener('resize', update);
		window.addEventListener('scroll', update, true);
		return () => {
			window.removeEventListener('resize', update);
			window.removeEventListener('scroll', update, true);
		};
	}, [open, mobile, options]);

	useLayoutEffect(() => {
		if (!open) return;
		document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
	}, [open, activeIndex, listId]);

	useEffect(() => {
		if (!open || !mobile) return;
		menuRef.current?.focus();
	}, [open, mobile]);

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.isComposing) return;
			if (e.key === 'Escape') {
				e.preventDefault();
				close();
				triggerRef.current?.focus();
				return;
			}
			if (e.key === 'Tab') {
				if (mobile) {
					const dialog = menuRef.current?.closest('[role="dialog"]');
					if (!dialog) return;
					const nodes = [...dialog.querySelectorAll<HTMLElement>('button, [role="listbox"]')];
					if (!nodes.length) return;
					const i = nodes.indexOf(document.activeElement as HTMLElement);
					const next = e.shiftKey
						? nodes[i <= 0 ? nodes.length - 1 : i - 1]
						: nodes[i < 0 || i === nodes.length - 1 ? 0 : i + 1];
					e.preventDefault();
					next?.focus();
					return;
				}
				const opt = options[activeIndex];
				if (opt && !opt.disabled) apply(opt.value);
				setOpen(false);
				return;
			}
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				setActiveIndex((i) => stepEnabled(options, i, 1));
				return;
			}
			if (e.key === 'ArrowUp') {
				e.preventDefault();
				setActiveIndex((i) => stepEnabled(options, i, -1));
				return;
			}
			if (e.key === 'Home') {
				e.preventDefault();
				const i = firstEnabled(options);
				if (i >= 0) setActiveIndex(i);
				return;
			}
			if (e.key === 'End') {
				e.preventDefault();
				const i = lastEnabled(options);
				if (i >= 0) setActiveIndex(i);
				return;
			}
			if (e.key === 'PageDown') {
				e.preventDefault();
				setActiveIndex((i) => {
					let next = i;
					for (let n = 0; n < 8; n++) next = stepEnabled(options, next, 1);
					return next;
				});
				return;
			}
			if (e.key === 'PageUp') {
				e.preventDefault();
				setActiveIndex((i) => {
					let next = i;
					for (let n = 0; n < 8; n++) next = stepEnabled(options, next, -1);
					return next;
				});
				return;
			}
			if (e.key === 'Enter' || e.key === ' ') {
				const focused = e.target as HTMLElement | null;
				if (mobile && focused?.closest('button') && !focused.closest('[role="listbox"]')) {
					return;
				}
				e.preventDefault();
				const opt = options[activeIndex];
				if (opt && !opt.disabled) commit(opt.value);
				return;
			}
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			if (e.key.length === 1 && e.key !== ' ') {
				const now = Date.now();
				const nextBuf = now - typeRef.current.at > TYPEAHEAD_MS ? e.key : typeRef.current.buf + e.key;
				typeRef.current = { buf: nextBuf, at: now };
				const match = matchTypeahead(options, nextBuf, activeIndex);
				if (match >= 0) setActiveIndex(match);
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [open, mobile, options, activeIndex, close, commit, apply]);

	function onTriggerKeyDown(e: ReactKeyboardEvent<HTMLButtonElement>) {
		if (disabled) return;
		if (open) return;
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			openMenu(e.key === 'ArrowUp' ? lastEnabled(options) : undefined);
			return;
		}
		if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return;
		e.preventDefault();
		typeRef.current = { buf: e.key, at: Date.now() };
		const match = matchTypeahead(options, e.key, -1);
		openMenu(match >= 0 ? match : undefined);
	}

	const list = (
		<div
			ref={menuRef}
			id={listId}
			role="listbox"
			tabIndex={mobile ? 0 : undefined}
			aria-labelledby={labelledBy}
			aria-label={labelledBy ? undefined : ariaLabel}
			aria-activedescendant={open ? `${listId}-${activeIndex}` : undefined}
			className={
				mobile
					? 'flex min-h-0 flex-1 flex-col gap-[0.2rem] overflow-y-auto overscroll-contain -mx-1 px-1 outline-none'
					: 'grid gap-[0.2rem] p-[0.45rem] overflow-y-auto overscroll-contain border border-line rounded-box bg-surface shadow-lift'
			}
			style={mobile ? undefined : { position: 'fixed', zIndex: 20001, ...box }}
		>
			{options.map((opt, i) => {
				const isActive = i === activeIndex;
				const isSelected = opt.value === value;
				return (
					<div
						key={opt.value === '' ? `${i}-empty` : opt.value}
						id={`${listId}-${i}`}
						role="option"
						tabIndex={-1}
						aria-selected={isSelected}
						aria-disabled={opt.disabled || undefined}
						data-active={isActive || undefined}
						className={cn(
							optionClass,
							isActive && 'text-fg bg-accent/10',
							isSelected && 'font-semibold text-fg',
							opt.disabled && 'pointer-events-none'
						)}
						onMouseDown={(e) => e.preventDefault()}
						onMouseEnter={() => {
							if (!opt.disabled) setActiveIndex(i);
						}}
						onClick={() => {
							if (!opt.disabled) commit(opt.value);
						}}
					>
						<span className="min-w-0 flex-1 whitespace-normal">{opt.label}</span>
						{isSelected ? <Icon name="check" size={16} className="text-accent-fg" /> : null}
					</div>
				);
			})}
		</div>
	);

	return (
		<div className={cn(size === 'compact' ? 'w-full min-w-0 sm:w-auto' : 'w-full min-w-0', className)}>
			{ariaLabel && !ariaLabelledBy ? (
				<span id={fieldLabelId} className="sr-only">
					{ariaLabel}
				</span>
			) : null}
			<button
				ref={triggerRef}
				id={triggerId}
				type="button"
				data-select=""
				disabled={disabled}
				role="combobox"
				aria-haspopup={mobile ? 'dialog' : 'listbox'}
				aria-expanded={open}
				aria-controls={listId}
				aria-activedescendant={!mobile && open ? `${listId}-${activeIndex}` : undefined}
				aria-labelledby={labelledBy}
				className={cn(
					'appearance-none inline-flex items-center justify-between gap-2 w-full border border-solid border-line bg-inset text-left font-inherit leading-[1.3] cursor-pointer outline-none touch-manipulation transition-[border-color,box-shadow] duration-150',
					'enabled:hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)]',
					'focus:border-[color-mix(in_srgb,var(--accent)_55%,transparent)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_12%,transparent)]',
					'aria-expanded:border-[color-mix(in_srgb,var(--accent)_55%,transparent)]',
					'disabled:opacity-55 disabled:cursor-not-allowed',
					size === 'compact'
						? 'min-h-11 px-3 py-2 rounded-lg text-[0.88rem] sm:min-h-9 sm:px-2 sm:py-1 sm:text-[0.82rem]'
						: 'min-h-11 px-[0.8rem] py-[0.7rem] rounded-xl text-base'
				)}
				onClick={() => (open ? close() : openMenu())}
				onKeyDown={onTriggerKeyDown}
			>
				<span
					className={cn(
						'min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap',
						isEmpty ? 'text-muted' : 'text-fg'
					)}
				>
					{triggerLabel || placeholder || '\u00a0'}
				</span>
				<Icon
					name="arrow"
					size={16}
					className={cn(
						'shrink-0 text-muted transition-transform duration-150',
						open ? '-rotate-90' : 'rotate-90'
					)}
				/>
			</button>
			{name != null ? <input type="hidden" name={name} value={value} /> : null}
			{open && !mobile ? (
				<OverlayPortal>
					<div className="fixed inset-0 z-[20000]">
						<div className="absolute inset-0 cursor-pointer" onClick={close} aria-hidden="true" />
						{list}
					</div>
				</OverlayPortal>
			) : null}
			{open && mobile ? (
				<OverlayPortal>
					<div
						className={ui.dialogRoot}
						role="dialog"
						aria-modal="true"
						aria-labelledby={titleId}
					>
						<div className={ui.dialogBackdrop} onClick={close} aria-hidden="true" />
						<div className={cn(ui.dialogPanel, 'overflow-hidden')}>
							<div
								className="w-9 h-[0.28rem] mx-auto -mt-1 mb-[0.1rem] rounded-full bg-line shrink-0"
								aria-hidden="true"
							/>
							<div className="flex items-center justify-between gap-3">
								<strong
									id={titleId}
									className="font-display text-[1.15rem] tracking-[-0.03em]"
								>
									{dialogTitle}
								</strong>
								<button
									type="button"
									className={cn(ui.btnGhost, 'min-h-11 px-[0.95rem] py-[0.45rem]')}
									onClick={close}
								>
									Done
								</button>
							</div>
							{list}
						</div>
					</div>
				</OverlayPortal>
			) : null}
		</div>
	);
}
