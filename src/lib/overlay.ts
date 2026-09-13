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

let lockCount = 0;
let prevOverflow = '';
let listening = false;

function onViewportChange() {
	syncOverlayViewport();
}

function startListening() {
	if (listening) return;
	listening = true;
	const vv = window.visualViewport;
	vv?.addEventListener('resize', onViewportChange);
	vv?.addEventListener('scroll', onViewportChange);
	window.addEventListener('resize', onViewportChange);
}

function stopListening() {
	if (!listening) return;
	listening = false;
	const vv = window.visualViewport;
	vv?.removeEventListener('resize', onViewportChange);
	vv?.removeEventListener('scroll', onViewportChange);
	window.removeEventListener('resize', onViewportChange);
}

function acquireOverlayLock() {
	lockCount++;
	if (lockCount !== 1) return;
	const html = document.documentElement;
	const body = document.body;
	html.classList.add('overlay-open');
	body.classList.add('overlay-open');
	prevOverflow = body.style.overflow;
	body.style.overflow = 'hidden';
	syncOverlayViewport();
	startListening();
}

function releaseOverlayLock() {
	lockCount = Math.max(0, lockCount - 1);
	if (lockCount > 0) return;
	const html = document.documentElement;
	const body = document.body;
	html.classList.remove('overlay-open');
	body.classList.remove('overlay-open');
	body.style.overflow = prevOverflow;
	html.style.removeProperty('--overlay-top');
	html.style.removeProperty('--overlay-height');
	stopListening();
}

/** Lock page scroll and size overlays to the visual viewport (iOS URL bar / keyboard). */
export function useOverlayLock(active: boolean) {
	useEffect(() => {
		if (!active) return;
		acquireOverlayLock();
		return () => releaseOverlayLock();
	}, [active]);
}

/** Render overlays on document.body so they are not trapped by .shell / overflow-x: clip. */
export function OverlayPortal({ children }: { children: ReactNode }) {
	const [target, setTarget] = useState<HTMLElement | null>(() =>
		typeof document !== 'undefined' ? document.body : null
	);
	useLayoutEffect(() => {
		setTarget(document.body);
	}, []);
	if (!target) return null;
	return createPortal(children, target);
}
