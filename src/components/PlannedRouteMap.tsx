import { cssColor } from '$lib/theme';
import { mapPillTop, mapRoutePane, mapWrap } from '$lib/map-layout';
import { loadLeaflet } from '$lib/leaflet';
import { cn } from '$lib/ui';
import {
	addBasemap,
	addRouteEndpoints,
	addRoutePolyline,
	attachMapChrome,
	kmMarkerIcon,
	leafletMapOptions,
	type MapChromeHandle
} from '$lib/map-chrome';
import type { KmMarker } from '$lib/splits';
import type { PlannedWaypoint } from '$lib/types';
import { useEffect, useRef, useState } from 'react';

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

				map = L.map(containerRef.current, leafletMapOptions());
				addBasemap(L, map);

				addRoutePolyline(L, map, coords);

				addRouteEndpoints(L, map, coords);

				for (const marker of kmMarkers) {
					L.marker([marker.lat, marker.lng], {
						icon: kmMarkerIcon(L, marker.km),
						keyboard: false
					})
						.bindTooltip(`${marker.km} km`, { direction: 'top', offset: [0, -8] })
						.addTo(map);
				}

				for (const [index, waypoint] of waypoints.entries()) {
					if (waypoint.name === 'from' || waypoint.name === 'to') continue;
					L.circleMarker([waypoint.lat, waypoint.lng], {
						radius: 5,
						color: cssColor('--ok', '#7dffa8'),
						fillColor: cssColor('--ok', '#7dffa8'),
						fillOpacity: 0.92,
						weight: 2
					})
						.bindTooltip(waypoint.name || `Waypoint ${index + 1}`)
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
		<div data-map-wrap className={mapWrap} ref={wrapRef}>
			{status && (
				<p
					data-map-pill-top
					className={cn(
						mapPillTop,
						failed ? 'text-[#ffd4c2] border-[rgba(255,138,91,0.4)]' : 'text-muted'
					)}
				>
					{status}
				</p>
			)}
			<div data-route-map className={mapRoutePane} ref={containerRef}></div>
		</div>
	);
}
