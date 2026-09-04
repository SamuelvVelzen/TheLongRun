import { loadLeaflet } from '$lib/leaflet';
import {
    addBasemap,
    addRouteCasing,
    addRouteEndpoints,
    addRoutePolyline,
    attachMapChrome,
    kmMarkerIcon,
    leafletMapOptions,
    type MapChromeHandle
} from '$lib/map-chrome';
import { getRouteGeoJsonFn } from '$lib/server/functions';
import { analyticsFromProperties, haversineMeters, type KmMarker } from '$lib/splits';
import { useEffect, useRef, useState } from 'react';

/** Seconds-per-km → `m:ss /km`. */
function fmtPace(secPerKm: number): string {
	if (!Number.isFinite(secPerKm) || secPerKm <= 0) return '';
	const m = Math.floor(secPerKm / 60);
	const s = Math.round(secPerKm % 60);
	return `${m}:${String(s).padStart(2, '0')} /km`;
}

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

				map = L.map(containerRef.current, leafletMapOptions());
				addBasemap(L, map);

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

					addRouteCasing(L, map, coords, 5);

					// Many short segments that follow the route → a smooth gradient. More GPS points
					// simply means finer segments (up to a performance cap).
					const N = coords.length;
					const target = Math.min(N - 1, 300);
					const stride = Math.max(1, Math.round((N - 1) / target));
					for (let i = 0; i < N - 1; i += stride) {
						const j = Math.min(i + stride, N - 1);
						const midD = (cum[i]! + cum[j]!) / 2;
						const secPerKm = paceAt(midD);
						const { line: seg } = addRoutePolyline(L, map, coords.slice(i, j + 1), {
							color: paceColor(norm(secPerKm)),
							weight: 5,
							opacity: 0.98,
							casing: false
						});
						const label = fmtPace(secPerKm);
						if (label) {
							seg.bindTooltip(label, { sticky: true, direction: 'top', opacity: 0.95 });
							seg.on('mouseover', () => seg.setStyle({ weight: 8 }));
							seg.on('mouseout', () => seg.setStyle({ weight: 5 }));
						}
					}
					setColored(true);
				} else {
					addRoutePolyline(L, map, coords);
				}
				const bounds = L.latLngBounds(coords);
				addRouteEndpoints(L, map, coords);

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
		<div className="route-map-wrap map-wrap relative rounded-box overflow-hidden border border-line bg-inset" ref={wrapRef}>
			{status && (
				<p
					className={`route-map-status absolute z-[2] left-[0.85rem] top-[0.85rem] m-0 px-[0.65rem] py-[0.35rem] rounded-full bg-[rgba(16,20,15,0.85)] border border-line text-[0.85rem] ${failed ? 'text-[#ffd4c2] border-[rgba(255,138,91,0.4)]' : 'text-muted'}`}
				>
					{status}
				</p>
			)}
			{colored && !status && (
				<div className="route-legend absolute z-[2] right-[0.85rem] bottom-[0.85rem] flex items-center gap-1.5 px-[0.55rem] py-[0.3rem] rounded-full bg-[rgba(16,20,15,0.85)] border border-line text-muted text-[0.72rem]" aria-hidden="true">
					<span>faster</span>
					<span className="block w-16 h-1.5 rounded-full bg-[linear-gradient(90deg,rgb(125,255,168),rgb(232,212,90),rgb(255,91,91))]"></span>
					<span>slower</span>
				</div>
			)}
			<div className="route-map h-[min(440px,48vh)] w-full z-0 max-sm:h-[50vh] max-sm:min-h-[280px]" ref={containerRef}></div>
		</div>
	);
}
