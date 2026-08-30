import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

function syncOverlayViewport() {
	const html = document.documentElement;
	const vv = window.visualViewport;
	const top = vv?.offsetTop ?? 0;
	const height = vv && vv.height > 0 ? vv.height : window.innerHeight;
	html.style.setProperty('--overlay-top', `${Math.round(top)}px`);
	html.style.setProperty('--overlay-height', `${Math.max(1, Math.round(height))}px`);
}

/** Lock page scroll and size overlays to the visual viewport (iOS URL bar / keyboard). */
export function useOverlayLock(active: boolean) {
	useEffect(() => {
		if (!active) return;
		const html = document.documentElement;
		const body = document.body;
		html.classList.add('overlay-open');
		body.classList.add('overlay-open');
		const prevOverflow = body.style.overflow;
		body.style.overflow = 'hidden';
		syncOverlayViewport();
		const vv = window.visualViewport;
		vv?.addEventListener('resize', syncOverlayViewport);
		vv?.addEventListener('scroll', syncOverlayViewport);
		window.addEventListener('resize', syncOverlayViewport);
		return () => {
			html.classList.remove('overlay-open');
			body.classList.remove('overlay-open');
			body.style.overflow = prevOverflow;
			html.style.removeProperty('--overlay-top');
			html.style.removeProperty('--overlay-height');
			vv?.removeEventListener('resize', syncOverlayViewport);
			vv?.removeEventListener('scroll', syncOverlayViewport);
			window.removeEventListener('resize', syncOverlayViewport);
		};
	}, [active]);
}

/** Render overlays on document.body so they are not trapped by .shell / overflow-x: clip. */
export function OverlayPortal({ children }: { children: ReactNode }) {
	const [target, setTarget] = useState<HTMLElement | null>(null);
	useLayoutEffect(() => {
		setTarget(document.body);
	}, []);
	if (!target) return null;
	return createPortal(children, target);
}
