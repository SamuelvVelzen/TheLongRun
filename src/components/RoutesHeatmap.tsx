import { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { loadLeaflet } from '$lib/leaflet';
import { attachMapChrome, leafletMapOptions, type MapChromeHandle } from '$lib/map-chrome';
import type { RouteTrack } from '$lib/types';
import { SegmentedToggle } from './SegmentedToggle';

/** Per-track hover/click metadata, keyed by route id. */
export type RouteMeta = Record<string, { slug: string; title: string; sub: string }>;

export function RoutesHeatmap({
	tracks,
	meta = {},
	focusIds = [],
	detailPath = '/runs/$slug',
	emptyText = 'No GPS routes yet — import a FIT or link a Strava route.',
	onRouteClick
}: {
	tracks: RouteTrack[];
	meta?: RouteMeta;
	/** Route ids of recent runs — the map zooms to these by default (with an 'All' toggle). */
	focusIds?: string[];
	detailPath?: '/runs/$slug' | '/routes/$slug';
	emptyText?: string;
	/** When set, used instead of navigating to the detail path. */
	onRouteClick?: (slug: string) => void;
}) {
	const wrapRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [status, setStatus] = useState('Loading map…');
	const [failed, setFailed] = useState(false);
	const [view, setView] = useState<'recent' | 'all'>('recent');
	const fitRecentRef = useRef<() => void>(() => {});
	const fitAllRef = useRef<() => void>(() => {});
	const onRouteClickRef = useRef(onRouteClick);
	onRouteClickRef.current = onRouteClick;
	const navigate = useNavigate();
	const focusKey = focusIds.join(',');
	const hasFocus = focusIds.length > 0;

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

				map = L.map(containerRef.current, leafletMapOptions());
				L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
					attribution:
						'&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
					subdomains: 'abcd',
					maxZoom: 19
				}).addTo(map);

				const allBounds = L.latLngBounds([]);
				const focusSet = new Set(focusIds);
				const focusBounds = L.latLngBounds([]);
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
						line.on('click', () => {
							const handler = onRouteClickRef.current;
							if (handler) handler(info.slug);
							else navigate({ to: detailPath, params: { slug: info.slug } });
						});
						const el = line.getElement?.();
						if (el) el.style.cursor = 'pointer';
					}
					allBounds.extend(line.getBounds());
					if (focusSet.has(track.id)) focusBounds.extend(line.getBounds());
				}

				const fitAll = () => {
					if (allBounds.isValid()) map.fitBounds(allBounds, { padding: [24, 24], maxZoom: 14 });
					else map.setView([52.37, 4.9], 11);
				};
				const fitRecent = () => {
					if (focusBounds.isValid()) map.fitBounds(focusBounds, { padding: [30, 30], maxZoom: 14 });
					else fitAll();
				};
				fitAllRef.current = fitAll;
				fitRecentRef.current = fitRecent;
				// Land zoomed to recent runs, not the whole (possibly intercontinental) spread.
				fitRecent();

				chrome = attachMapChrome({ map, wrap: wrapRef.current, onFit: fitRecent });
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
	}, [tracks, meta, navigate, focusKey, detailPath]);

	if (!tracks.length) {
		return <div className="heatmap-empty muted">{emptyText}</div>;
	}

	return (
		<div className="heatmap-wrap map-wrap" ref={wrapRef}>
			{status && <p className={`heatmap-status${failed ? ' error' : ''}`}>{status}</p>}
			{hasFocus && !status && (
				<SegmentedToggle
					className="heatmap-view-toggle"
					value={view}
					aria-label="Map zoom"
					onChange={(next) => {
						setView(next);
						if (next === 'recent') fitRecentRef.current();
						else fitAllRef.current();
					}}
					options={[
						{ value: 'recent', label: 'Recent' },
						{ value: 'all', label: 'All' }
					]}
				/>
			)}
			<div className="heatmap-map" ref={containerRef}></div>
		</div>
	);
}
