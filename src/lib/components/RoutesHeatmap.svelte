<script lang="ts">
	import { onMount } from 'svelte';
	import { loadLeaflet } from '$lib/leaflet';
	import { attachMapChrome, type MapChromeHandle } from '$lib/map-chrome';
	import type { RouteTrack } from '$lib/types';

	let { tracks }: { tracks: RouteTrack[] } = $props();

	let wrapEl: HTMLDivElement | undefined = $state();
	let container: HTMLDivElement | undefined = $state();
	let status = $state('Loading map…');
	let failed = $state(false);

	onMount(() => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let map: any = null;
		let chrome: MapChromeHandle | null = null;
		let cancelled = false;

		if (!tracks.length) {
			status = '';
			return;
		}

		(async () => {
			try {
				const L = await loadLeaflet();
				if (cancelled || !container || !wrapEl) return;

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

				const bounds = L.latLngBounds([]);
				for (const track of tracks) {
					if (track.coords.length < 2) continue;
					const line = L.polyline(track.coords, {
						color: '#c8f25a',
						weight: 2.5,
						opacity: 0.38,
						lineJoin: 'round',
						lineCap: 'round'
					}).addTo(map);
					bounds.extend(line.getBounds());
				}

				const fit = () => {
					if (bounds.isValid()) {
						map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
					} else {
						map.setView([52.37, 4.9], 11);
					}
				};
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

{#if !tracks.length}
	<div class="heatmap-empty muted">No GPS routes yet — import a FIT or link a Strava route.</div>
{:else}
	<div class="heatmap-wrap map-wrap" bind:this={wrapEl}>
		{#if status}
			<p class="heatmap-status" class:error={failed}>{status}</p>
		{/if}
		<div class="heatmap-map" bind:this={container}></div>
	</div>
{/if}

<style>
	.heatmap-wrap {
		position: relative;
		border-radius: var(--radius);
		overflow: hidden;
		border: 1px solid var(--line);
		background: rgba(0, 0, 0, 0.35);
	}

	.heatmap-map {
		height: 300px;
		width: 100%;
		z-index: 0;
	}

	@media (max-width: 640px) {
		.heatmap-map {
			height: 260px;
			min-height: 240px;
		}
	}

	/* Fullscreen: viewport units + !important; map-chrome also sets px sizes. */
	:global(.heatmap-wrap.is-fullscreen) .heatmap-map,
	.heatmap-wrap:fullscreen .heatmap-map,
	.heatmap-wrap:-webkit-full-screen .heatmap-map {
		height: 100vh !important;
		height: 100dvh !important;
		min-height: 100vh !important;
		min-height: 100dvh !important;
		width: 100vw !important;
		max-height: none !important;
	}

	.heatmap-empty {
		padding: 2rem 1.2rem;
		text-align: center;
		border: 1px dashed var(--line);
		border-radius: var(--radius);
		background: rgba(0, 0, 0, 0.2);
	}

	.heatmap-status {
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

	.heatmap-status.error {
		color: #ffd4c2;
		border-color: rgba(255, 138, 91, 0.4);
	}

	:global(.heatmap-map .leaflet-control-attribution),
	:global(.map-wrap .leaflet-control-attribution) {
		background: rgba(16, 20, 15, 0.72) !important;
		color: var(--muted) !important;
		font-size: 0.65rem !important;
		max-width: min(52vw, 14rem);
		line-height: 1.25;
		margin: 0 !important;
		padding: 0.15rem 0.35rem !important;
	}

	:global(.heatmap-map .leaflet-control-attribution a),
	:global(.map-wrap .leaflet-control-attribution a) {
		color: var(--accent) !important;
	}
</style>
