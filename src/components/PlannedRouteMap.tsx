import { useEffect, useRef, useState } from 'react';
import type { PlannedWaypoint } from '$lib/types';
import type { KmMarker } from '$lib/splits';
import { loadLeaflet } from '$lib/leaflet';
import { attachMapChrome, kmMarkerIcon, type MapChromeHandle } from '$lib/map-chrome';

export function PlannedRouteMap({
	geojson,
	kmMarkers,
	waypoints
}: {
	geojson: unknown;
	kmMarkers: KmMarker[];
	waypoints: PlannedWaypoint[];
}) {
	const wrapRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [status, setStatus] = useState('Loading map…');
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		let cancelled = false;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let map: any = null;
		let chrome: MapChromeHandle | null = null;

		(async () => {
			try {
				const L = await loadLeaflet();
				if (cancelled || !containerRef.current || !wrapRef.current) return;
				const raw = (geojson as { geometry?: { coordinates?: number[][] } } | null)?.geometry
					?.coordinates;
				if (!Array.isArray(raw) || raw.length < 2) throw new Error('Route has no GPS points');
				const coords = raw.map((c) => [Number(c[1]), Number(c[0])] as [number, number]);

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

				L.polyline(coords, {
					color: '#c8f25a',
					weight: 4,
					opacity: 0.94,
					lineJoin: 'round',
					lineCap: 'round'
				}).addTo(map);

				for (const marker of kmMarkers) {
					L.marker([marker.lat, marker.lng], {
						icon: kmMarkerIcon(L, marker.km),
						keyboard: false
					})
						.bindTooltip(`${marker.km} km`, { direction: 'top', offset: [0, -8] })
						.addTo(map);
				}

				for (const [index, waypoint] of waypoints.entries()) {
					const label =
						waypoint.name === 'from'
							? 'Start'
							: waypoint.name === 'to'
								? 'Finish'
								: waypoint.name || `Waypoint ${index + 1}`;
					L.circleMarker([waypoint.lat, waypoint.lng], {
						radius: waypoint.name === 'from' || waypoint.name === 'to' ? 6 : 4,
						color: waypoint.name === 'to' ? '#ff8a5b' : '#7dffa8',
						fillColor: waypoint.name === 'to' ? '#ff8a5b' : '#7dffa8',
						fillOpacity: 0.92,
						weight: 1
					})
						.bindTooltip(label)
						.addTo(map);
				}

				const bounds = L.latLngBounds(coords);
				const fit = () => map.fitBounds(bounds, { padding: [28, 28], maxZoom: 16 });
				fit();
				chrome = attachMapChrome({ map, wrap: wrapRef.current, onFit: fit });
				setStatus('');
			} catch (error) {
				setFailed(true);
				setStatus(error instanceof Error ? error.message : 'Could not load map');
			}
		})();

		return () => {
			cancelled = true;
			chrome?.destroy();
			map?.remove?.();
		};
	}, [geojson, kmMarkers, waypoints]);

	return (
		<div className="route-map-wrap map-wrap" ref={wrapRef}>
			{status && <p className={`route-map-status${failed ? ' error' : ''}`}>{status}</p>}
			<div className="route-map" ref={containerRef}></div>
		</div>
	);
}
