import { cn } from '$lib/ui';
import {
    useEffect,
    useId,
    useLayoutEffect,
    useRef,
    useState,
    type CSSProperties,
    type ReactNode
} from 'react';

const VIEWPORT_PAD = 8;

export function finePointerHover(): boolean {
	return (
		typeof window !== 'undefined' &&
		window.matchMedia('(hover: hover) and (pointer: fine)').matches
	);
}

/** Shared bubble chrome. Natural width; shifts or wraps only if it would clip the viewport. */
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
	const ref = useRef<HTMLDivElement>(null);
	const [fit, setFit] = useState({ shift: 0, maxWidth: 0, arrow: 50 });

	useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;

		function place() {
			if (!el) return;
			const vw = window.innerWidth;
			const cap = Math.max(0, vw - VIEWPORT_PAD * 2);

			el.style.marginLeft = '0px';
			el.style.maxWidth = 'none';
			el.style.whiteSpace = 'nowrap';

			const natural = el.getBoundingClientRect().width;
			const wrap = natural > cap + 0.5;
			if (wrap) {
				el.style.maxWidth = `${cap}px`;
				el.style.whiteSpace = 'normal';
			}

			const rect = el.getBoundingClientRect();
			let shift = 0;
			if (rect.left < VIEWPORT_PAD) shift = VIEWPORT_PAD - rect.left;
			if (rect.right + shift > vw - VIEWPORT_PAD) {
				shift = vw - VIEWPORT_PAD - rect.right;
			}

			const arrow = Math.round(Math.min(rect.width - 10, Math.max(10, rect.width / 2 - shift)));
			const maxWidth = wrap ? cap : 0;
			setFit((prev) =>
				prev.shift === shift && prev.maxWidth === maxWidth && prev.arrow === arrow
					? prev
					: { shift, maxWidth, arrow }
			);
		}

		place();
		window.addEventListener('resize', place);
		return () => window.removeEventListener('resize', place);
	}, [children]);

	return (
		<div
			ref={ref}
			id={id}
			role="tooltip"
			className={cn(
				'absolute z-[3] flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg border border-line bg-surface shadow-lift pointer-events-none text-center',
				'after:content-[\'\'] after:absolute after:top-full after:left-[var(--tip-arrow-left,50%)] after:-translate-x-1/2 after:border-[5px] after:border-solid after:border-transparent after:border-t-surface',
				className
			)}
			style={{
				...style,
				marginLeft: fit.shift,
				maxWidth: fit.maxWidth || undefined,
				whiteSpace: fit.maxWidth ? 'normal' : 'nowrap',
				['--tip-arrow-left' as string]: `${fit.arrow}px`
			}}
		>
			{children}
		</div>
	);
}

export function TipValue({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<span
			className={cn(
				'font-display font-bold text-[0.95rem] tracking-[-0.02em] text-accent-fg leading-[1.25]',
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
				'text-[0.82rem] text-muted leading-[1.3]',
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
