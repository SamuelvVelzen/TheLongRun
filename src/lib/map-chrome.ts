/** Shared Leaflet map chrome: zoom, fit, fullscreen, scroll/touch polish. */
import type { LeafletGlobal } from '$lib/leaflet';
import {
	LIVE_LOCATION_PING_MS,
	LIVE_SHARE_EVENT,
	liveShareAuthed,
	liveShareOn,
	requestLiveShare,
	type LiveLocationPing
} from '$lib/live-location';
import { getLiveLocation } from '$lib/server/functions';
import { cssColor, getTheme, THEME_EVENT } from '$lib/theme';

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
	/** One-finger pan on phones (waypoint editor). Default keeps page-scroll until two fingers / fullscreen. */
	alwaysPan?: boolean;
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
		dragging: !isCoarsePointer(),
		// MapLibre GL Leaflet desyncs at world zoom; keep a floor.
		minZoom: 1 as const
	};
}

const OPENFREEMAP_DARK = 'https://tiles.openfreemap.org/styles/dark';
const OPENFREEMAP_LIGHT = 'https://tiles.openfreemap.org/styles/liberty';
const OPENFREEMAP_ATTR =
	'<a href="https://openfreemap.org/" target="_blank" rel="noreferrer">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">&copy; OpenMapTiles</a> <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">&copy; OpenStreetMap</a>';

/** OpenFreeMap “dark” is near-black at street zoom — lift paint so roads and names stay readable. */
const NAV_PAINT: Record<string, Record<string, unknown>> = {
	background: { 'background-color': '#2a322a' },
	water: { 'fill-color': '#2c4048' },
	waterway: { 'line-color': '#2c4048' },
	water_name: { 'text-color': '#b7cdd4', 'text-halo-color': 'rgba(16,20,15,0.85)' },
	landuse_residential: { 'fill-color': '#323a32', 'fill-opacity': 0.7 },
	landuse_park: { 'fill-color': '#3a4a3c' },
	landcover_wood: { 'fill-color': '#344338' },
	landcover_ice_shelf: { 'fill-color': '#2a322a' },
	landcover_glacier: { 'fill-color': '#3a4242' },
	building: { 'fill-color': '#3e463e', 'fill-outline-color': '#5a6458' },
	highway_path: { 'line-color': '#7a8474', 'line-opacity': 0.9 },
	highway_minor: { 'line-color': '#8a9488', 'line-opacity': 1 },
	highway_major_casing: { 'line-color': '#4e564e' },
	highway_major_inner: { 'line-color': '#b0b8ac' },
	highway_major_subtle: { 'line-color': '#8a9488' },
	highway_motorway_casing: { 'line-color': '#5a6258' },
	highway_motorway_inner: { 'line-color': '#c0c6ba' },
	highway_motorway_subtle: { 'line-color': '#8a9488' },
	highway_name_other: {
		'text-color': '#f4f6f0',
		'text-halo-color': 'rgba(16,20,15,0.92)',
		'text-halo-width': 1.6
	},
	highway_name_motorway: { 'text-color': '#e8ece2' },
	place_other: { 'text-color': '#e0e4da', 'text-halo-color': 'rgba(16,20,15,0.85)' },
	place_suburb: { 'text-color': '#e0e4da', 'text-halo-color': 'rgba(16,20,15,0.85)' },
	place_village: { 'text-color': '#e0e4da', 'text-halo-color': 'rgba(16,20,15,0.85)' },
	place_town: { 'text-color': '#e8ece2', 'text-halo-color': 'rgba(16,20,15,0.85)' },
	place_city: { 'text-color': '#f4f6f0', 'text-halo-color': 'rgba(16,20,15,0.85)' },
	place_city_large: { 'text-color': '#f4f6f0', 'text-halo-color': 'rgba(16,20,15,0.85)' },
	place_state: { 'text-color': '#e0e4da', 'text-halo-color': 'rgba(16,20,15,0.85)' },
	place_country_other: { 'text-color': '#e0e4da' },
	place_country_minor: { 'text-color': '#e0e4da' },
	place_country_major: { 'text-color': '#e8ece2' },
	railway: { 'line-color': '#6a7468' },
	railway_transit: { 'line-color': '#6a7468' },
	railway_minor: { 'line-color': '#6a7468' }
};

const NAV_LAYOUT: Record<string, Record<string, unknown>> = {
	highway_name_other: { 'text-size': 13 }
};

function basemapStyle(): string {
	return getTheme() === 'light' ? OPENFREEMAP_LIGHT : OPENFREEMAP_DARK;
}

/**
 * OpenFreeMap vector tiles via MapLibre GL Leaflet. No API key.
 * Street-level paint is lifted on the dark style so roads stay readable on a phone.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function glFromLayer(layer: any) {
	return layer?.getMaplibreMap?.() ?? layer?._glMap ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function addBasemap(L: LeafletGlobal, map: any) {
	if (typeof L.maplibreGL !== 'function') {
		throw new Error('MapLibre GL Leaflet failed to load');
	}
	const layer = L.maplibreGL({
		style: basemapStyle(),
		attribution: OPENFREEMAP_ATTR
	}).addTo(map);

	const paintWhenReady = (attempt = 0) => {
		if (getTheme() === 'light') return;
		const gl = glFromLayer(layer);
		if (gl?.getLayer?.('highway_name_other')) {
			applyNavigablePaint(gl);
			return;
		}
		if (attempt < 80) setTimeout(() => paintWhenReady(attempt + 1), 50);
	};
	paintWhenReady();
	glFromLayer(layer)?.on?.('style.load', () => {
		if (getTheme() === 'light') return;
		applyNavigablePaint(glFromLayer(layer));
	});

	const onTheme = () => {
		const gl = glFromLayer(layer);
		if (!gl?.setStyle) return;
		gl.setStyle(basemapStyle());
		gl.once?.('style.load', () => {
			if (getTheme() !== 'light') applyNavigablePaint(gl);
			try {
				layer.bringToBack?.();
			} catch {
				/* ignore */
			}
		});
	};
	window.addEventListener(THEME_EVENT, onTheme);
	map.on?.('unload', () => window.removeEventListener(THEME_EVENT, onTheme));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyNavigablePaint(gl: any) {
	if (!gl?.getLayer) return;
	for (const [id, paint] of Object.entries(NAV_PAINT)) {
		if (!gl.getLayer(id)) continue;
		for (const [prop, value] of Object.entries(paint)) {
			try {
				gl.setPaintProperty(id, prop, value);
			} catch {
				/* layer or property not in this style */
			}
		}
	}
	for (const [id, layout] of Object.entries(NAV_LAYOUT)) {
		if (!gl.getLayer(id)) continue;
		for (const [prop, value] of Object.entries(layout)) {
			try {
				gl.setLayoutProperty(id, prop, value);
			} catch {
				/* ignore */
			}
		}
	}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resizeMaplibreLayers(map: any) {
	try {
		map.eachLayer?.((layer: { getMaplibreMap?: () => { resize?: () => void } }) => {
			layer.getMaplibreMap?.()?.resize?.();
		});
	} catch {
		/* ignore */
	}
}

function iconBtn(label: string, title: string, svg: string): HTMLButtonElement {
	const btn = document.createElement('button');
	btn.type = 'button';
	btn.className =
		'map-chrome-btn inline-flex items-center justify-center size-11 min-w-11 min-h-11 p-0 rounded-[10px] border border-line bg-surface/90 text-fg cursor-pointer shadow-lift transition-colors duration-150 hover:border-accent/45 hover:text-accent-fg active:border-accent/45 active:text-accent-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2';
	btn.title = title;
	btn.setAttribute('aria-label', title);
	btn.style.touchAction = 'manipulation';
	btn.innerHTML = `<span class="map-chrome-ico flex leading-[0]" aria-hidden="true">${svg}</span><span class="sr-only">${label}</span>`;
	return btn;
}

function textBtn(label: string, title: string): HTMLButtonElement {
	const btn = document.createElement('button');
	btn.type = 'button';
	btn.className =
		'map-chrome-text appearance-none inline-flex items-center justify-center min-h-11 px-[0.85rem] py-2 border-0 border-r border-line last:border-r-0 rounded-none bg-transparent text-muted text-[0.72rem] font-semibold font-inherit cursor-pointer shrink-0 whitespace-nowrap transition-[color,background-color] duration-150 ease-out hover:text-fg hover:bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] aria-[pressed=true]:text-accent-ink! aria-[pressed=true]:bg-accent! aria-[pressed=true]:font-semibold max-sm:min-w-11 max-sm:px-[0.9rem] max-sm:text-[0.8rem]';
	btn.textContent = label;
	btn.title = title;
	btn.setAttribute('aria-label', title);
	btn.style.touchAction = 'manipulation';
	return btn;
}

const SVG_PLUS =
	'<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg>';
const SVG_MINUS =
	'<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M5 11h14v2H5z"/></svg>';
const SVG_LOCATE =
	'<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0-6a1 1 0 0 1 1 1v1.07A8.001 8.001 0 0 1 20.93 11H22a1 1 0 1 1 0 2h-1.07A8.001 8.001 0 0 1 13 20.93V22a1 1 0 1 1-2 0v-1.07A8.001 8.001 0 0 1 11 3.07V2a1 1 0 0 1 1-1zm0 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12z"/></svg>';

/** Staggered invalidateSize — FS transition / address-bar resize settle slowly. */
const SIZE_REFRESH_MS = [0, 50, 100, 250, 400] as const;
/** Native Fullscreen API can hang on WebKit; never block the CSS overlay on this. */
const NATIVE_FS_TIMEOUT_MS = 350;

function isNativeFullscreen(el: HTMLElement): boolean {
	const doc = document as Document & { webkitFullscreenElement?: Element | null };
	return document.fullscreenElement === el || doc.webkitFullscreenElement === el;
}

/**
 * iPhone/iPad Safari expose requestFullscreen() but it no-ops, rejects, or hangs
 * for non-video elements. Coarse pointers always use the CSS overlay instead.
 */
function nativeFullscreenSupported(): boolean {
	if (typeof document === 'undefined') return false;
	if (isCoarsePointer()) return false;
	const doc = document as Document & { webkitFullscreenEnabled?: boolean };
	return !!(document.fullscreenEnabled || doc.webkitFullscreenEnabled);
}

function withTimeout(promise: Promise<void>, ms: number): Promise<void> {
	return new Promise((resolve, reject) => {
		const id = window.setTimeout(() => reject(new Error('fs-timeout')), ms);
		promise.then(
			() => {
				clearTimeout(id);
				resolve();
			},
			(err) => {
				clearTimeout(id);
				reject(err);
			}
		);
	});
}

async function enterNativeFullscreen(el: HTMLElement): Promise<boolean> {
	if (!nativeFullscreenSupported()) return false;
	const anyEl = el as HTMLElement & {
		requestFullscreen?: () => Promise<void>;
		webkitRequestFullscreen?: () => void;
	};
	try {
		if (anyEl.requestFullscreen) {
			await withTimeout(anyEl.requestFullscreen(), NATIVE_FS_TIMEOUT_MS);
		} else if (anyEl.webkitRequestFullscreen) {
			anyEl.webkitRequestFullscreen();
		} else {
			return false;
		}
	} catch {
		return false;
	}
	return isNativeFullscreen(el);
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

function viewportBox(): { w: number; h: number; top: number; left: number } {
	const vv = window.visualViewport;
	if (vv && vv.width > 0 && vv.height > 0) {
		return {
			w: Math.max(1, Math.round(vv.width)),
			h: Math.max(1, Math.round(vv.height)),
			top: Math.round(vv.offsetTop),
			left: Math.round(vv.offsetLeft)
		};
	}
	const w = Math.max(window.innerWidth || 0, document.documentElement?.clientWidth || 0);
	const h = Math.max(window.innerHeight || 0, document.documentElement?.clientHeight || 0);
	return { w: Math.max(1, w), h: Math.max(1, h), top: 0, left: 0 };
}

/**
 * Root cause of the black-band bug: wrap goes fullscreen (black fills viewport)
 * while the Leaflet container keeps its scoped CSS height (~280–420px / 55vh).
 * Leaflet sizes tiles from offsetWidth/Height — so we MUST set explicit pixels
 * on both wrap and map.getContainer(), not rely on height:100% alone.
 */
function applyFsBox(wrap: HTMLElement, mapEl: HTMLElement, on: boolean, nativeFs: boolean) {
	if (on) {
		const { w, h, top, left } = viewportBox();
		wrap.classList.add('is-fullscreen');
		document.documentElement.classList.add('map-fs-active');
		document.body.classList.add('map-fs-active');

		if (!nativeFs) {
			wrap.style.setProperty('position', 'fixed', 'important');
			wrap.style.setProperty('top', `${top}px`, 'important');
			wrap.style.setProperty('left', `${left}px`, 'important');
			wrap.style.setProperty('right', 'auto', 'important');
			wrap.style.setProperty('bottom', 'auto', 'important');
			wrap.style.setProperty('inset', 'auto', 'important');
			wrap.style.setProperty('z-index', '10000', 'important');
			wrap.style.setProperty('margin', '0', 'important');
		} else {
			for (const prop of ['position', 'inset', 'top', 'left', 'right', 'bottom', 'z-index', 'margin']) {
				wrap.style.removeProperty(prop);
			}
		}

		wrap.style.setProperty('width', `${w}px`, 'important');
		wrap.style.setProperty('height', `${h}px`, 'important');
		wrap.style.setProperty('max-width', 'none', 'important');
		wrap.style.setProperty('max-height', 'none', 'important');
		wrap.style.setProperty('border-radius', '0', 'important');
		wrap.style.setProperty('border', 'none', 'important');
		wrap.style.setProperty('box-sizing', 'border-box', 'important');
		wrap.style.setProperty('background', cssColor('--map-bg', '#0c100c'), 'important');
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
			'right',
			'bottom',
			'z-index',
			'margin',
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
	const { map, wrap, onFit, alwaysPan } = opts;
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
	bar.className =
		'map-chrome absolute z-[1100] top-[0.65rem] right-[0.65rem] flex flex-col items-end gap-[0.35rem] pointer-events-auto max-sm:top-2 max-sm:right-2 max-sm:gap-[0.3rem]';
	bar.setAttribute('role', 'toolbar');
	bar.setAttribute('aria-label', 'Map controls');

	const coarse = isCoarsePointer();
	const btnPlus = iconBtn('Zoom in', 'Zoom in', SVG_PLUS);
	const btnMinus = iconBtn('Zoom out', 'Zoom out', SVG_MINUS);
	const btnFit = textBtn('Fit', 'Fit route');
	const btnLocate = iconBtn('My location', 'My location', SVG_LOCATE);
	const btnFull = textBtn('Fullscreen', 'Fullscreen');
	btnFull.classList.add('map-chrome-btn-fs');
	btnLocate.classList.add('map-chrome-btn-loc');
	const btnShare = liveShareAuthed() ? textBtn('Share', 'Share live location on the map') : null;
	if (btnShare) btnShare.classList.add('map-chrome-btn-share');

	const texts = document.createElement('div');
	texts.className =
		'map-chrome-texts inline-flex w-fit overflow-hidden border border-line rounded-full bg-surface/90 shadow-lift';
	texts.append(btnFit, btnFull);
	if (btnShare) texts.append(btnShare);

	const icons = document.createElement('div');
	icons.className = 'map-chrome-zoom flex flex-col gap-[0.35rem] max-sm:gap-[0.3rem]';
	icons.append(btnPlus, btnMinus, btnLocate);

	btnPlus.addEventListener('click', (e) => {
		e.stopPropagation();
		map.zoomIn();
	});
	btnMinus.addEventListener('click', (e) => {
		e.stopPropagation();
		map.zoomOut();
	});

	/** True when using fixed-position CSS fallback (no native FS). */
	let cssFullscreen = false;
	let placeholder: HTMLDivElement | null = null;
	let sizeTimers: ReturnType<typeof setTimeout>[] = [];
	let locFollow = false;
	let locPanNext = false;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let locMarker: any = null;
	let beginFollow = () => {
		locFollow = true;
		locPanNext = true;
	};

	const clearSizeTimers = () => {
		for (const t of sizeTimers) clearTimeout(t);
		sizeTimers = [];
	};

	const syncFullButton = (on: boolean) => {
		btnFull.textContent = on ? 'Exit' : 'Fullscreen';
		btnFull.title = on ? 'Exit fullscreen' : 'Fullscreen';
		btnFull.setAttribute('aria-label', btnFull.title);
		btnFull.setAttribute('aria-pressed', on ? 'true' : 'false');
	};

	const syncShareButton = () => {
		if (!btnShare) return;
		const on = liveShareOn();
		btnShare.textContent = on ? 'Sharing' : 'Share';
		btnShare.title = on ? 'Stop sharing live location' : 'Share live location on the map';
		btnShare.setAttribute('aria-label', btnShare.title);
		btnShare.setAttribute('aria-pressed', on ? 'true' : 'false');
	};
	syncShareButton();

	const isOn = () => isNativeFullscreen(wrap) || cssFullscreen;

	const panToLocation = (animate: boolean) => {
		if (!locMarker) return false;
		const here = locMarker.getLatLng?.();
		if (!here) return false;
		const z = map.getZoom?.() ?? 15;
		map.setView(here, Math.max(z, 15), { animate });
		return true;
	};

	/** Lift wrap to <body> so position:fixed is not trapped by the shell / overflow-x: clip. */
	const parkWrap = () => {
		if (placeholder || !wrap.parentNode) return;
		placeholder = document.createElement('div');
		placeholder.className = 'map-fs-placeholder';
		placeholder.setAttribute('aria-hidden', 'true');
		const rect = wrap.getBoundingClientRect();
		placeholder.style.height = `${Math.max(1, Math.round(rect.height))}px`;
		wrap.parentNode.insertBefore(placeholder, wrap);
		document.body.appendChild(wrap);
	};

	const restoreWrap = () => {
		if (!placeholder) return;
		placeholder.parentNode?.insertBefore(wrap, placeholder);
		placeholder.remove();
		placeholder = null;
	};

	const applyCoarseGestures = (fullscreen: boolean) => {
		if (!coarse || !mapEl) return;
		if (alwaysPan || fullscreen) {
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
	if (coarse && mapEl && !alwaysPan) {
		mapEl.addEventListener('touchstart', onTouchStart, { passive: true });
		mapEl.addEventListener('touchend', onTouchEnd, { passive: true });
		mapEl.addEventListener('touchcancel', onTouchEnd, { passive: true });
		applyCoarseGestures(false);
	} else if (alwaysPan) {
		map.dragging?.enable?.();
		if (mapEl) mapEl.style.touchAction = 'none';
	}

	const hint = coarse && !alwaysPan ? document.createElement('button') : null;
	if (hint) {
		hint.type = 'button';
		hint.className =
			'map-gesture-hint hidden [@media(pointer:coarse)]:block absolute z-[1100] left-1/2 bottom-[max(1.85rem,env(safe-area-inset-bottom,0px))] -translate-x-1/2 m-0 px-[0.7rem] py-[0.45rem] min-h-11 rounded-full appearance-none bg-[rgba(16,20,15,0.88)] border border-line text-muted text-[0.72rem] font-semibold font-inherit pointer-events-auto cursor-pointer whitespace-nowrap max-w-[calc(100%-5.5rem)] overflow-hidden text-ellipsis';
		hint.textContent = 'Two fingers to pan · tap for fullscreen';
		hint.title = 'Fullscreen';
		hint.setAttribute('aria-label', 'Open map fullscreen');
		wrap.appendChild(hint);
	}

	const refreshMapSize = (mode: 'keep' | 'follow' = 'keep') => {
		const on = isOn();
		const center = map.getCenter?.();
		const zoom = map.getZoom?.();
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
		resizeMaplibreLayers(map);
		if (mode === 'follow' && panToLocation(false)) return;
		if (center) {
			try {
				map.setView(center, zoom, { animate: false });
			} catch {
				/* ignore */
			}
		}
	};

	const scheduleSizeRefresh = (mode: 'keep' | 'follow' = 'keep') => {
		clearSizeTimers();
		// Immediate pass so pixels apply before paint
		refreshMapSize('keep');
		for (let i = 0; i < SIZE_REFRESH_MS.length; i++) {
			const ms = SIZE_REFRESH_MS[i];
			const isLast = i === SIZE_REFRESH_MS.length - 1;
			sizeTimers.push(
				setTimeout(() => {
					refreshMapSize(isLast ? mode : 'keep');
				}, ms)
			);
		}
	};

	const afterFullscreenChange = () => {
		const on = isOn();
		if (mapEl) applyFsBox(wrap, mapEl, on, isNativeFullscreen(wrap));
		syncFullButton(on);
		applyCoarseGestures(on);
		if (on) {
			beginFollow();
			scheduleSizeRefresh('follow');
		} else {
			locFollow = false;
			scheduleSizeRefresh('keep');
		}
	};

	const applyFullscreen = async (wantOn: boolean) => {
		if (wantOn) {
			beginFollow();
			// CSS overlay first on phones so a hanging requestFullscreen() cannot no-op the tap.
			if (!nativeFullscreenSupported()) {
				cssFullscreen = true;
				parkWrap();
				if (mapEl) applyFsBox(wrap, mapEl, true, false);
				syncFullButton(true);
				applyCoarseGestures(true);
				scheduleSizeRefresh('follow');
				return;
			}
			const ok = await enterNativeFullscreen(wrap);
			cssFullscreen = !ok;
			if (cssFullscreen) parkWrap();
			else restoreWrap();
			if (mapEl) applyFsBox(wrap, mapEl, true, ok);
			syncFullButton(true);
			applyCoarseGestures(true);
			scheduleSizeRefresh('follow');
		} else {
			locFollow = false;
			cssFullscreen = false;
			if (mapEl) applyFsBox(wrap, mapEl, false, false);
			restoreWrap();
			await exitNativeFullscreen();
			syncFullButton(false);
			applyCoarseGestures(false);
			scheduleSizeRefresh('keep');
		}
	};

	btnFull.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		void applyFullscreen(!isOn());
	});
	hint?.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		if (!isOn()) void applyFullscreen(true);
	});

	const onFsEvent = () => {
		const native = isNativeFullscreen(wrap);
		if (native) {
			cssFullscreen = false;
			restoreWrap();
			afterFullscreenChange();
			return;
		}
		// Native FS ended. Keep the CSS overlay if we are using it (e.g. iOS fake-success).
		if (cssFullscreen) {
			afterFullscreenChange();
			return;
		}
		if (mapEl) applyFsBox(wrap, mapEl, false, false);
		restoreWrap();
		syncFullButton(false);
		applyCoarseGestures(false);
		locFollow = false;
		scheduleSizeRefresh('keep');
	};
	document.addEventListener('fullscreenchange', onFsEvent);
	document.addEventListener('webkitfullscreenchange', onFsEvent);
	document.addEventListener('fullscreenerror', onFsEvent);
	document.addEventListener('webkitfullscreenerror', onFsEvent);

	const onResize = () => {
		if (isOn()) scheduleSizeRefresh(locFollow ? 'follow' : 'keep');
	};
	window.addEventListener('resize', onResize);
	window.visualViewport?.addEventListener('resize', onResize);
	window.visualViewport?.addEventListener('scroll', onResize);

	const onKey = (e: KeyboardEvent) => {
		if (e.key === 'Escape' && cssFullscreen) void applyFullscreen(false);
	};
	window.addEventListener('keydown', onKey);

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const L = (typeof window !== 'undefined' ? window.L : null) as LeafletGlobal | null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let locAccuracy: any = null;
	let locWatch: number | null = null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let liveMarker: any = null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let liveAccuracy: any = null;
	let liveTimer: ReturnType<typeof setInterval> | null = null;

	const setLocateActive = (on: boolean) => {
		btnLocate.classList.toggle('is-active', on);
		btnLocate.setAttribute('aria-pressed', on ? 'true' : 'false');
	};

	const stopLocate = () => {
		if (locWatch != null && navigator.geolocation) {
			navigator.geolocation.clearWatch(locWatch);
			locWatch = null;
		}
		locMarker?.remove?.();
		locAccuracy?.remove?.();
		locMarker = null;
		locAccuracy = null;
		locFollow = false;
		setLocateActive(false);
	};

	const startLocate = (pan: boolean) => {
		if (!navigator.geolocation) {
			btnLocate.title = 'Location is not available in this browser';
			return;
		}
		if (!L) {
			btnLocate.title = 'Map is still loading';
			return;
		}
		locPanNext = pan;
		if (locWatch != null) {
			if ((pan || locFollow) && locMarker) panToLocation(true);
			return;
		}
		locWatch = navigator.geolocation.watchPosition(
			(pos) => {
				const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
				const acc = Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : 0;
				if (!locMarker) {
					locMarker = L.marker(latlng, {
						icon: userLocationIcon(L),
						keyboard: false,
						interactive: false,
						zIndexOffset: 1200
					}).addTo(map);
					locAccuracy = L.circle(latlng, {
						radius: Math.max(12, acc),
						color: cssColor('--loc', '#4da3ff'),
						weight: 1,
						fillColor: cssColor('--loc', '#4da3ff'),
						fillOpacity: 0.14,
						interactive: false
					}).addTo(map);
				} else {
					locMarker.setLatLng(latlng);
					locAccuracy?.setLatLng?.(latlng);
					if (acc > 0) locAccuracy?.setRadius?.(acc);
				}
				setLocateActive(true);
				btnLocate.title = 'My location';
				if (locFollow) {
					const z = map.getZoom?.() ?? 15;
					if (locPanNext) {
						map.setView(latlng, Math.max(z, 15), { animate: true });
						locPanNext = false;
					} else {
						map.panTo(latlng, { animate: true });
					}
				} else if (locPanNext) {
					map.setView(latlng, Math.max(map.getZoom?.() ?? 14, 15));
					locPanNext = false;
				}
			},
			(err) => {
				btnLocate.title =
					err.code === 1 ? 'Location permission denied' : 'Could not find your location';
				if (!locMarker) stopLocate();
			},
			{ enableHighAccuracy: true, maximumAge: 4000, timeout: 20000 }
		);
	};

	beginFollow = () => {
		locFollow = true;
		startLocate(true);
	};

	btnFit.addEventListener('click', (e) => {
		e.stopPropagation();
		locFollow = false;
		onFit();
	});
	btnLocate.addEventListener('click', (e) => {
		e.stopPropagation();
		locFollow = isOn();
		startLocate(true);
	});
	btnShare?.addEventListener(
		'click',
		(e) => {
			e.preventDefault();
			e.stopPropagation();
			requestLiveShare(!liveShareOn());
		},
		true
	);

	const onShareEvent = () => {
		syncShareButton();
	};
	window.addEventListener(LIVE_SHARE_EVENT, onShareEvent);

	try {
		void navigator.permissions?.query?.({ name: 'geolocation' as PermissionName }).then((status) => {
			if (status.state === 'granted') startLocate(false);
		});
	} catch {
		/* ignore */
	}

	const clearLiveMarker = () => {
		liveMarker?.remove?.();
		liveAccuracy?.remove?.();
		liveMarker = null;
		liveAccuracy = null;
	};

	const nearOwnLocation = (lat: number, lng: number) => {
		if (!locMarker) return false;
		const here = locMarker.getLatLng?.();
		if (!here) return false;
		const dlat = here.lat - lat;
		const dlng = here.lng - lng;
		return dlat * dlat + dlng * dlng < 4e-7;
	};

	const showLivePing = (ping: LiveLocationPing | null) => {
		if (!L || !ping || nearOwnLocation(ping.lat, ping.lng)) {
			clearLiveMarker();
			return;
		}
		const latlng = L.latLng(ping.lat, ping.lng);
		const acc = ping.accuracy && ping.accuracy > 0 ? ping.accuracy : 0;
		const tip = `Live · ${liveAgo(ping.updatedAt)}`;
		if (!liveMarker) {
			liveMarker = L.marker(latlng, {
				icon: liveLocationIcon(L),
				keyboard: false,
				zIndexOffset: 1100
			})
				.bindTooltip(tip, { direction: 'top', offset: [0, -12] })
				.addTo(map);
			liveAccuracy = L.circle(latlng, {
				radius: Math.max(18, acc),
				color: cssColor('--accent', '#c8f25a'),
				weight: 1,
				fillColor: cssColor('--accent', '#c8f25a'),
				fillOpacity: 0.12,
				interactive: false
			}).addTo(map);
		} else {
			liveMarker.setLatLng(latlng);
			liveMarker.setTooltipContent?.(tip);
			liveAccuracy?.setLatLng?.(latlng);
			if (acc > 0) liveAccuracy?.setRadius?.(acc);
		}
	};

	const pollLive = () => {
		void getLiveLocation()
			.then((ping) => {
				showLivePing(ping);
			})
			.catch(() => {
				/* ignore — map still works without the ping */
			});
	};
	pollLive();
	liveTimer = setInterval(pollLive, LIVE_LOCATION_PING_MS);

	try {
		L?.DomEvent?.disableClickPropagation?.(bar);
		L?.DomEvent?.disableScrollPropagation?.(bar);
		if (hint) {
			L?.DomEvent?.disableClickPropagation?.(hint);
			L?.DomEvent?.disableScrollPropagation?.(hint);
		}
	} catch {
		/* ignore */
	}

	bar.append(texts);
	bar.append(icons);
	wrap.appendChild(bar);

	return {
		destroy: () => {
			stopLocate();
			clearLiveMarker();
			if (liveTimer != null) clearInterval(liveTimer);
			window.removeEventListener(LIVE_SHARE_EVENT, onShareEvent);
			clearSizeTimers();
			window.removeEventListener('keydown', onKey);
			window.removeEventListener('resize', onResize);
			window.visualViewport?.removeEventListener('resize', onResize);
			window.visualViewport?.removeEventListener('scroll', onResize);
			document.removeEventListener('fullscreenchange', onFsEvent);
			document.removeEventListener('webkitfullscreenchange', onFsEvent);
			document.removeEventListener('fullscreenerror', onFsEvent);
			document.removeEventListener('webkitfullscreenerror', onFsEvent);
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
			cssFullscreen = false;
			if (mapEl) applyFsBox(wrap, mapEl, false, false);
			restoreWrap();
			if (isNativeFullscreen(wrap)) void exitNativeFullscreen();
		},
		setFullscreen: (on) => {
			void applyFullscreen(on);
		},
		isFullscreen: () => isOn()
	};
}

/** Numbered pin for the add-GPS map. */
export function waypointPinIcon(L: LeafletGlobal, n: number) {
	return L.divIcon({
		className: 'wp-marker',
		html: `<span class="inline-flex items-center justify-center min-w-[1.55rem] h-[1.55rem] px-1 rounded-full bg-accent text-accent-ink font-display text-[0.72rem] font-bold leading-none border border-[rgba(12,16,12,0.35)] shadow-[0_4px_12px_rgba(0,0,0,0.45)]">${n}</span>`,
		iconSize: [26, 26],
		iconAnchor: [13, 13]
	});
}

/** Create a small km-marker DivIcon for the detail map. */
export function kmMarkerIcon(L: LeafletGlobal, km: number) {
	return L.divIcon({
		className: 'km-marker',
		html: `<span class="km-marker-pill inline-flex items-center justify-center min-w-[1.35rem] h-[1.35rem] px-1 rounded-full bg-surface/90 border border-accent/55 text-accent-fg font-display text-[0.68rem] font-bold leading-none shadow-[0_4px_12px_rgba(0,0,0,0.4)]">${km}</span>`,
		iconSize: [22, 22],
		iconAnchor: [11, 11]
	});
}

export function userLocationIcon(L: LeafletGlobal) {
	return L.divIcon({
		className: 'user-loc',
		html: '<span class="user-loc-pulse"></span><span class="user-loc-dot"></span>',
		iconSize: [28, 28],
		iconAnchor: [14, 14]
	});
}

export function liveLocationIcon(L: LeafletGlobal) {
	return L.divIcon({
		className: 'live-loc',
		html: '<span class="live-loc-pulse"></span><span class="live-loc-dot"></span><span class="live-loc-label">Live</span>',
		iconSize: [52, 36],
		iconAnchor: [14, 18]
	});
}

function liveAgo(updatedAt: number): string {
	const s = Math.max(0, Math.round((Date.now() - updatedAt) / 1000));
	if (s < 45) return 'just now';
	const m = Math.max(1, Math.round(s / 60));
	return m === 1 ? '1 min ago' : `${m} min ago`;
}

const ROUTE_CASING_EXTRA = 4;
const ROUTE_CASING_COLOR = '#0c100c';

type RouteLineStyle = {
	color?: string;
	weight?: number;
	opacity?: number;
	interactive?: boolean;
	/** Draw the dark halo. Default true — skip when a shared casing is already on the map. */
	casing?: boolean;
};

/** Keep casings under every track line, and both under start/finish markers. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ensureRoutePanes(map: any) {
	if (map.getPane?.('routeCasing')) return;
	const casing = map.createPane?.('routeCasing');
	if (casing) casing.style.zIndex = '410';
	const line = map.createPane?.('routeLine');
	if (line) line.style.zIndex = '420';
}

/** Dark halo so a lime GPS track does not disappear into the street grid. */
export function addRouteCasing(
	L: LeafletGlobal,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	map: any,
	coords: [number, number][],
	weight = 5
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
	ensureRoutePanes(map);
	return L.polyline(coords, {
		pane: 'routeCasing',
		color: ROUTE_CASING_COLOR,
		weight: weight + ROUTE_CASING_EXTRA,
		opacity: 0.9,
		lineJoin: 'round',
		lineCap: 'round',
		interactive: false,
		className: 'route-line-casing'
	}).addTo(map);
}

/** Accent track plus optional casing. Hover/tooltips bind to the returned `line`. */
export function addRoutePolyline(
	L: LeafletGlobal,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	map: any,
	coords: [number, number][],
	opts?: RouteLineStyle
) {
	ensureRoutePanes(map);
	const weight = opts?.weight ?? 5;
	const color = opts?.color ?? cssColor('--accent', '#c8f25a');
	const opacity = opts?.opacity ?? 0.98;
	const interactive = opts?.interactive ?? true;
	const casing = opts?.casing === false ? null : addRouteCasing(L, map, coords, weight);
	const line = L.polyline(coords, {
		pane: 'routeLine',
		color,
		weight,
		opacity,
		lineJoin: 'round',
		lineCap: 'round',
		interactive,
		className: 'route-line'
	}).addTo(map);
	return {
		line,
		casing,
		setStyle(next: { weight?: number; opacity?: number; color?: string }) {
			const w = next.weight ?? line.options.weight ?? weight;
			const o = next.opacity ?? line.options.opacity ?? opacity;
			line.setStyle({
				...(next.color ? { color: next.color } : {}),
				weight: w,
				opacity: o
			});
			casing?.setStyle({ weight: w + ROUTE_CASING_EXTRA });
		}
	};
}

export function endpointIcon(L: LeafletGlobal, kind: 'start' | 'finish' | 'loop', compact = false) {
	const size = compact ? 20 : 26;
	const label = kind === 'start' ? 'S' : kind === 'finish' ? 'F' : 'S/F';
	return L.divIcon({
		className: `route-end-marker route-end-marker-${kind}${compact ? ' is-compact' : ''}`,
		html: `<span class="route-end-pill">${label}</span>`,
		iconSize: [size, size],
		iconAnchor: [size / 2, size / 2]
	});
}

/** Mark the first and last track points so a green line does not fade into the streets. */
export function addRouteEndpoints(
	L: LeafletGlobal,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	map: any,
	coords: [number, number][],
	opts?: { compact?: boolean }
) {
	if (coords.length < 2) return;
	const start = coords[0]!;
	const end = coords[coords.length - 1]!;
	const compact = Boolean(opts?.compact);
	const dx = start[0] - end[0];
	const dy = start[1] - end[1];
	const loop = dx * dx + dy * dy < 1e-9;
	if (loop) {
		L.marker(start, {
			icon: endpointIcon(L, 'loop', compact),
			keyboard: false,
			zIndexOffset: 700
		})
			.bindTooltip('Start / Finish', { direction: 'top', offset: [0, -10] })
			.addTo(map);
		return;
	}
	L.marker(start, {
		icon: endpointIcon(L, 'start', compact),
		keyboard: false,
		zIndexOffset: 700
	})
		.bindTooltip('Start', { direction: 'top', offset: [0, -10] })
		.addTo(map);
	L.marker(end, {
		icon: endpointIcon(L, 'finish', compact),
		keyboard: false,
		zIndexOffset: 710
	})
		.bindTooltip('Finish', { direction: 'top', offset: [0, -10] })
		.addTo(map);
}
