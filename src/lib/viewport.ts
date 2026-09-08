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

function applyChromeViewport() {
	const root = document.documentElement;
	const vv = window.visualViewport;
	const inputOpen = isTextEntry(document.activeElement);
	let top = 0;
	let bottom = 0;
	if (inputOpen && vv) {
		top = Math.max(0, vv.offsetTop);
		bottom = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
	}
	root.style.setProperty('--vv-offset-top', `${Math.round(top)}px`);
	root.style.setProperty('--vv-offset-bottom', `${Math.round(bottom)}px`);
	root.classList.toggle('keyboard-open', inputOpen && bottom > 40);
}

/** Keep fixed header/tab bar glued to the visual viewport while the keyboard is open. */
export function useVisualViewportChrome() {
	useEffect(() => {
		const root = document.documentElement;
		let raf = 0;
		const apply = () => applyChromeViewport();
		const applySoon = () => {
			cancelAnimationFrame(raf);
			raf = requestAnimationFrame(apply);
		};
		const onFocusOut = () => applySoon();

		apply();
		const vv = window.visualViewport;
		vv?.addEventListener('resize', applySoon);
		vv?.addEventListener('scroll', applySoon);
		window.addEventListener('resize', applySoon);
		window.addEventListener('scroll', applySoon, { passive: true });
		window.addEventListener('orientationchange', applySoon);
		document.addEventListener('focusin', apply);
		document.addEventListener('focusout', onFocusOut);
		return () => {
			cancelAnimationFrame(raf);
			vv?.removeEventListener('resize', applySoon);
			vv?.removeEventListener('scroll', applySoon);
			window.removeEventListener('resize', applySoon);
			window.removeEventListener('scroll', applySoon);
			window.removeEventListener('orientationchange', applySoon);
			document.removeEventListener('focusin', apply);
			document.removeEventListener('focusout', onFocusOut);
			root.style.removeProperty('--vv-offset-top');
			root.style.removeProperty('--vv-offset-bottom');
			root.classList.remove('keyboard-open');
		};
	}, []);
}
