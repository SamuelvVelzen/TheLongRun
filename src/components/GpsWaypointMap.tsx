import {
    insertPinOnLine,
    MAX_WAYPOINTS,
    snapToTrackEnds,
    trackDistanceMeters,
    type GpsContextTrack,
    type GpsWaypoint
} from '$lib/gps-repair';
import { loadLeaflet } from '$lib/leaflet';
import {
    addBasemap,
    addRoutePolyline,
    attachMapChrome,
    leafletMapOptions,
    waypointPinIcon,
    type MapChromeHandle
} from '$lib/map-chrome';
import { cssColor } from '$lib/theme';
import { useEffect, useRef } from 'react';

const NL_LAT = 52.35;
const NL_LNG = 5.63;
const CONTEXT_COLORS = ['#6ec8ff', '#ffb36b', '#d4a5ff', '#ff8aa8'];

export function GpsWaypointMap({
	waypoints,
	contextTracks,
	previewCoords,
	status,
	emptyHint = 'Tap to drop pins along how you travelled',
	onChange
}: {
	waypoints: GpsWaypoint[];
	contextTracks: GpsContextTrack[];
	previewCoords?: [number, number][];
	status?: string;
	emptyHint?: string;
	onChange: (next: GpsWaypoint[]) => void;
}) {
	const wrapRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const waypointsRef = useRef(waypoints);
	const contextRef = useRef(contextTracks);
	const previewRef = useRef(previewCoords);
	const onChangeRef = useRef(onChange);
	const redrawRef = useRef<(() => void) | null>(null);
	waypointsRef.current = waypoints;
	contextRef.current = contextTracks;
	previewRef.current = previewCoords;
	onChangeRef.current = onChange;

	const lineForKm = previewCoords && previewCoords.length >= 2
		? previewCoords.map(([lat, lng]) => ({ lat, lng }))
		: waypoints;
	const previewKm =
		lineForKm.length >= 2 ? trackDistanceMeters(lineForKm) / 1000 : 0;

	useEffect(() => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let map: any = null;
		let chrome: MapChromeHandle | null = null;
		let cancelled = false;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const pins: any[] = [];
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let preview: { line?: any; casing?: any; hit?: any } | null = null;
		let skipMapClick = false;
		function swallowMapClick() {
			skipMapClick = true;
			window.setTimeout(() => {
				skipMapClick = false;
			}, 0);
		}

		(async () => {
			const L = await loadLeaflet();
			if (cancelled || !containerRef.current || !wrapRef.current) return;

			map = L.map(containerRef.current, {
				...leafletMapOptions(),
				dragging: true,
				doubleClickZoom: false
			});
			addBasemap(L, map);

			const contextBounds = L.latLngBounds([]);
			let hasContext = false;
			for (let i = 0; i < contextRef.current.length; i++) {
				const track = contextRef.current[i]!;
				if (track.coords.length < 2) continue;
				const { line } = addRoutePolyline(L, map, track.coords, {
					color: CONTEXT_COLORS[i % CONTEXT_COLORS.length],
					weight: 4,
					opacity: 0.72
				});
				line.bindTooltip(track.label, { sticky: true, direction: 'top' });
				contextBounds.extend(L.latLngBounds(line.getLatLngs()));
				hasContext = true;
			}

			const fit = () => {
				const bounds = L.latLngBounds([]);
				let any = false;
				for (const p of waypointsRef.current) {
					bounds.extend([p.lat, p.lng]);
					any = true;
				}
				if (hasContext) {
					bounds.extend(contextBounds);
					any = true;
				}
				if (any && bounds.isValid()) {
					map.fitBounds(bounds, { padding: [36, 36], maxZoom: waypointsRef.current.length < 2 ? 12 : 14 });
					return;
				}
				map.setView([NL_LAT, NL_LNG], 8);
			};

			const previewPoints = (): GpsWaypoint[] | null => {
				const routed = previewRef.current;
				if (!routed || routed.length < 2) return null;
				return routed.map(([lat, lng]) => ({ lat, lng }));
			};

			const onLineClick = (e: {
				latlng: { lat: number; lng: number };
				originalEvent?: Event;
			}) => {
				swallowMapClick();
				L.DomEvent.stop(e);
				if (e.originalEvent) L.DomEvent.stop(e.originalEvent);
				const current = waypointsRef.current;
				const inserted = insertPinOnLine(
					current,
					{ lat: e.latlng.lat, lng: e.latlng.lng },
					previewPoints(),
					400
				);
				if (inserted) onChangeRef.current(inserted);
			};

			const redraw = () => {
				for (const m of pins) m.remove();
				pins.length = 0;
				preview?.line?.remove();
				preview?.casing?.remove();
				preview?.hit?.remove();
				preview = null;
				const pts = waypointsRef.current;
				const routed = previewRef.current;
				const line =
					routed && routed.length >= 2
						? routed
						: pts.map((p) => [p.lat, p.lng] as [number, number]);
				if (line.length >= 2) {
					preview = addRoutePolyline(L, map, line, {
						color: cssColor('--accent', '#c8f25a'),
						weight: 6,
						opacity: 0.95
					});
					preview.line.options.bubblingMouseEvents = false;
					preview.line.on('click', onLineClick);
					const hit = L.polyline(line, {
						pane: 'routeLine',
						weight: 22,
						opacity: 0.001,
						color: cssColor('--accent', '#c8f25a'),
						lineJoin: 'round',
						lineCap: 'round',
						interactive: true,
						bubblingMouseEvents: false,
						className: 'route-line-hit'
					}).addTo(map);
					hit.on('click', onLineClick);
					preview.hit = hit;
				}
				pts.forEach((p, i) => {
					const marker = L.marker([p.lat, p.lng], {
						icon: waypointPinIcon(L, i + 1),
						draggable: true,
						autoPan: true,
						zIndexOffset: 800
					}).addTo(map);
					let dragged = false;
					marker.on('dragstart', () => {
						dragged = true;
					});
					marker.on('click', (e: { originalEvent?: Event }) => {
						swallowMapClick();
						L.DomEvent.stop(e);
						if (e.originalEvent) L.DomEvent.stop(e.originalEvent);
						if (dragged) {
							dragged = false;
							return;
						}
						onChangeRef.current(waypointsRef.current.filter((_, j) => j !== i));
					});
					marker.on('dragend', () => {
						swallowMapClick();
						const ll = marker.getLatLng();
						onChangeRef.current(
							waypointsRef.current.map((w, j) => (j === i ? { lat: ll.lat, lng: ll.lng } : w))
						);
					});
					pins.push(marker);
				});
			};

			map.on('click', (e: { latlng: { lat: number; lng: number } }) => {
				if (skipMapClick) {
					skipMapClick = false;
					return;
				}
				const current = waypointsRef.current;
				if (current.length >= MAX_WAYPOINTS) return;
				const snapped =
					snapToTrackEnds(e.latlng.lat, e.latlng.lng, contextRef.current) ?? {
						lat: e.latlng.lat,
						lng: e.latlng.lng
					};
				onChangeRef.current([...current, snapped]);
			});

			redrawRef.current = redraw;
			redraw();
			fit();
			chrome = attachMapChrome({ map, wrap: wrapRef.current, onFit: fit, alwaysPan: true });
		})();

		return () => {
			cancelled = true;
			redrawRef.current = null;
			chrome?.destroy();
			map?.remove?.();
		};
	}, []);

	useEffect(() => {
		redrawRef.current?.();
	}, [waypoints, previewCoords]);

	return (
		<div
			className="route-map-wrap map-wrap relative rounded-box overflow-hidden border border-line bg-inset"
			ref={wrapRef}
		>
			<p className="absolute z-[2] left-[0.85rem] top-[0.85rem] m-0 px-[0.65rem] py-[0.35rem] rounded-full bg-[rgba(16,20,15,0.85)] border border-line text-muted text-[0.78rem] pointer-events-none max-sm:left-2 max-sm:top-2">
				{status
					? status
					: waypoints.length === 0
						? emptyHint
						: `${waypoints.length} pin${waypoints.length === 1 ? '' : 's'}${
								previewKm > 0 ? ` · ~${previewKm.toFixed(1)} km` : ''
							}`}
			</p>
			<div
				className="route-map h-[min(520px,62vh)] w-full z-0 max-sm:h-[58vh] max-sm:min-h-[320px]"
				ref={containerRef}
			/>
		</div>
	);
}
