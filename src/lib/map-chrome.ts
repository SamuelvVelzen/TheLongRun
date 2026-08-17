/** Shared Leaflet map chrome: zoom, fit, fullscreen, scroll/touch polish. */
import type { LeafletGlobal } from '$lib/leaflet';

export type MapChromeHandle = {
	destroy: () => void;
	setFullscreen: (on: boolean) => void;
	isFullscreen: () => boolean;
};

type AttachOpts = {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	map: any;
	wrap: HTMLElement;
	/** Called when user hits “fit” — typically fitBounds of the route(s). */
	onFit: () => void;
};

function isCoarsePointer(): boolean {
	return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
}

/** Shared Leaflet constructor options so phones can keep scrolling the page. */
export function leafletMapOptions() {
	return {
		scrollWheelZoom: false as const,
		zoomControl: false as const,
		attributionControl: true as const,
		dragging: !isCoarsePointer()
	};
}

function iconBtn(label: string, title: string, svg: string): HTMLButtonElement {
	const btn = document.createElement('button');
	btn.type = 'button';
	btn.className = 'map-chrome-btn';
	btn.title = title;
	btn.setAttribute('aria-label', title);
	btn.innerHTML = `<span class="map-chrome-ico" aria-hidden="true">${svg}</span><span class="map-chrome-sr">${label}</span>`;
	return btn;
}

const SVG_PLUS =
	'<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg>';
const SVG_MINUS =
	'<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M5 11h14v2H5z"/></svg>';
const SVG_FIT =
	'<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M3 3h7v2H5v5H3V3zm11 0h7v7h-2V5h-5V3zM3 14h2v5h5v2H3v-7zm16 0h2v7h-7v-2h5v-5z"/></svg>';
/** Diagonal expand arrows — distinct from fit’s corner-brackets, and a bit smaller. */
const SVG_FULL =
	'<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M3 3h7l-2.2 2.2 4.1 4.1-1.4 1.4-4.1-4.1L3 10V3zm18 0v7l-2.2-2.2-4.1 4.1-1.4-1.4 4.1-4.1L14 3h7zM3 21v-7l2.2 2.2 4.1-4.1 1.4 1.4-4.1 4.1L10 21H3zm18 0h-7l2.2-2.2-4.1-4.1 1.4-1.4 4.1 4.1L21 14v7z"/></svg>';
const SVG_EXIT =
	'<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M10 3H3v7l2.2-2.2 4.1 4.1 1.4-1.4-4.1-4.1L10 3zm11 0h-7l2.2 2.2-4.1 4.1 1.4 1.4 4.1-4.1L21 10V3zM3 21h7l-2.2-2.2 4.1-4.1-1.4-1.4-4.1 4.1L3 14v7zm18 0v-7l-2.2 2.2-4.1-4.1-1.4 1.4 4.1 4.1L14 21h7z"/></svg>';

/** Staggered invalidateSize — FS transition / address-bar resize settle slowly. */
const SIZE_REFRESH_MS = [0, 50, 100, 250, 400] as const;

function isNativeFullscreen(el: HTMLElement): boolean {
	const doc = document as Document & { webkitFullscreenElement?: Element | null };
	return document.fullscreenElement === el || doc.webkitFullscreenElement === el;
}

async function enterNativeFullscreen(el: HTMLElement): Promise<boolean> {
	const anyEl = el as HTMLElement & {
		requestFullscreen?: () => Promise<void>;
		webkitRequestFullscreen?: () => void;
	};
	try {
		if (anyEl.requestFullscreen) {
			await anyEl.requestFullscreen();
			return true;
		}
		if (anyEl.webkitRequestFullscreen) {
			anyEl.webkitRequestFullscreen();
			return true;
		}
	} catch {
		/* fall through to CSS fullscreen */
	}
	return false;
}

async function exitNativeFullscreen(): Promise<void> {
	const doc = document as Document & {
		exitFullscreen?: () => Promise<void>;
		webkitExitFullscreen?: () => void;
		webkitFullscreenElement?: Element | null;
	};
	try {
		if (document.fullscreenElement && doc.exitFullscreen) await doc.exitFullscreen();
		else if (doc.webkitFullscreenElement && doc.webkitExitFullscreen) doc.webkitExitFullscreen();
	} catch {
		/* ignore */
	}
}

function viewportSize(): { w: number; h: number } {
	const w = Math.max(window.innerWidth || 0, document.documentElement?.clientWidth || 0);
	const h = Math.max(window.innerHeight || 0, document.documentElement?.clientHeight || 0);
	return { w: Math.max(1, w), h: Math.max(1, h) };
}

/**
 * Root cause of the black-band bug: wrap goes fullscreen (black fills viewport)
 * while the Leaflet container keeps its scoped CSS height (~280–420px / 55vh).
 * Leaflet sizes tiles from offsetWidth/Height — so we MUST set explicit pixels
 * on both wrap and map.getContainer(), not rely on height:100% alone.
 */
function applyFsBox(wrap: HTMLElement, mapEl: HTMLElement, on: boolean, nativeFs: boolean) {
	if (on) {
		const { w, h } = viewportSize();
		wrap.classList.add('is-fullscreen');
		document.documentElement.classList.add('map-fs-active');
		document.body.classList.add('map-fs-active');

		if (!nativeFs) {
			wrap.style.setProperty('position', 'fixed', 'important');
			wrap.style.setProperty('inset', '0', 'important');
			wrap.style.setProperty('top', '0', 'important');
			wrap.style.setProperty('left', '0', 'important');
			wrap.style.setProperty('z-index', '10000', 'important');
		} else {
			wrap.style.removeProperty('position');
			wrap.style.removeProperty('inset');
			wrap.style.removeProperty('top');
			wrap.style.removeProperty('left');
			wrap.style.removeProperty('z-index');
		}

		wrap.style.setProperty('width', `${w}px`, 'important');
		wrap.style.setProperty('height', `${h}px`, 'important');
		wrap.style.setProperty('max-width', 'none', 'important');
		wrap.style.setProperty('max-height', 'none', 'important');
		wrap.style.setProperty('border-radius', '0', 'important');
		wrap.style.setProperty('border', 'none', 'important');
		wrap.style.setProperty('box-sizing', 'border-box', 'important');
		wrap.style.setProperty('background', '#0c100c', 'important');
		wrap.style.setProperty('overflow', 'hidden', 'important');

		mapEl.style.setProperty('display', 'block', 'important');
		mapEl.style.setProperty('width', `${w}px`, 'important');
		mapEl.style.setProperty('height', `${h}px`, 'important');
		mapEl.style.setProperty('min-width', `${w}px`, 'important');
		mapEl.style.setProperty('min-height', `${h}px`, 'important');
		mapEl.style.setProperty('max-width', 'none', 'important');
		mapEl.style.setProperty('max-height', 'none', 'important');
	} else {
		wrap.classList.remove('is-fullscreen');
		document.documentElement.classList.remove('map-fs-active');
		document.body.classList.remove('map-fs-active');

		for (const prop of [
			'position',
			'inset',
			'top',
			'left',
			'z-index',
			'width',
			'height',
			'max-width',
			'max-height',
			'border-radius',
			'border',
			'box-sizing',
			'background',
			'overflow'
		]) {
			wrap.style.removeProperty(prop);
		}
		for (const prop of ['display', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height']) {
			mapEl.style.removeProperty(prop);
		}
	}
}

/**
 * Attach dark/lime map controls and polish scroll-wheel / attribution.
 * Returns a handle for cleanup.
 */
export function attachMapChrome(opts: AttachOpts): MapChromeHandle {
	const { map, wrap, onFit } = opts;
	const mapEl: HTMLElement =
		(typeof map.getContainer === 'function' ? map.getContainer() : null) ??
		(wrap.querySelector('.leaflet-container') as HTMLElement);

	try {
		map.attributionControl?.setPosition?.('bottomleft');
	} catch {
		/* ignore */
	}

	try {
		map.zoomControl?.remove?.();
	} catch {
		/* ignore */
	}

	map.options.scrollWheelZoom = false;
	map.scrollWheelZoom?.disable?.();

	const enableWheel = () => {
		map.scrollWheelZoom?.enable?.();
	};
	const disableWheel = () => {
		map.scrollWheelZoom?.disable?.();
	};

	wrap.addEventListener('pointerdown', enableWheel);
	wrap.addEventListener('mouseleave', disableWheel);
	wrap.addEventListener('focusin', enableWheel);

	const bar = document.createElement('div');
	bar.className = 'map-chrome';
	bar.setAttribute('role', 'toolbar');
	bar.setAttribute('aria-label', 'Map controls');

	const coarse = isCoarsePointer();
	const btnPlus = iconBtn('Zoom in', 'Zoom in', SVG_PLUS);
	const btnMinus = iconBtn('Zoom out', 'Zoom out', SVG_MINUS);
	const btnFit = iconBtn('Fit', 'Fit route', SVG_FIT);
	const btnFull = iconBtn('Fullscreen', 'Fullscreen', SVG_FULL);
	btnFull.classList.add('map-chrome-btn-fs');

	btnPlus.addEventListener('click', (e) => {
		e.stopPropagation();
		map.zoomIn();
	});
	btnMinus.addEventListener('click', (e) => {
		e.stopPropagation();
		map.zoomOut();
	});
	btnFit.addEventListener('click', (e) => {
		e.stopPropagation();
		onFit();
	});

	/** True when using fixed-position CSS fallback (no native FS). */
	let cssFullscreen = false;
	let sizeTimers: ReturnType<typeof setTimeout>[] = [];

	const clearSizeTimers = () => {
		for (const t of sizeTimers) clearTimeout(t);
		sizeTimers = [];
	};

	const syncFullButton = (on: boolean) => {
		btnFull.innerHTML = `<span class="map-chrome-ico" aria-hidden="true">${on ? SVG_EXIT : SVG_FULL}</span><span class="map-chrome-sr">${on ? 'Exit' : 'Fullscreen'}</span>`;
		btnFull.title = on ? 'Exit fullscreen' : 'Fullscreen';
		btnFull.setAttribute('aria-label', btnFull.title);
		btnFull.setAttribute('aria-pressed', on ? 'true' : 'false');
	};

	const isOn = () => isNativeFullscreen(wrap) || cssFullscreen;

	const applyCoarseGestures = (fullscreen: boolean) => {
		if (!coarse || !mapEl) return;
		if (fullscreen) {
			mapEl.style.touchAction = 'none';
			map.dragging?.enable?.();
		} else {
			mapEl.style.touchAction = 'pan-y';
			map.dragging?.disable?.();
		}
	};

	const onTouchStart = (e: TouchEvent) => {
		if (!coarse || !mapEl || isOn()) return;
		if (e.touches.length >= 2) {
			mapEl.style.touchAction = 'none';
			map.dragging?.enable?.();
		} else {
			mapEl.style.touchAction = 'pan-y';
			map.dragging?.disable?.();
		}
	};
	const onTouchEnd = (e: TouchEvent) => {
		if (!coarse || !mapEl || isOn()) return;
		if (e.touches.length < 2) {
			mapEl.style.touchAction = 'pan-y';
			map.dragging?.disable?.();
		}
	};
	if (coarse && mapEl) {
		mapEl.addEventListener('touchstart', onTouchStart, { passive: true });
		mapEl.addEventListener('touchend', onTouchEnd, { passive: true });
		mapEl.addEventListener('touchcancel', onTouchEnd, { passive: true });
		applyCoarseGestures(false);
	}

	const hint = coarse ? document.createElement('p') : null;
	if (hint) {
		hint.className = 'map-gesture-hint';
		hint.textContent = 'Two fingers to pan · tap fullscreen';
		wrap.appendChild(hint);
	}

	const refreshMapSize = (refit: boolean) => {
		const on = isOn();
		if (mapEl) applyFsBox(wrap, mapEl, on, isNativeFullscreen(wrap));
		try {
			map.invalidateSize?.({ animate: false, pan: false });
		} catch {
			try {
				map.invalidateSize?.(false);
			} catch {
				/* ignore */
			}
		}
		if (refit) {
			try {
				onFit();
			} catch {
				/* ignore */
			}
		}
	};

	const scheduleSizeRefresh = (refitLast = true) => {
		clearSizeTimers();
		// Immediate pass so pixels apply before paint
		refreshMapSize(false);
		for (let i = 0; i < SIZE_REFRESH_MS.length; i++) {
			const ms = SIZE_REFRESH_MS[i];
			const isLast = i === SIZE_REFRESH_MS.length - 1;
			sizeTimers.push(
				setTimeout(() => {
					refreshMapSize(refitLast && isLast);
				}, ms)
			);
		}
	};

	const afterFullscreenChange = () => {
		const on = isOn();
		if (mapEl) applyFsBox(wrap, mapEl, on, isNativeFullscreen(wrap));
		syncFullButton(on);
		applyCoarseGestures(on);
		scheduleSizeRefresh(on);
	};

	const applyFullscreen = async (wantOn: boolean) => {
		if (wantOn) {
			const ok = await enterNativeFullscreen(wrap);
			cssFullscreen = !ok;
			if (mapEl) applyFsBox(wrap, mapEl, true, ok);
			syncFullButton(true);
			applyCoarseGestures(true);
			scheduleSizeRefresh(true);
		} else {
			cssFullscreen = false;
			if (mapEl) applyFsBox(wrap, mapEl, false, false);
			await exitNativeFullscreen();
			syncFullButton(false);
			applyCoarseGestures(false);
			scheduleSizeRefresh(false);
		}
	};

	btnFull.addEventListener('click', (e) => {
		e.stopPropagation();
		void applyFullscreen(!isOn());
	});

	const onFsEvent = () => {
		if (!isNativeFullscreen(wrap) && !cssFullscreen) {
			// Esc exited native FS
			if (mapEl) applyFsBox(wrap, mapEl, false, false);
			syncFullButton(false);
			applyCoarseGestures(false);
			scheduleSizeRefresh(false);
			return;
		}
		afterFullscreenChange();
	};
	document.addEventListener('fullscreenchange', onFsEvent);
	document.addEventListener('webkitfullscreenchange', onFsEvent);

	const onResize = () => {
		if (isOn()) scheduleSizeRefresh(false);
	};
	window.addEventListener('resize', onResize);

	const onKey = (e: KeyboardEvent) => {
		if (e.key === 'Escape' && cssFullscreen) void applyFullscreen(false);
	};
	window.addEventListener('keydown', onKey);

	bar.append(btnPlus, btnMinus, btnFull, btnFit);
	wrap.appendChild(bar);

	return {
		destroy: () => {
			clearSizeTimers();
			window.removeEventListener('keydown', onKey);
			window.removeEventListener('resize', onResize);
			document.removeEventListener('fullscreenchange', onFsEvent);
			document.removeEventListener('webkitfullscreenchange', onFsEvent);
			wrap.removeEventListener('pointerdown', enableWheel);
			wrap.removeEventListener('mouseleave', disableWheel);
			wrap.removeEventListener('focusin', enableWheel);
			if (mapEl) {
				mapEl.removeEventListener('touchstart', onTouchStart);
				mapEl.removeEventListener('touchend', onTouchEnd);
				mapEl.removeEventListener('touchcancel', onTouchEnd);
				mapEl.style.removeProperty('touch-action');
			}
			hint?.remove();
			bar.remove();
			if (mapEl) applyFsBox(wrap, mapEl, false, false);
			if (isNativeFullscreen(wrap)) void exitNativeFullscreen();
		},
		setFullscreen: (on) => {
			void applyFullscreen(on);
		},
		isFullscreen: () => isOn()
	};
}

/** Create a small km-marker DivIcon for the detail map. */
export function kmMarkerIcon(L: LeafletGlobal, km: number) {
	return L.divIcon({
		className: 'km-marker',
		html: `<span class="km-marker-pill">${km}</span>`,
		iconSize: [22, 22],
		iconAnchor: [11, 11]
	});
}
