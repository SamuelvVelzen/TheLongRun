import { useAuthed } from '$lib/auth';
import { loadLeaflet } from '$lib/leaflet';
import {
	formatLiveRouteKm,
	liveAgo,
	livePingFollowerCopy,
	liveRouteKmProgress,
	liveShareOn,
	requestLiveShare,
	type LiveLocationView
} from '$lib/live-location';
import {
	addBasemap,
	attachMapChrome,
	leafletMapOptions,
	type MapChromeHandle
} from '$lib/map-chrome';
import { mapPillTop, mapRoutePaneTall, mapWrap } from '$lib/map-layout';
import { appHead } from '$lib/title';
import { cn } from '$lib/ui';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { Icon } from '../components/Icon';
import { useLiveLocationPing } from '../components/LiveLocationPoll';
import {
	Actions,
	Button,
	Metric,
	Metrics,
	PageHero,
	Panel,
	PanelTitle
} from '../components/ui';
import { buttonClass } from '../components/ui/Button';

const LIVE_MAP_VIEW_KEY = 'tlr-live-map-view';
const DEFAULT_LAT = 52.35;
const DEFAULT_LNG = 5.63;
const DEFAULT_ZOOM = 9;

export const Route = createFileRoute('/live')({
	head: () => appHead('Live location'),
	component: LiveLocationPage
});

function readSavedMapView(): { lat: number; lng: number; zoom: number } {
	try {
		const raw = sessionStorage.getItem(LIVE_MAP_VIEW_KEY);
		if (!raw) return { lat: DEFAULT_LAT, lng: DEFAULT_LNG, zoom: DEFAULT_ZOOM };
		const v = JSON.parse(raw) as { lat?: number; lng?: number; zoom?: number };
		const lat = Number(v.lat);
		const lng = Number(v.lng);
		const zoom = Number(v.zoom);
		if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
			return { lat: DEFAULT_LAT, lng: DEFAULT_LNG, zoom: DEFAULT_ZOOM };
		}
		return {
			lat,
			lng,
			zoom: Number.isFinite(zoom) ? Math.min(18, Math.max(4, zoom)) : DEFAULT_ZOOM
		};
	} catch {
		return { lat: DEFAULT_LAT, lng: DEFAULT_LNG, zoom: DEFAULT_ZOOM };
	}
}

function saveMapView(lat: number, lng: number, zoom: number) {
	try {
		sessionStorage.setItem(LIVE_MAP_VIEW_KEY, JSON.stringify({ lat, lng, zoom }));
	} catch {
		/* ignore */
	}
}

function LiveLocationPage() {
	const ping = useLiveLocationPing();
	const authed = useAuthed();
	const sharing = authed && liveShareOn();

	return (
		<>
			<PageHero variant="quiet" title="Live location" />
			<Panel className="grid gap-0 p-0 overflow-hidden">
				{ping ? (
					<LiveLocationMap key={`${ping.updatedAt}-${ping.lat}-${ping.lng}`} ping={ping} />
				) : (
					<LiveLocationIdleMap />
				)}
			</Panel>
			{ping ? (
				<LiveLocationDetails ping={ping} sharing={sharing} />
			) : (
				<LiveLocationWaitingPanel authed={authed} sharing={sharing} />
			)}
		</>
	);
}

function LiveLocationIdleMap() {
	const wrapRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		let cancelled = false;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let map: any = null;
		let chrome: MapChromeHandle | null = null;

		(async () => {
			try {
				const L = await loadLeaflet();
				if (cancelled || !containerRef.current || !wrapRef.current) return;
				const start = readSavedMapView();
				map = L.map(containerRef.current, {
					...leafletMapOptions(),
					dragging: true
				});
				addBasemap(L, map);
				const fit = () => {
					map.setView([start.lat, start.lng], start.zoom, { animate: true });
				};
				map.setView([start.lat, start.lng], start.zoom);
				chrome = attachMapChrome({
					map,
					wrap: wrapRef.current,
					onFit: fit,
					alwaysPan: true
				});
				requestAnimationFrame(() => map.invalidateSize?.());
			} catch {
				/* map failed — panel below still explains state */
			}
		})();

		return () => {
			cancelled = true;
			chrome?.destroy();
			map?.remove?.();
		};
	}, []);

	return (
		<div
			data-map-wrap
			className={cn(mapWrap, mapRoutePaneTall, 'group/map border-0 rounded-none')}
			ref={wrapRef}
		>
			<p className={cn(mapPillTop, 'flex items-center gap-2 text-muted')}>
				<span
					className="size-2 shrink-0 rounded-full bg-muted animate-pulse motion-reduce:animate-none"
					aria-hidden="true"
				/>
				Waiting for a live pin
			</p>
			<div
				className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] flex justify-center px-4 pb-[max(0.85rem,env(safe-area-inset-bottom,0px))] pt-16 bg-gradient-to-t from-[rgba(16,20,15,0.88)] via-[rgba(16,20,15,0.35)] to-transparent"
				aria-hidden="true"
			>
				<span className="flex size-14 items-center justify-center rounded-full border border-line bg-surface/80 text-muted shadow-lift">
					<Icon name="locate" size={28} />
				</span>
			</div>
			<div data-route-map className="size-full min-h-[inherit]" ref={containerRef} />
		</div>
	);
}

function LiveLocationWaitingPanel({ authed, sharing }: { authed: boolean; sharing: boolean }) {
	return (
		<Panel className="grid gap-3">
			<PanelTitle>Nothing live yet</PanelTitle>
			<p className="m-0 text-muted text-[0.88rem] leading-snug">
				Pan the map above while you wait. When someone shares, their pin and route appear here
				automatically.
			</p>
			<Actions className="flex-wrap gap-2">
				{authed && !sharing ? (
					<Button type="button" onClick={() => requestLiveShare(true)}>
						<Icon name="locate" size={16} />
						Share your location
					</Button>
				) : null}
				<Link to="/" className={buttonClass({ variant: 'ghost' })}>
					Back home
				</Link>
			</Actions>
		</Panel>
	);
}

function LiveLocationMap({ ping }: { ping: LiveLocationView }) {
	const wrapRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const pingRef = useRef(ping);
	pingRef.current = ping;

	useEffect(() => {
		const p = pingRef.current;
		saveMapView(p.lat, p.lng, 15);
	}, [ping.lat, ping.lng, ping.updatedAt]);

	useEffect(() => {
		let cancelled = false;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let map: any = null;
		let chrome: MapChromeHandle | null = null;

		(async () => {
			try {
				const L = await loadLeaflet();
				if (cancelled || !containerRef.current || !wrapRef.current) return;
				const start = pingRef.current;
				map = L.map(containerRef.current, {
					...leafletMapOptions(),
					dragging: true
				});
				addBasemap(L, map);
				const fit = () => {
					const next = pingRef.current;
					const z = Math.max(map.getZoom?.() ?? 15, 15);
					map.setView([next.lat, next.lng], z, { animate: true });
					saveMapView(next.lat, next.lng, z);
				};
				map.setView([start.lat, start.lng], 15);
				saveMapView(start.lat, start.lng, 15);
				chrome = attachMapChrome({
					map,
					wrap: wrapRef.current,
					onFit: fit,
					alwaysPan: true,
					followLive: true
				});
				requestAnimationFrame(() => map.invalidateSize?.());
			} catch {
				/* map failed — details panel still usable */
			}
		})();

		return () => {
			cancelled = true;
			chrome?.destroy();
			map?.remove?.();
		};
	}, []);

	return (
		<div
			data-map-wrap
			className={cn(mapWrap, mapRoutePaneTall, 'group/map border-0 rounded-none')}
			ref={wrapRef}
		>
			<div data-route-map className="size-full min-h-[inherit]" ref={containerRef} />
		</div>
	);
}

function LiveLocationDetails({ ping, sharing }: { ping: LiveLocationView; sharing: boolean }) {
	const copy = livePingFollowerCopy(ping);
	const acc =
		ping.accuracy != null && Number.isFinite(ping.accuracy) && ping.accuracy > 0
			? `${Math.round(ping.accuracy)} m`
			: null;
	const routeKm = liveRouteKmProgress(ping);

	return (
		<Panel className="grid gap-3">
			<PanelTitle>{copy.title}</PanelTitle>
			{copy.detail ? <p className="m-0 text-muted text-[0.88rem] leading-snug">{copy.detail}</p> : null}
			<Metrics>
				<Metric label="Last update" value={liveAgo(ping.updatedAt)} />
				{routeKm ? <Metric label="On route" value={formatLiveRouteKm(routeKm)} /> : null}
				{acc ? <Metric label="Accuracy" value={acc} /> : null}
				{ping.routeSlug ? (
					<Metric
						label="Planned route"
						value={
							<Link
								to="/routes/$slug"
								params={{ slug: ping.routeSlug }}
								className="text-fg underline-offset-2 hover:underline"
							>
								View route
							</Link>
						}
					/>
				) : null}
			</Metrics>
			{sharing ? (
				<Actions>
					<Button type="button" variant="danger" onClick={() => requestLiveShare(false)}>
						<Icon name="locate" size={16} />
						Stop sharing
					</Button>
				</Actions>
			) : null}
		</Panel>
	);
}
