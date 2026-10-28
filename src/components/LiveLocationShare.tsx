import { subscribeAppResume } from '$lib/app-resume';
import { useAuthed } from '$lib/auth';
import { loadLeaflet } from '$lib/leaflet';
import {
	LIVE_LOCATION_PING_MS,
	LIVE_PING_EVENT,
	LIVE_SHARE_EVENT,
	LIVE_SHARE_REQUEST,
	LIVE_WATCH_REQUEST,
	dispatchLivePing,
	liveShareRouteSlug,
	liveShareWanted,
	requestLiveShare,
	requestLiveWatch,
	setLiveShareRouteSlug,
	setLiveShareWanted,
	syncLiveShareDom,
	type LiveLocationView,
	type LivePingDetail,
	type LiveShareDetail,
	type LiveShareRequestDetail
} from '$lib/live-location';
import { getLastHeading, noteGpsHeading } from '$lib/location-heading';
import {
	addBasemap,
	attachMapChrome,
	leafletMapOptions,
	type MapChromeHandle
} from '$lib/map-chrome';
import { liveShareHost } from '$lib/map-layout';
import { OverlayPortal, useOverlayLock } from '$lib/overlay';
import {
	getLiveLocation,
	getLiveShareRouteOptions,
	pingLiveLocation,
	stopLiveLocation
} from '$lib/server/functions';
import { setScreenWakeLock } from '$lib/wake-lock';
import { liveWatchCanvas, liveWatchMapShell, mapWrap } from '$lib/map-layout';
import { cn } from '$lib/ui';
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	type MouseEventHandler
} from 'react';
import { Icon } from './Icon';
import { Dialog, Field, Select, SnackAction, errorMessage, useSnackbar } from './ui';
import { buttonClass } from './ui/Button';

function currentPosition(): Promise<GeolocationPosition> {
	return new Promise((resolve, reject) => {
		if (!navigator.geolocation) {
			reject(new Error('Location is not available in this browser.'));
			return;
		}
		navigator.geolocation.getCurrentPosition(resolve, reject, {
			enableHighAccuracy: true,
			maximumAge: 15_000,
			timeout: 20_000
		});
	});
}

export function LiveLocationShare() {
	const authed = useAuthed();
	return authed ? <LiveLocationBroadcaster /> : <LiveLocationWatch />;
}

function LiveLocationBroadcaster() {
	const snack = useSnackbar();
	const [sharing, setSharing] = useState(false);
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [routeSlug, setRouteSlug] = useState('');
	const [routeOptions, setRouteOptions] = useState<{ slug: string; label: string }[]>([]);
	const sharingRef = useRef(false);
	const routeSlugRef = useRef<string | null>(null);
	const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const setOn = useCallback((on: boolean) => {
		sharingRef.current = on;
		setSharing(on);
		setLiveShareWanted(on);
		syncLiveShareDom(true, on);
	}, []);

	const ping = useCallback(async (force = false) => {
		if (!force && !sharingRef.current) return;
		const pos = await currentPosition();
		noteGpsHeading(pos.coords);
		await pingLiveLocation({
			data: {
				lat: pos.coords.latitude,
				lng: pos.coords.longitude,
				accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
				heading: getLastHeading(),
				routeSlug: routeSlugRef.current
			}
		});
	}, []);

	const stop = useCallback(async () => {
		if (timerRef.current) {
			clearInterval(timerRef.current);
			timerRef.current = null;
		}
		await setScreenWakeLock(false);
		setOn(false);
		setConfirmOpen(false);
		try {
			await stopLiveLocation();
		} catch (e) {
			snack.error(errorMessage(e, 'Could not stop sharing.'));
		}
	}, [setOn, snack]);

	const start = useCallback(async () => {
		setConfirmOpen(false);
		const slug = routeSlug.trim() || liveShareRouteSlug() || null;
		routeSlugRef.current = slug;
		setLiveShareRouteSlug(slug);
		try {
			await ping(true);
		} catch (e) {
			const denied =
				typeof e === 'object' && e != null && 'code' in e && (e as { code: number }).code === 1;
			snack.error(
				denied
					? 'Location permission denied — sharing stayed off.'
					: errorMessage(e, 'Could not read your location.')
			);
			setOn(false);
			return;
		}
		setOn(true);
		if (timerRef.current) clearInterval(timerRef.current);
		timerRef.current = setInterval(() => {
			void ping().catch(() => {
				/* keep sharing; retry next interval */
			});
		}, LIVE_LOCATION_PING_MS);
		void setScreenWakeLock(true);
	}, [ping, routeSlug, setOn, snack]);

	useEffect(() => {
		if (!confirmOpen) return;
		setRouteSlug(liveShareRouteSlug() ?? '');
		let cancelled = false;
		void getLiveShareRouteOptions()
			.then((options) => {
				if (!cancelled) setRouteOptions(options);
			})
			.catch(() => {
				/* routes picker is optional */
			});
		return () => {
			cancelled = true;
		};
	}, [confirmOpen]);

	useLayoutEffect(() => {
		syncLiveShareDom(true, sharingRef.current);
	}, []);

	useEffect(() => {
		if (liveShareWanted() && !sharingRef.current) void start();
	}, [start]);

	useEffect(() => {
		return () => {
			if (timerRef.current) {
				clearInterval(timerRef.current);
				timerRef.current = null;
			}
		};
	}, []);

	useEffect(() => {
		const onRequest = (e: Event) => {
			const want = (e as CustomEvent<LiveShareRequestDetail>).detail?.want;
			if (want === true && !sharingRef.current) setConfirmOpen(true);
			else if (want === false && sharingRef.current) void stop();
		};
		const onResume = () => {
			if (!sharingRef.current) return;
			void setScreenWakeLock(true);
			void ping().catch(() => {
				/* ignore */
			});
		};
		window.addEventListener(LIVE_SHARE_REQUEST, onRequest);
		const offResume = subscribeAppResume(onResume);
		return () => {
			window.removeEventListener(LIVE_SHARE_REQUEST, onRequest);
			offResume();
		};
	}, [ping, stop]);

	return (
		<>
			<Dialog
				open={confirmOpen}
				title="Share live location"
				onClose={() => setConfirmOpen(false)}
				actions={
					<>
						<button
							className={buttonClass({ variant: 'ghost' })}
							type="button"
							onClick={() => setConfirmOpen(false)}
						>
							Cancel
						</button>
						<button className={buttonClass()} type="button" onClick={() => void start()}>
							Share
						</button>
					</>
				}
			>
				<div className="grid gap-3">
					<p className={cn('text-muted', 'm-0 leading-[1.45]')}>
						Anyone looking at this site will see where you are on the map. The pin updates about every
						30 seconds while this app stays open. You can stop at any time.
					</p>
					{routeOptions.length > 0 ? (
						<Field
							as="div"
							label="Show planned route (optional)"
							hint="Plan-linked routes are listed first. Watchers see the track with your live pin."
						>
							<Select
								value={routeSlug}
								onChange={setRouteSlug}
								placeholder="No route — pin only"
								aria-label="Show planned route (optional)"
								options={[
									{ value: '', label: 'No route — pin only' },
									...routeOptions.map((route) => ({
										value: route.slug,
										label: route.label
									}))
								]}
							/>
						</Field>
					) : null}
				</div>
			</Dialog>
		</>
	);
}

/** In-flow banner under the app header — not a floating toast. */
export function LiveShareBanner() {
	const authed = useAuthed();
	const [sharing, setSharing] = useState(false);

	useEffect(() => {
		if (!authed) {
			setSharing(false);
			return;
		}
		setSharing(liveShareOnSafe());
		const on = (e: Event) => {
			const next = (e as CustomEvent<LiveShareDetail>).detail?.sharing;
			if (typeof next === 'boolean') setSharing(next);
		};
		window.addEventListener(LIVE_SHARE_EVENT, on);
		return () => window.removeEventListener(LIVE_SHARE_EVENT, on);
	}, [authed]);

	if (!authed || !sharing) return null;

	return (
		<div
			data-live-share-banner
			role="status"
			className={cn(
				'flex flex-none items-center gap-2 px-3 py-2 text-[0.82rem] leading-snug',
				'border-b border-live/35 bg-surface text-fg',
				'max-sm:px-[max(0.625rem,env(safe-area-inset-left,0px))] max-sm:pr-[max(0.625rem,env(safe-area-inset-right,0px))]'
			)}
		>
			<span className="size-2 shrink-0 rounded-full bg-live" aria-hidden="true" />
			<span className="flex-1 min-w-0">Location is being shared on the map.</span>
			<button
				type="button"
				className={cn(
					buttonClass({ variant: 'ghost', size: 'sm' }),
					'shrink-0 max-sm:px-3'
				)}
				onClick={() => requestLiveShare(false)}
			>
				Stop sharing
			</button>
		</div>
	);
}

function LiveLocationWatch() {
	const [ping, setPing] = useState<LiveLocationView | null>(null);
	const [watching, setWatching] = useState(false);
	const pingRef = useRef<LiveLocationView | null>(null);
	pingRef.current = ping;

	useLayoutEffect(() => {
		syncLiveShareDom(false, false);
	}, []);

	const openWatch = useCallback(() => {
		if (!pingRef.current) return;
		setWatching(true);
	}, []);

	const closeWatch = useCallback(() => {
		setWatching(false);
	}, []);

	useEffect(() => {
		let cancelled = false;
		const poll = () => {
			void getLiveLocation()
				.then((next) => {
					if (cancelled) return;
					setPing(next);
					dispatchLivePing(next);
					if (!next) setWatching(false);
				})
				.catch(() => {
					/* ignore */
				});
		};
		poll();
		const timer = setInterval(poll, LIVE_LOCATION_PING_MS);
		const offResume = subscribeAppResume(poll);
		return () => {
			cancelled = true;
			clearInterval(timer);
			offResume();
			dispatchLivePing(null);
		};
	}, []);

	useEffect(() => {
		const onWatchRequest = () => openWatch();
		window.addEventListener(LIVE_WATCH_REQUEST, onWatchRequest);
		return () => window.removeEventListener(LIVE_WATCH_REQUEST, onWatchRequest);
	}, [openWatch]);

	if (!ping) return null;

	return (
		<>
			{!watching ? (
				<div data-live-watch-host className={liveShareHost}>
					<div
						className="pointer-events-auto flex items-center gap-[0.45rem] w-[min(32rem,100%)] py-[0.65rem] pr-[0.45rem] pl-[0.9rem] rounded-[14px] border border-live/40 bg-panel shadow-lift"
						role="status"
					>
						<span className="size-2 shrink-0 rounded-full bg-live" aria-hidden="true" />
						<p className="m-0 flex-1 text-[0.88rem] leading-[1.35]">Live location is on the map.</p>
						<SnackAction type="button" onClick={openWatch}>
							Open map
						</SnackAction>
					</div>
				</div>
			) : null}
			{watching ? <LiveWatchMap ping={ping} onClose={closeWatch} /> : null}
		</>
	);
}

function LiveWatchMap({ ping, onClose }: { ping: LiveLocationView; onClose: () => void }) {
	const wrapRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const pingRef = useRef(ping);
	const onCloseRef = useRef(onClose);
	pingRef.current = ping;
	onCloseRef.current = onClose;
	useOverlayLock(true);

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
					map.setView([next.lat, next.lng], Math.max(map.getZoom?.() ?? 15, 15), { animate: true });
				};
				map.setView([start.lat, start.lng], 15);
				chrome = attachMapChrome({
					map,
					wrap: wrapRef.current,
					onFit: fit,
					alwaysPan: true,
					followLive: true,
					onClose: () => onCloseRef.current()
				});
				requestAnimationFrame(() => map.invalidateSize?.());
			} catch {
				if (!cancelled) onCloseRef.current();
			}
		})();

		return () => {
			cancelled = true;
			chrome?.destroy();
			map?.remove?.();
		};
	}, []);

	return (
		<OverlayPortal>
			<div data-map-wrap className={cn(mapWrap, liveWatchMapShell)} ref={wrapRef}>
				<div data-route-map className={liveWatchCanvas} ref={containerRef} />
			</div>
		</OverlayPortal>
	);
}

export function LiveLocationMenuItem({
	className,
	onClick
}: {
	className?: string;
	onClick?: MouseEventHandler<HTMLButtonElement>;
}) {
	const authed = useAuthed();
	const [sharing, setSharing] = useState(false);
	const [liveOnMap, setLiveOnMap] = useState(false);

	useEffect(() => {
		if (authed) {
			setSharing(liveShareOnSafe());
			const on = (e: Event) => {
				const next = (e as CustomEvent<LiveShareDetail>).detail?.sharing;
				if (typeof next === 'boolean') setSharing(next);
			};
			window.addEventListener(LIVE_SHARE_EVENT, on);
			return () => window.removeEventListener(LIVE_SHARE_EVENT, on);
		}
		const onPing = (e: Event) => {
			setLiveOnMap(!!(e as CustomEvent<LivePingDetail>).detail?.ping);
		};
		window.addEventListener(LIVE_PING_EVENT, onPing);
		return () => window.removeEventListener(LIVE_PING_EVENT, onPing);
	}, [authed]);

	if (!authed) {
		if (!liveOnMap) return null;
		return (
			<button
				type="button"
				className={className}
				onClick={(e) => {
					onClick?.(e);
					requestLiveWatch();
				}}
			>
				<Icon name="map" size={18} />
				Open live location
			</button>
		);
	}

	return (
		<button
			type="button"
			className={className}
			onClick={(e) => {
				onClick?.(e);
				requestLiveShare(!sharing);
			}}
		>
			<Icon name="locate" size={18} />
			{sharing ? 'Stop sharing location' : 'Share live location'}
		</button>
	);
}

function liveShareOnSafe(): boolean {
	try {
		return document.documentElement.dataset.liveShare === 'on';
	} catch {
		return false;
	}
}
