// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LeafletGlobal = any;

declare global {
	interface Window {
		L?: LeafletGlobal;
	}
}

let leafletPromise: Promise<LeafletGlobal> | null = null;

/** Load Leaflet CSS + JS from CDN once (shared by RouteMap / RoutesHeatmap). */
export function loadLeaflet(): Promise<LeafletGlobal> {
	if (typeof window !== 'undefined' && window.L) return Promise.resolve(window.L);
	if (leafletPromise) return leafletPromise;

	leafletPromise = new Promise((resolve, reject) => {
		const cssId = 'leaflet-cdn-css';
		if (!document.getElementById(cssId)) {
			const link = document.createElement('link');
			link.id = cssId;
			link.rel = 'stylesheet';
			link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
			link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
			link.crossOrigin = '';
			document.head.appendChild(link);
		}

		const existing = document.getElementById('leaflet-cdn-js') as HTMLScriptElement | null;
		const onReady = () => {
			if (window.L) resolve(window.L);
			else reject(new Error('Leaflet failed to load'));
		};

		if (existing) {
			if (window.L) onReady();
			else existing.addEventListener('load', onReady);
			return;
		}

		const script = document.createElement('script');
		script.id = 'leaflet-cdn-js';
		script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
		script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
		script.crossOrigin = '';
		script.addEventListener('load', onReady);
		script.addEventListener('error', () => reject(new Error('Leaflet failed to load')));
		document.head.appendChild(script);
	});

	return leafletPromise;
}
