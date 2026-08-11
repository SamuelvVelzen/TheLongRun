import { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { loadLeaflet } from '$lib/leaflet';
import { attachMapChrome, type MapChromeHandle } from '$lib/map-chrome';
import type { RouteTrack } from '$lib/types';

/** Per-track hover/click metadata, keyed by route id. */
export type RouteMeta = Record<string, { slug: string; title: string; sub: string }>;

export function RoutesHeatmap({ tracks, meta = {} }: { tracks: RouteTrack[]; meta?: RouteMeta }) {
	const wrapRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [status, setStatus] = useState('Loading map…');
	const [failed, setFailed] = useState(false);
	const navigate = useNavigate();

	useEffect(() => {
		if (!tracks.length) {
			setStatus('');
			return;
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let map: any = null;
		let chrome: MapChromeHandle | null = null;
		let cancelled = false;

		(async () => {
			try {
				const L = await loadLeaflet();
				if (cancelled || !containerRef.current || !wrapRef.current) return;

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

				const bounds = L.latLngBounds([]);
				for (const track of tracks) {
					if (track.coords.length < 2) continue;
					const info = meta[track.id];
					const line = L.polyline(track.coords, {
						color: '#c8f25a',
						weight: 2.5,
						opacity: 0.38,
						lineJoin: 'round',
						lineCap: 'round'
					}).addTo(map);
					if (info) {
						line.bindTooltip(`<strong>${info.title}</strong><br>${info.sub}`, {
							sticky: true,
							opacity: 0.95
						});
						line.on('mouseover', () => line.setStyle({ weight: 5, opacity: 1 }));
						line.on('mouseout', () => line.setStyle({ weight: 2.5, opacity: 0.38 }));
						line.on('click', () => navigate({ to: '/runs/$slug', params: { slug: info.slug } }));
						const el = line.getElement?.();
						if (el) el.style.cursor = 'pointer';
					}
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
	}, [tracks, meta, navigate]);

	if (!tracks.length) {
		return (
			<div className="heatmap-empty muted">
				No GPS routes yet — import a FIT or link a Strava route.
			</div>
		);
	}

	return (
		<div className="heatmap-wrap map-wrap" ref={wrapRef}>
			{status && <p className={`heatmap-status${failed ? ' error' : ''}`}>{status}</p>}
			<div className="heatmap-map" ref={containerRef}></div>
		</div>
	);
}
