<script lang="ts" module>
	import { loadLeaflet } from '$lib/leaflet';
	import { attachMapChrome, kmMarkerIcon, type MapChromeHandle } from '$lib/map-chrome';
	import { analyticsFromProperties, type KmMarker } from '$lib/splits';
</script>

<script lang="ts">
	import { onMount } from 'svelte';

	let {
		routeUrl,
		kmMarkers = null
	}: {
		routeUrl: string;
		/** Optional preloaded markers; otherwise read from GeoJSON properties. */
		kmMarkers?: KmMarker[] | null;
	} = $props();

	let wrapEl: HTMLDivElement | undefined = $state();
	let container: HTMLDivElement | undefined = $state();
	let status = $state('Loading map…');
	let failed = $state(false);

	onMount(() => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let map: any = null;
		let chrome: MapChromeHandle | null = null;
		let cancelled = false;

		(async () => {
			try {
				const L = await loadLeaflet();
				if (cancelled || !container || !wrapEl) return;

				const res = await fetch(routeUrl);
				if (!res.ok) throw new Error(`Route not found (${res.status})`);
				const geo = await res.json();
				const raw = geo.geometry?.coordinates;
				if (!Array.isArray(raw) || raw.length < 2) throw new Error('Route has no GPS points');

				const coords = raw.map((c: number[]) => [c[1], c[0]] as [number, number]);
				const analytics = analyticsFromProperties(geo.properties ?? null);
				const markers = kmMarkers?.length ? kmMarkers : (analytics?.kmMarkers ?? []);

				map = L.map(container, {
					scrollWheelZoom: false,
					zoomControl: false,
					attributionControl: true
				});
				L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
					attribution:
						'&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
					subdomains: 'abcd',
					maxZoom: 19
				}).addTo(map);

				const line = L.polyline(coords, {
					color: '#c8f25a',
					weight: 3.5,
					opacity: 0.92,
					lineJoin: 'round',
					lineCap: 'round'
				}).addTo(map);

				L.circleMarker(coords[0], {
					radius: 6,
					color: '#7dffa8',
					fillColor: '#7dffa8',
					fillOpacity: 0.9,
					weight: 1
				})
					.bindTooltip('Start')
					.addTo(map);

				L.circleMarker(coords[coords.length - 1], {
					radius: 6,
					color: '#ff8a5b',
					fillColor: '#ff8a5b',
					fillOpacity: 0.9,
					weight: 1
				})
					.bindTooltip('Finish')
					.addTo(map);

				for (const m of markers) {
					if (!Number.isFinite(m.lat) || !Number.isFinite(m.lng)) continue;
					L.marker([m.lat, m.lng], {
						icon: kmMarkerIcon(L, m.km),
						interactive: true,
						keyboard: false
					})
						.bindTooltip(`${m.km} km`, { direction: 'top', offset: [0, -8] })
						.addTo(map);
				}

				const fit = () => map.fitBounds(line.getBounds(), { padding: [28, 28] });
				fit();

				chrome = attachMapChrome({
					map,
					wrap: wrapEl,
					onFit: fit
				});

				status = '';
			} catch (e) {
				failed = true;
				status = e instanceof Error ? e.message : 'Could not load map';
			}
		})();

		return () => {
			cancelled = true;
			chrome?.destroy();
			map?.remove?.();
		};
	});
</script>

<div class="route-map-wrap map-wrap" bind:this={wrapEl}>
	{#if status}
		<p class="route-map-status" class:error={failed}>{status}</p>
	{/if}
	<div class="route-map" bind:this={container}></div>
</div>

<style>
	.route-map-wrap {
		position: relative;
		border-radius: var(--radius);
		overflow: hidden;
		border: 1px solid var(--line);
		background: rgba(0, 0, 0, 0.35);
	}

	.route-map {
		height: min(420px, 55vh);
		width: 100%;
		z-index: 0;
	}

	@media (max-width: 640px) {
		.route-map {
			height: min(280px, 42vh);
			min-height: 240px;
		}
	}

	/* Fullscreen: use viewport units + !important so scoped fixed heights lose.
	   map-chrome.ts also sets explicit pixel sizes on the Leaflet container. */
	:global(.route-map-wrap.is-fullscreen) .route-map,
	.route-map-wrap:fullscreen .route-map,
	.route-map-wrap:-webkit-full-screen .route-map {
		height: 100vh !important;
		height: 100dvh !important;
		min-height: 100vh !important;
		min-height: 100dvh !important;
		width: 100vw !important;
		max-height: none !important;
	}

	.route-map-status {
		position: absolute;
		z-index: 2;
		left: 0.85rem;
		top: 0.85rem;
		margin: 0;
		padding: 0.35rem 0.65rem;
		border-radius: 999px;
		background: rgba(16, 20, 15, 0.85);
		border: 1px solid var(--line);
		color: var(--muted);
		font-size: 0.85rem;
	}

	.route-map-status.error {
		color: #ffd4c2;
		border-color: rgba(255, 138, 91, 0.4);
	}

	:global(.route-map .leaflet-control-attribution),
	:global(.map-wrap .leaflet-control-attribution) {
		background: rgba(16, 20, 15, 0.72) !important;
		color: var(--muted) !important;
		font-size: 0.65rem !important;
		max-width: min(52vw, 14rem);
		line-height: 1.25;
		margin: 0 !important;
		padding: 0.15rem 0.35rem !important;
	}

	:global(.route-map .leaflet-control-attribution a),
	:global(.map-wrap .leaflet-control-attribution a) {
		color: var(--accent) !important;
	}
</style>
