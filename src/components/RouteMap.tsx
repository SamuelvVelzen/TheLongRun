import { useEffect, useRef, useState } from 'react';
import { loadLeaflet } from '$lib/leaflet';
import { attachMapChrome, kmMarkerIcon, type MapChromeHandle } from '$lib/map-chrome';
import { analyticsFromProperties, type KmMarker } from '$lib/splits';
import { getRouteGeoJsonFn } from '$lib/server/functions';

export function RouteMap({
	routeId,
	kmMarkers = null
}: {
	routeId: string;
	kmMarkers?: KmMarker[] | null;
}) {
	const wrapRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [status, setStatus] = useState('Loading map…');
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let map: any = null;
		let chrome: MapChromeHandle | null = null;
		let cancelled = false;

		(async () => {
			try {
				const L = await loadLeaflet();
				const geo = (await getRouteGeoJsonFn({ data: routeId })) as {
					geometry?: { coordinates?: number[][] };
					properties?: unknown;
				} | null;
				if (cancelled || !containerRef.current || !wrapRef.current) return;
				if (!geo) throw new Error('Route not found');

				const raw = geo.geometry?.coordinates;
				if (!Array.isArray(raw) || raw.length < 2) throw new Error('Route has no GPS points');

				const coords = raw.map((c) => [c[1], c[0]] as [number, number]);
				const analytics = analyticsFromProperties(geo.properties ?? null);
				const markers = kmMarkers?.length ? kmMarkers : (analytics?.kmMarkers ?? []);

				map = L.map(containerRef.current, {
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

				chrome = attachMapChrome({ map, wrap: wrapRef.current, onFit: fit });
				setStatus('');
			} catch (e) {
				setFailed(true);
				setStatus(e instanceof Error ? e.message : 'Could not load map');
			}
		})();

		return () => {
			cancelled = true;
			chrome?.destroy();
			map?.remove?.();
		};
	}, [routeId, kmMarkers]);

	return (
		<div className="route-map-wrap map-wrap" ref={wrapRef}>
			{status && <p className={`route-map-status${failed ? ' error' : ''}`}>{status}</p>}
			<div className="route-map" ref={containerRef}></div>
		</div>
	);
}
