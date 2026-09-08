import { useEffect } from 'react';

const NON_TEXT_INPUT = new Set([
	'button',
	'checkbox',
	'color',
	'file',
	'hidden',
	'image',
	'radio',
	'range',
	'reset',
	'submit'
]);

function isTextEntry(el: EventTarget | null): boolean {
	if (!(el instanceof HTMLElement)) return false;
	if (el instanceof HTMLTextAreaElement) return !el.disabled && !el.readOnly;
	if (el instanceof HTMLSelectElement) return !el.disabled;
	if (el instanceof HTMLInputElement) {
		if (el.disabled || el.readOnly) return false;
		return !NON_TEXT_INPUT.has(el.type);
	}
	return el.isContentEditable;
}

/** Scrollport: inner `.app-main` on mobile, the window on desktop. */
export function getAppScrollElement(): Window | HTMLElement | null {
	if (typeof document === 'undefined') return null;
	const main = document.querySelector<HTMLElement>('.app-main');
	if (main) {
		const { overflowY } = getComputedStyle(main);
		if (overflowY === 'auto' || overflowY === 'scroll') return main;
	}
	return typeof window === 'undefined' ? null : window;
}

export function getAppScrollY(el: Window | HTMLElement | null = getAppScrollElement()): number {
	if (!el) return 0;
	return el === window ? window.scrollY : (el as HTMLElement).scrollTop;
}

export function scrollAppTo(
	options: ScrollToOptions,
	el: Window | HTMLElement | null = getAppScrollElement()
) {
	el?.scrollTo(options);
}

function appScrollHeight(el: Window | HTMLElement): number {
	if (el === window) {
		return document.documentElement.scrollHeight - window.innerHeight;
	}
	return (el as HTMLElement).scrollHeight - (el as HTMLElement).clientHeight;
}

export function appCanScrollTo(y: number, el: Window | HTMLElement | null = getAppScrollElement()): boolean {
	if (!el) return false;
	return appScrollHeight(el) >= y - 2;
}

/** Hide the tab bar while a text field is focused so iOS keyboard does not fight chrome. */
export function useKeyboardOpen() {
	useEffect(() => {
		const root = document.documentElement;
		const sync = () => {
			root.classList.toggle('keyboard-open', isTextEntry(document.activeElement));
		};
		const onFocusOut = () => {
			requestAnimationFrame(sync);
		};
		const onFocusIn = (e: FocusEvent) => {
			sync();
			if (!isTextEntry(e.target) || !(e.target instanceof HTMLElement)) return;
			e.target.scrollIntoView({ block: 'center', inline: 'nearest' });
		};
		sync();
		document.addEventListener('focusin', onFocusIn);
		document.addEventListener('focusout', onFocusOut);
		return () => {
			document.removeEventListener('focusin', onFocusIn);
			document.removeEventListener('focusout', onFocusOut);
			root.classList.remove('keyboard-open');
		};
	}, []);
}
