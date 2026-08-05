import { useEffect, useRef, useState } from 'react';
import { loadLeaflet } from '$lib/leaflet';
import { attachMapChrome, kmMarkerIcon, type MapChromeHandle } from '$lib/map-chrome';
import { analyticsFromProperties, haversineMeters, type KmMarker } from '$lib/splits';
import { getRouteGeoJsonFn } from '$lib/server/functions';

/** Pace → colour: 0 = fastest (green), 1 = slowest (red), through yellow. */
function paceColor(t: number): string {
	const x = Math.max(0, Math.min(1, t));
	const stops = [
		[125, 255, 168],
		[232, 212, 90],
		[255, 91, 91]
	];
	const seg = x < 0.5 ? 0 : 1;
	const lt = x < 0.5 ? x / 0.5 : (x - 0.5) / 0.5;
	const a = stops[seg]!;
	const b = stops[seg + 1]!;
	const c = a.map((v, i) => Math.round(v + (b[i]! - v) * lt));
	return `rgb(${c[0]},${c[1]},${c[2]})`;
}

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
	const [colored, setColored] = useState(false);

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

				const splits = analytics?.splits ?? [];
				const kmSec = splits.map((s) => (s.distanceKm > 0 ? s.seconds / s.distanceKm : 0));
				const canColor = kmSec.filter((v) => v > 0).length >= 2;

				if (canColor) {
					const valid = kmSec.filter((v) => v > 0);
					const lo = Math.min(...valid);
					const hi = Math.max(...valid);

					// Cumulative distance at each coordinate.
					const cum = [0];
					for (let i = 1; i < coords.length; i++) {
						cum[i] =
							cum[i - 1]! +
							haversineMeters(coords[i - 1]![0], coords[i - 1]![1], coords[i]![0], coords[i]![1]);
					}

					// Pace (sec/km) interpolated between km centres (km i is centred at i + 0.5 km) — a
					// smooth curve instead of a step per km, so colours blend rather than jump.
					const paceAt = (d: number) => {
						const pos = d / 1000 - 0.5;
						if (pos <= 0) return kmSec[0] || lo;
						const i = Math.floor(pos);
						if (i >= kmSec.length - 1) return kmSec[kmSec.length - 1] || lo;
						const f = pos - i;
						return (kmSec[i] || lo) * (1 - f) + (kmSec[i + 1] || lo) * f;
					};
					const norm = (sec: number) => (hi > lo ? (sec - lo) / (hi - lo) : 0.5);

					// Many short segments that follow the route → a smooth gradient. More GPS points
					// simply means finer segments (up to a performance cap).
					const N = coords.length;
					const target = Math.min(N - 1, 300);
					const stride = Math.max(1, Math.round((N - 1) / target));
					for (let i = 0; i < N - 1; i += stride) {
						const j = Math.min(i + stride, N - 1);
						const midD = (cum[i]! + cum[j]!) / 2;
						L.polyline(coords.slice(i, j + 1), {
							color: paceColor(norm(paceAt(midD))),
							weight: 4,
							opacity: 0.95,
							lineJoin: 'round',
							lineCap: 'round'
						}).addTo(map);
					}
					setColored(true);
				} else {
					L.polyline(coords, {
						color: '#c8f25a',
						weight: 3.5,
						opacity: 0.92,
						lineJoin: 'round',
						lineCap: 'round'
					}).addTo(map);
				}
				const bounds = L.latLngBounds(coords);

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

				const fit = () => map.fitBounds(bounds, { padding: [28, 28] });
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
			{colored && !status && (
				<div className="route-legend" aria-hidden="true">
					<span>faster</span>
					<span className="route-legend-bar"></span>
					<span>slower</span>
				</div>
			)}
			<div className="route-map" ref={containerRef}></div>
		</div>
	);
}
