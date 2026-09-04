import { cn } from '$lib/ui';
import {
	useEffect,
	useId,
	useRef,
	useState,
	type CSSProperties,
	type ReactNode
} from 'react';

export function finePointerHover(): boolean {
	return (
		typeof window !== 'undefined' &&
		window.matchMedia('(hover: hover) and (pointer: fine)').matches
	);
}

/** Shared bubble chrome. Position with `className` / `style`. */
export function TipBubble({
	children,
	className,
	style,
	id
}: {
	children: ReactNode;
	className?: string;
	style?: CSSProperties;
	id?: string;
}) {
	return (
		<div
			id={id}
			role="tooltip"
			className={cn(
				'absolute z-[3] flex flex-col items-center gap-[0.05rem] px-[0.45rem] py-[0.28rem] rounded-lg border border-line bg-surface shadow-lift pointer-events-none whitespace-nowrap max-w-[min(14rem,70vw)] text-center',
				'after:content-[\'\'] after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-[5px] after:border-solid after:border-transparent after:border-t-surface',
				className
			)}
			style={style}
		>
			{children}
		</div>
	);
}

export function TipValue({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<span
			className={cn(
				'font-display font-bold text-[0.78rem] tracking-[-0.02em] text-accent-fg leading-[1.15]',
				className
			)}
		>
			{children}
		</span>
	);
}

export function TipCaption({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<span
			className={cn(
				'text-[0.68rem] text-muted leading-[1.15] overflow-hidden text-ellipsis max-w-full',
				className
			)}
		>
			{children}
		</span>
	);
}

/**
 * Hover to preview, tap to pin, tap again / tap outside / Escape to dismiss.
 * Fine pointers never pin — they already have hover.
 */
export function usePinnedTip<T = true>() {
	const rootRef = useRef<HTMLDivElement>(null);
	const [active, setActive] = useState<T | null>(null);
	const [pinned, setPinned] = useState(false);

	function onEnter(key: T) {
		if (!pinned) setActive(key);
	}

	function onLeave() {
		if (!pinned) setActive(null);
	}

	function onToggle(key: T) {
		if (finePointerHover()) {
			setActive(key);
			return;
		}
		if (pinned && Object.is(active, key)) {
			setPinned(false);
			setActive(null);
			return;
		}
		setPinned(true);
		setActive(key);
	}

	function clear() {
		setPinned(false);
		setActive(null);
	}

	useEffect(() => {
		if (!pinned) return;
		function dismiss() {
			setPinned(false);
			setActive(null);
		}
		function onDocPointerDown(e: PointerEvent) {
			if (!rootRef.current) return;
			if (e.target instanceof Node && rootRef.current.contains(e.target)) return;
			dismiss();
		}
		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape') dismiss();
		}
		document.addEventListener('pointerdown', onDocPointerDown);
		window.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('pointerdown', onDocPointerDown);
			window.removeEventListener('keydown', onKey);
		};
	}, [pinned]);

	return { active, pinned, rootRef, onEnter, onLeave, onToggle, clear };
}

/** Inline jargon: dotted underline, tap/hover for a short explanation. */
export function ExplainTip({
	label,
	value,
	caption,
	children,
	className
}: {
	label: string;
	value?: ReactNode;
	caption?: ReactNode;
	children: ReactNode;
	className?: string;
}) {
	const tipId = useId();
	const { active, rootRef, onEnter, onLeave, onToggle } = usePinnedTip();
	const open = active != null;

	return (
		<div ref={rootRef} className={cn('relative inline-block', className)}>
			<button
				type="button"
				className="appearance-none bg-transparent border-0 border-b border-dotted border-current/45 p-0 m-0 text-inherit font-inherit leading-[inherit] cursor-pointer touch-manipulation"
				aria-label={label}
				aria-expanded={open}
				aria-describedby={open ? tipId : undefined}
				onPointerEnter={() => onEnter(true)}
				onPointerLeave={onLeave}
				onClick={(e) => {
					e.preventDefault();
					e.stopPropagation();
					onToggle(true);
				}}
			>
				{children}
			</button>
			{open && (
				<TipBubble
					id={tipId}
					className="left-1/2 -translate-x-1/2 bottom-[calc(100%+0.45rem)] whitespace-normal"
				>
					{value != null && <TipValue>{value}</TipValue>}
					{caption != null && (
						<TipCaption className="whitespace-normal">{caption}</TipCaption>
					)}
				</TipBubble>
			)}
		</div>
	);
}
