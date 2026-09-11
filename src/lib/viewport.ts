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
