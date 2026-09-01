export const THEME_STORAGE_KEY = 'tlr-theme';
export const THEME_EVENT = 'themechange';

export type Theme = 'light' | 'dark';

const DARK_THEME_COLOR = '#10140f';
const LIGHT_THEME_COLOR = '#f3f6ef';

export function isTheme(value: unknown): value is Theme {
	return value === 'light' || value === 'dark';
}

export function readStoredTheme(): Theme | null {
	try {
		const raw = localStorage.getItem(THEME_STORAGE_KEY);
		return isTheme(raw) ? raw : null;
	} catch {
		return null;
	}
}

export function getTheme(): Theme {
	return readStoredTheme() ?? 'dark';
}

function syncThemeMeta(theme: Theme) {
	const color = theme === 'light' ? LIGHT_THEME_COLOR : DARK_THEME_COLOR;
	const themeColor = document.querySelector('meta[name="theme-color"]');
	if (themeColor) themeColor.setAttribute('content', color);
	const scheme = document.querySelector('meta[name="color-scheme"]');
	if (scheme) scheme.setAttribute('content', theme);
}

export function applyTheme(theme: Theme) {
	const root = document.documentElement;
	root.dataset.theme = theme;
	root.style.colorScheme = theme;
	syncThemeMeta(theme);
	try {
		localStorage.setItem(THEME_STORAGE_KEY, theme);
	} catch {
		/* private mode */
	}
	window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: theme }));
}

export function toggleTheme(): Theme {
	const next: Theme = getTheme() === 'dark' ? 'light' : 'dark';
	applyTheme(next);
	return next;
}

/** Inline head script — runs before paint so a stored light theme does not flash dark. */
export function themeInitScript(): string {
	return `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var t=localStorage.getItem(k);if(t!=='light'&&t!=='dark')t='dark';var d=document.documentElement;d.dataset.theme=t;d.style.colorScheme=t;var c=t==='light'?${JSON.stringify(LIGHT_THEME_COLOR)}:${JSON.stringify(DARK_THEME_COLOR)};var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',c);var s=document.querySelector('meta[name="color-scheme"]');if(s)s.setAttribute('content',t);}catch(e){document.documentElement.dataset.theme='dark';document.documentElement.style.colorScheme='dark';}})();`;
}

export function cssColor(name: string, fallback: string): string {
	if (typeof document === 'undefined') return fallback;
	const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
	return value || fallback;
}
