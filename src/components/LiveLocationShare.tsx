import { buttonClass, snackActionClass } from './ui';
import { useAuthed } from '$lib/auth';
import { loadLeaflet } from '$lib/leaflet';
import {
    LIVE_LOCATION_PING_MS,
    LIVE_SHARE_EVENT,
    LIVE_SHARE_REQUEST,
    liveAgo,
    liveShareWanted,
    liveWatchPromptSeen,
    requestLiveShare,
    setLiveShareWanted,
    setLiveWatchPromptSeen,
    syncLiveShareDom,
    type LiveLocationPing,
    type LiveShareDetail,
    type LiveShareRequestDetail
} from '$lib/live-location';
import { getLastHeading, noteGpsHeading } from '$lib/location-heading';
import { addBasemap, attachMapChrome, leafletMapOptions, type MapChromeHandle } from '$lib/map-chrome';
import { OverlayPortal, useOverlayLock } from '$lib/overlay';
import { getLiveLocation, pingLiveLocation, stopLiveLocation } from '$lib/server/functions';
import { cn } from '$lib/ui';
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type MouseEventHandler
} from 'react';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import { errorMessage, useSnackbar } from './Snackbar';

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
	const sharingRef = useRef(false);
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
				heading: getLastHeading()
			}
		});
	}, []);

	const stop = useCallback(async () => {
		if (timerRef.current) {
			clearInterval(timerRef.current);
			timerRef.current = null;
		}
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
				/* keep sharing; retry next minute */
			});
		}, LIVE_LOCATION_PING_MS);
	}, [ping, setOn, snack]);

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
		const onVisible = () => {
			if (document.visibilityState === 'visible' && sharingRef.current) {
				void ping().catch(() => {
					/* ignore */
				});
			}
		};
		window.addEventListener(LIVE_SHARE_REQUEST, onRequest);
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			window.removeEventListener(LIVE_SHARE_REQUEST, onRequest);
			document.removeEventListener('visibilitychange', onVisible);
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
						<button className={buttonClass({ variant: 'ghost' })} type="button" onClick={() => setConfirmOpen(false)}>
							Cancel
						</button>
						<button className={buttonClass()} type="button" onClick={() => void start()}>
							Share
						</button>
					</>
				}
			>
				<p className={cn('text-muted', 'm-0 leading-[1.45]')}>
					Anyone looking at this site will see where you are on the map. The pin updates about
					once a minute. You can stop at any time.
				</p>
			</Dialog>
			{sharing ? (
				<div
					className="live-share-host fixed z-[55] inset-x-0 bottom-[calc(1.15rem+env(safe-area-inset-bottom,0px))] flex justify-center px-4 pointer-events-none max-sm:bottom-[calc(5.1rem+env(safe-area-inset-bottom,0px))] max-sm:px-3"
				>
					<div
						className="live-share-banner pointer-events-auto flex items-center gap-[0.45rem] w-[min(32rem,100%)] py-[0.65rem] pr-[0.45rem] pl-[0.9rem] rounded-[14px] border border-live/40 bg-surface shadow-lift"
						role="status"
					>
						<span className="size-2 shrink-0 rounded-full bg-live" aria-hidden="true" />
						<p className="m-0 flex-1 text-[0.88rem] leading-[1.35]">
							Location is being shared on the map.
						</p>
						<button className={snackActionClass} type="button" onClick={() => void stop()}>
							Stop
						</button>
					</div>
				</div>
			) : null}
		</>
	);
}

function LiveLocationWatch() {
	const [ping, setPing] = useState<LiveLocationPing | null>(null);
	const [promptOpen, setPromptOpen] = useState(false);
	const [watching, setWatching] = useState(false);

	useLayoutEffect(() => {
		syncLiveShareDom(false, false);
	}, []);

	useEffect(() => {
		let cancelled = false;
		const poll = () => {
			void getLiveLocation()
				.then((next) => {
					if (cancelled) return;
					setPing(next);
					if (next && !liveWatchPromptSeen()) setPromptOpen(true);
					if (!next) {
						setPromptOpen(false);
						setWatching(false);
					}
				})
				.catch(() => {
					/* ignore */
				});
		};
		poll();
		const timer = setInterval(poll, LIVE_LOCATION_PING_MS);
		return () => {
			cancelled = true;
			clearInterval(timer);
		};
	}, []);

	function dismissPrompt() {
		setLiveWatchPromptSeen();
		setPromptOpen(false);
	}

	const closeWatch = useCallback(() => {
		setWatching(false);
	}, []);

	function openWatch() {
		setLiveWatchPromptSeen();
		setPromptOpen(false);
		setWatching(true);
	}

	if (!ping) return null;

	return (
		<>
			<Dialog
				open={promptOpen && !watching}
				title="Live on the map"
				onClose={dismissPrompt}
				actions={
					<>
						<button className={buttonClass({ variant: 'ghost' })} type="button" onClick={dismissPrompt}>
							Not now
						</button>
						<button className={buttonClass()} type="button" onClick={openWatch}>
							Watch live
						</button>
					</>
				}
			>
				<p className={cn('text-muted', 'm-0 leading-[1.45]')}>
					They're sharing where they are right now. Open a fullscreen map to follow the pin — it
					updates about once a minute.
				</p>
				<p className={cn('text-muted', 'm-0 text-[0.82rem]')}>Updated {liveAgo(ping.updatedAt)}</p>
			</Dialog>
			{!watching && !promptOpen ? (
				<div
					className="live-watch-host fixed z-[55] inset-x-0 bottom-[calc(1.15rem+env(safe-area-inset-bottom,0px))] flex justify-center px-4 pointer-events-none max-sm:bottom-[calc(5.1rem+env(safe-area-inset-bottom,0px))] max-sm:px-3"
				>
					<div
						className="pointer-events-auto flex items-center gap-[0.45rem] w-[min(32rem,100%)] py-[0.65rem] pr-[0.45rem] pl-[0.9rem] rounded-[14px] border border-live/40 bg-surface shadow-lift"
						role="status"
					>
						<span className="size-2 shrink-0 rounded-full bg-live" aria-hidden="true" />
						<p className="m-0 flex-1 text-[0.88rem] leading-[1.35]">Live location is on the map.</p>
						<button className={snackActionClass} type="button" onClick={() => setWatching(true)}>
							Watch
						</button>
					</div>
				</div>
			) : null}
			{watching ? <LiveWatchMap ping={ping} onClose={closeWatch} /> : null}
		</>
	);
}

function LiveWatchMap({ ping, onClose }: { ping: LiveLocationPing; onClose: () => void }) {
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
			<div className="map-wrap live-watch-map bg-inset" ref={wrapRef}>
				<div className="live-watch-canvas" ref={containerRef} />
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

	useEffect(() => {
		setSharing(liveShareOnSafe());
		const on = (e: Event) => {
			const next = (e as CustomEvent<LiveShareDetail>).detail?.sharing;
			if (typeof next === 'boolean') setSharing(next);
		};
		window.addEventListener(LIVE_SHARE_EVENT, on);
		return () => window.removeEventListener(LIVE_SHARE_EVENT, on);
	}, []);

	if (!authed) return null;

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
