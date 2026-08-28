// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LeafletGlobal = any;

declare global {
	interface Window {
		L?: LeafletGlobal;
		maplibregl?: unknown;
	}
}

let leafletPromise: Promise<LeafletGlobal> | null = null;

function ensureCss(id: string, href: string, integrity?: string) {
	if (document.getElementById(id)) return;
	const link = document.createElement('link');
	link.id = id;
	link.rel = 'stylesheet';
	link.href = href;
	if (integrity) {
		link.integrity = integrity;
		link.crossOrigin = '';
	}
	document.head.appendChild(link);
}

function ensureScript(id: string, src: string, integrity?: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const existing = document.getElementById(id) as HTMLScriptElement | null;
		if (existing) {
			if (existing.dataset.ready === '1') {
				resolve();
				return;
			}
			existing.addEventListener('load', () => resolve(), { once: true });
			existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), {
				once: true
			});
			return;
		}

		const script = document.createElement('script');
		script.id = id;
		script.src = src;
		if (integrity) {
			script.integrity = integrity;
			script.crossOrigin = '';
		}
		script.addEventListener('load', () => {
			script.dataset.ready = '1';
			resolve();
		});
		script.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)));
		document.head.appendChild(script);
	});
}

/** Leaflet + MapLibre GL Leaflet (OpenFreeMap). Shared by RouteMap / heatmap / planned routes. */
export function loadLeaflet(): Promise<LeafletGlobal> {
	if (typeof window !== 'undefined' && window.L?.maplibreGL) return Promise.resolve(window.L);
	if (leafletPromise) return leafletPromise;

	leafletPromise = (async () => {
		ensureCss(
			'leaflet-cdn-css',
			'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
			'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='
		);
		ensureCss('maplibre-cdn-css', 'https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css');

		await ensureScript(
			'leaflet-cdn-js',
			'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
			'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='
		);
		await ensureScript(
			'maplibre-cdn-js',
			'https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js'
		);
		await ensureScript(
			'maplibre-leaflet-cdn-js',
			'https://unpkg.com/@maplibre/maplibre-gl-leaflet@0.1.3/leaflet-maplibre-gl.js'
		);

		if (!window.L?.maplibreGL) throw new Error('MapLibre GL Leaflet failed to load');
		return window.L;
	})().catch((err) => {
		leafletPromise = null;
		throw err;
	});

	return leafletPromise;
}
