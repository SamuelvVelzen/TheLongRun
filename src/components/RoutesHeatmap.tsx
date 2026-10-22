import {
	ACTIVITY_MAP_COLORS,
	ACTIVITY_TYPES,
	activityLabel,
	activityMapLineStyle,
	normalizeActivityType,
	type ActivityType
} from '$lib/activity';
import { mapHeatmapLegend, mapHeatmapPane, mapPillTop, mapWrap } from '$lib/map-layout';
import { loadLeaflet } from '$lib/leaflet';
import { cn } from '$lib/ui';
import {
	addBasemap,
	addRouteEndpoints,
	addRoutePolyline,
	attachMapChrome,
	leafletMapOptions,
	type MapChromeHandle
} from '$lib/map-chrome';
import type { RouteTrack } from '$lib/types';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MapNextUpPanel, type MapPlanPeek } from './MapNextUpPanel';
import { SegmentedToggle } from './ui';

/** Per-track hover/click metadata, keyed by route id. */
export type RouteMeta = Record<
	string,
	{ slug: string; title: string; sub: string; activityType?: string }
>;

export function RoutesHeatmap({
	tracks,
	meta = {},
	focusIds = [],
	detailPath = '/runs/$slug',
	emptyText = 'No GPS routes yet — import a GPX or attach a route.',
	showEndpoints,
	onRouteClick,
	planPeek
}: {
	tracks: RouteTrack[];
	meta?: RouteMeta;
	/** Route ids of recent runs — the map zooms to these by default (with an 'All' toggle). */
	focusIds?: string[];
	detailPath?: '/runs/$slug' | '/routes/$slug';
	emptyText?: string;
	/** Draw start/finish badges. Default on for planned-route maps. */
	showEndpoints?: boolean;
	/** When set, used instead of navigating to the detail path. */
	onRouteClick?: (slug: string) => void;
	planPeek?: MapPlanPeek | null;
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
	const markEnds = showEndpoints ?? detailPath === '/routes/$slug';

	const legendTypes = useMemo(() => {
		const present = new Set<ActivityType>();
		for (const track of tracks) {
			const type = meta[track.id]?.activityType;
			if (type) present.add(normalizeActivityType(type));
		}
		const types = ACTIVITY_TYPES.filter((t) => present.has(t));
		if (types.length > 1) return types;
		if (types.length === 1 && types[0] !== 'run') return types;
		return [];
	}, [tracks, meta]);

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
				addBasemap(L, map);

				const allBounds = L.latLngBounds([]);
				const focusSet = new Set(focusIds);
				const focusBounds = L.latLngBounds([]);
				// Other sports first so runs paint last and stay on top.
				const isRun = (id: string) => {
					const type = meta[id]?.activityType;
					return Boolean(type) && normalizeActivityType(type) === 'run';
				};
				const ordered = [...tracks].sort((a, b) => Number(isRun(a.id)) - Number(isRun(b.id)));
				for (const track of ordered) {
					if (track.coords.length < 2) continue;
					const info = meta[track.id];
					const style = info?.activityType
						? activityMapLineStyle(info.activityType)
						: { color: undefined as string | undefined, weight: 3.5, opacity: 0.82 };
					const route = addRoutePolyline(L, map, track.coords, {
						color: style.color,
						weight: style.weight,
						opacity: style.opacity
					});
					const line = route.line;
					if (info) {
						line.bindTooltip(`<strong>${info.title}</strong><br>${info.sub}`, {
							sticky: true,
							opacity: 0.95
						});
						line.on('mouseover', () => route.setStyle({ weight: style.weight + 2.5, opacity: 1 }));
						line.on('mouseout', () =>
							route.setStyle({ weight: style.weight, opacity: style.opacity })
						);
						line.on('click', () => {
							const handler = onRouteClickRef.current;
							if (handler) handler(info.slug);
							else navigate({ to: detailPath, params: { slug: info.slug } });
						});
						const el = line.getElement?.();
						if (el) el.style.cursor = 'pointer';
					}
					if (markEnds) addRouteEndpoints(L, map, track.coords, { compact: true });
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
	}, [tracks, meta, navigate, focusKey, detailPath, markEnds]);

	if (!tracks.length) {
		return (
			<div className="p-[2rem_1.2rem] text-center border border-dashed border-line rounded-box bg-inset text-muted">
				{emptyText}
			</div>
		);
	}

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
			{hasFocus && !status && (
				<div data-map-pill-top className={cn(mapPillTop, 'p-0 border-0 bg-transparent')}>
					<SegmentedToggle
						className="[&_button]:text-[0.72rem] [&_button]:font-semibold max-sm:[&_button]:min-w-11 max-sm:[&_button]:min-h-11 max-sm:[&_button]:h-11 max-sm:[&_button]:text-[0.8rem] max-sm:[&_button]:px-[0.9rem] max-sm:[&_button]:py-2"
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
				</div>
			)}
			{legendTypes.length > 0 && !status && (
				<div data-map-pill-bottom className={mapHeatmapLegend} aria-label="Activity colours">
					{legendTypes.map((type) => (
						<span key={type} className="inline-flex items-center gap-1.5">
							<span
								className="block size-2 rounded-full shrink-0"
								style={{ background: ACTIVITY_MAP_COLORS[type] }}
							/>
							{activityLabel(type)}
						</span>
					))}
				</div>
			)}
			<div data-heatmap-map className={mapHeatmapPane} ref={containerRef}></div>
			<MapNextUpPanel peek={planPeek} />
		</div>
	);
}
