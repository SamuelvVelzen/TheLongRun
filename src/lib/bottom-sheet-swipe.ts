import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';

type DragHandleProps = {
	onPointerDown: (e: PointerEvent<HTMLElement>) => void;
	onPointerMove: (e: PointerEvent<HTMLElement>) => void;
	onPointerUp: (e: PointerEvent<HTMLElement>) => void;
	onPointerCancel: (e: PointerEvent<HTMLElement>) => void;
};

function isMobileSheet() {
	return typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches;
}

/** Drag handle + panel motion for mobile bottom sheets (swipe down to dismiss). */
export function useBottomSheetSwipe(onDismiss: () => void, active: boolean) {
	const panelRef = useRef<HTMLDivElement>(null);
	const startY = useRef(0);
	const startTime = useRef(0);
	const dragging = useRef(false);
	const offsetRef = useRef(0);
	const [offsetY, setOffsetY] = useState(0);
	const [animating, setAnimating] = useState(false);

	useEffect(() => {
		if (!active) {
			dragging.current = false;
			offsetRef.current = 0;
			setOffsetY(0);
			setAnimating(false);
		}
	}, [active]);

	const endDrag = useCallback(
		(e: PointerEvent<HTMLElement>) => {
			if (!dragging.current) return;
			dragging.current = false;
			try {
				e.currentTarget.releasePointerCapture(e.pointerId);
			} catch {
				/* capture already released */
			}
			const dy = offsetRef.current;
			const dt = Math.max(performance.now() - startTime.current, 1);
			const velocity = dy / dt;
			const panelH = panelRef.current?.offsetHeight ?? 320;
			const threshold = Math.min(140, panelH * 0.2);
			if (dy > threshold || velocity > 0.65) {
				setAnimating(true);
				const closeOffset = panelH + 32;
				offsetRef.current = closeOffset;
				setOffsetY(closeOffset);
				window.setTimeout(() => onDismiss(), 240);
			} else {
				setAnimating(true);
				offsetRef.current = 0;
				setOffsetY(0);
				window.setTimeout(() => setAnimating(false), 240);
			}
		},
		[onDismiss]
	);

	const onPointerDown = useCallback((e: PointerEvent<HTMLElement>) => {
		if (e.button !== 0 || !isMobileSheet()) return;
		dragging.current = true;
		setAnimating(false);
		startY.current = e.clientY;
		startTime.current = performance.now();
		offsetRef.current = 0;
		setOffsetY(0);
		e.currentTarget.setPointerCapture(e.pointerId);
	}, []);

	const onPointerMove = useCallback((e: PointerEvent<HTMLElement>) => {
		if (!dragging.current) return;
		const dy = Math.max(0, e.clientY - startY.current);
		offsetRef.current = dy;
		setOffsetY(dy);
	}, []);

	const dragHandleProps: DragHandleProps = {
		onPointerDown,
		onPointerMove,
		onPointerUp: endDrag,
		onPointerCancel: endDrag
	};

	const panelStyle: CSSProperties | undefined =
		offsetY > 0 || animating
			? {
					transform: `translateY(${offsetY}px)`,
					transition: dragging.current ? 'none' : animating ? 'transform 240ms ease' : undefined
				}
			: undefined;

	const backdropStyle: CSSProperties | undefined =
		offsetY > 0
			? {
					opacity: Math.max(0.12, 1 - offsetY / 300),
					transition: dragging.current ? 'none' : animating ? 'opacity 240ms ease' : undefined
				}
			: undefined;

	return { panelRef, panelStyle, backdropStyle, dragHandleProps };
}
