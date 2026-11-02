import { subscribeAppResume } from '$lib/app-resume';
import { useAuthed } from '$lib/auth';
import { loadLeaflet } from '$lib/leaflet';
import {
	LIVE_LOCATION_ACTIVE_PING_MS,
	LIVE_LOCATION_PING_MS,
	LIVE_MAP_PATH,
	LIVE_MAP_NAV_EVENT,
	LIVE_PING_EVENT,
	LIVE_SHARE_EVENT,
	LIVE_SHARE_REQUEST,
	dispatchLivePing,
	livePingFollowerCopy,
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
import { fetchLiveLocation } from '$lib/fetch-live-location';
import { getLastHeading, noteGpsHeading } from '$lib/location-heading';
import {
	getLiveShareRouteOptions,
	getLiveWatchActive,
	pingLiveLocation,
	stopLiveLocation
} from '$lib/server/functions';
import { LiveLocationPoll } from './LiveLocationPoll';
import { setScreenWakeLock } from '$lib/wake-lock';
import { cn } from '$lib/ui';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	type MouseEventHandler
} from 'react';
import { Icon } from './Icon';
import { Dialog, Field, Select, errorMessage, useSnackbar } from './ui';
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
	useLayoutEffect(() => {
		if (!authed) syncLiveShareDom(false, false);
	}, [authed]);
	return (
		<>
			<LiveLocationNavBridge />
			{authed ? <LiveLocationBroadcaster /> : null}
			<LiveLocationPoll />
		</>
	);
}

function LiveLocationNavBridge() {
	const navigate = useNavigate();
	useEffect(() => {
		const go = () => {
			void navigate({ to: LIVE_MAP_PATH });
		};
		window.addEventListener(LIVE_MAP_NAV_EVENT, go);
		return () => window.removeEventListener(LIVE_MAP_NAV_EVENT, go);
	}, [navigate]);
	return null;
}

function LiveLocationBroadcaster() {
	const snack = useSnackbar();
	const [sharing, setSharing] = useState(false);
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [routeSlug, setRouteSlug] = useState('');
	const [routeOptions, setRouteOptions] = useState<{ slug: string; label: string }[]>([]);
	const sharingRef = useRef(false);
	const shareEpochRef = useRef(0);
	const routeSlugRef = useRef<string | null>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const clearPingTimer = () => {
		if (timerRef.current != null) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
	};

	const setOn = useCallback((on: boolean) => {
		sharingRef.current = on;
		setSharing(on);
		setLiveShareWanted(on);
		syncLiveShareDom(true, on);
	}, []);

	const ping = useCallback(async (force = false) => {
		if (!force && !sharingRef.current) return;
		const epoch = shareEpochRef.current;
		const pos = await currentPosition();
		if (!sharingRef.current || epoch !== shareEpochRef.current) return;
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
		if (!sharingRef.current || epoch !== shareEpochRef.current) {
			try {
				await stopLiveLocation();
				dispatchLivePing(null);
			} catch {
				/* ignore — stop already ran or server busy */
			}
		}
	}, []);

	const scheduleNextPing = useCallback(() => {
		clearPingTimer();
		if (!sharingRef.current) return;
		void getLiveWatchActive()
			.then(({ active }) => (active ? LIVE_LOCATION_ACTIVE_PING_MS : LIVE_LOCATION_PING_MS))
			.catch(() => LIVE_LOCATION_PING_MS)
			.then((ms) => {
				if (!sharingRef.current) return;
				timerRef.current = setTimeout(() => {
					void ping()
						.catch(() => {
							/* keep sharing; retry next interval */
						})
						.finally(() => scheduleNextPing());
				}, ms);
			});
	}, [ping]);

	const stop = useCallback(async () => {
		clearPingTimer();
		shareEpochRef.current += 1;
		setOn(false);
		setConfirmOpen(false);
		routeSlugRef.current = null;
		setLiveShareRouteSlug(null);
		setRouteSlug('');
		await setScreenWakeLock(false);
		try {
			await stopLiveLocation();
			dispatchLivePing(null);
		} catch (e) {
			snack.error(errorMessage(e, 'Could not stop sharing.'));
		}
	}, [setOn, snack]);

	const closeConfirm = useCallback(() => {
		setConfirmOpen(false);
		if (!sharingRef.current) {
			setRouteSlug('');
			setLiveShareRouteSlug(null);
		}
	}, []);

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
		clearPingTimer();
		scheduleNextPing();
		void setScreenWakeLock(true);
		try {
			const view = await fetchLiveLocation();
			if (view) {
				dispatchLivePing(view);
				requestLiveWatch(view);
			}
		} catch {
			requestLiveWatch();
		}
	}, [ping, routeSlug, scheduleNextPing, setOn, snack]);

	useEffect(() => {
		if (!confirmOpen) return;
		setRouteSlug(sharingRef.current ? (liveShareRouteSlug() ?? '') : '');
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
		if (liveShareWanted() && !sharingRef.current) {
			sharingRef.current = true;
			setSharing(true);
		}
		syncLiveShareDom(true, sharingRef.current);
	}, []);

	useEffect(() => {
		if (liveShareWanted() && !sharingRef.current) void start();
	}, [start]);

	useEffect(() => () => clearPingTimer(), []);

	useEffect(() => {
		const onRequest = (e: Event) => {
			const want = (e as CustomEvent<LiveShareRequestDetail>).detail?.want;
			if (want === true) {
				if (sharingRef.current || liveShareWanted()) return;
				setConfirmOpen(true);
			} else if (want === false && sharingRef.current) void stop();
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
				onClose={closeConfirm}
				actions={
					<>
						<button
							className={buttonClass({ variant: 'ghost' })}
							type="button"
							onClick={closeConfirm}
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
						Anyone looking at this site will see where you are on the map. Updates every 5 seconds
						while someone is watching the live map, otherwise about every 30 seconds, while this app
						stays open. You can stop at any time.
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

/** In-flow banner under the app header — sharing yours or watching someone live. */
export function LiveShareBanner() {
	const authed = useAuthed();
	const onLiveMap = useRouterState({ select: (s) => s.location.pathname === LIVE_MAP_PATH });
	const [sharing, setSharing] = useState(false);
	const [ping, setPing] = useState<LiveLocationView | null>(null);
	const [, tick] = useState(0);

	useEffect(() => {
		if (!authed) {
			setSharing(false);
		} else {
			setSharing(liveShareOnSafe() || liveShareWanted());
		}
		const onShare = (e: Event) => {
			const next = (e as CustomEvent<LiveShareDetail>).detail?.sharing;
			if (typeof next === 'boolean') setSharing(next);
		};
		const onPing = (e: Event) => {
			setPing((e as CustomEvent<LivePingDetail>).detail?.ping ?? null);
		};
		window.addEventListener(LIVE_SHARE_EVENT, onShare);
		window.addEventListener(LIVE_PING_EVENT, onPing);
		const refresh = window.setInterval(() => tick((n) => n + 1), 30_000);
		return () => {
			window.removeEventListener(LIVE_SHARE_EVENT, onShare);
			window.removeEventListener(LIVE_PING_EVENT, onPing);
			window.clearInterval(refresh);
		};
	}, [authed]);

	if (onLiveMap) return null;

	if (sharing) {
		return (
			<div data-live-share-banner role="status" className={liveLocationBannerClass}>
				<span className="size-2 shrink-0 rounded-full bg-live" aria-hidden="true" />
				<span className="flex-1 min-w-0">Location is being shared on the map.</span>
				<div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
					<button
						type="button"
						className={cn(buttonClass({ variant: 'ghost', size: 'sm' }), 'max-sm:px-3')}
						onClick={() => requestLiveWatch()}
					>
						Show on map
					</button>
					<button
						type="button"
						className={cn(buttonClass({ variant: 'ghost', size: 'sm' }), 'max-sm:px-3')}
						onClick={() => requestLiveShare(false)}
					>
						Stop sharing
					</button>
				</div>
			</div>
		);
	}

	if (!ping) return null;

	const copy = livePingFollowerCopy(ping);
	const muted = copy.signal !== 'fresh';

	return (
		<div
			data-live-watch-banner
			role="status"
			className={cn(liveLocationBannerClass, muted && 'text-muted')}
		>
			<span
				className={cn('size-2 shrink-0 rounded-full', muted ? 'bg-muted' : 'bg-live')}
				aria-hidden="true"
			/>
			<span className="flex-1 min-w-0 grid gap-0.5">
				<span>{copy.title}</span>
				{copy.detail ? (
					<span className="text-[0.75rem] leading-snug text-muted">{copy.detail}</span>
				) : null}
			</span>
			<button
				type="button"
				className={cn(buttonClass({ variant: 'ghost', size: 'sm' }), 'shrink-0 max-sm:px-3')}
				onClick={() => requestLiveWatch()}
			>
				Open map
			</button>
		</div>
	);
}

const liveLocationBannerClass = cn(
	'flex flex-none items-center gap-2 px-3 py-2 text-[0.82rem] leading-snug',
	'border-b border-line bg-surface text-fg',
	'max-sm:px-[max(0.625rem,env(safe-area-inset-left,0px))] max-sm:pr-[max(0.625rem,env(safe-area-inset-right,0px))]'
);

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
		const onShare = (e: Event) => {
			const next = (e as CustomEvent<LiveShareDetail>).detail?.sharing;
			if (typeof next === 'boolean') setSharing(next);
		};
		const onPing = (e: Event) => {
			setLiveOnMap(!!(e as CustomEvent<LivePingDetail>).detail?.ping);
		};
		if (authed) {
			setSharing(liveShareOnSafe() || liveShareWanted());
		}
		window.addEventListener(LIVE_SHARE_EVENT, onShare);
		window.addEventListener(LIVE_PING_EVENT, onPing);
		void fetchLiveLocation()
			.then((ping) => {
				setLiveOnMap(!!ping);
				dispatchLivePing(ping);
			})
			.catch(() => {
				/* ignore */
			});
		return () => {
			window.removeEventListener(LIVE_SHARE_EVENT, onShare);
			window.removeEventListener(LIVE_PING_EVENT, onPing);
		};
	}, [authed]);

	if (liveOnMap && !sharing) {
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

	if (!authed) return null;

	if (sharing) {
		return (
			<>
				<button
					type="button"
					className={className}
					onClick={(e) => {
						onClick?.(e);
						requestLiveWatch();
					}}
				>
					<Icon name="map" size={18} />
					Show on map
				</button>
				<button
					type="button"
					className={className}
					onClick={(e) => {
						onClick?.(e);
						requestLiveShare(false);
					}}
				>
					<Icon name="locate" size={18} />
					Stop sharing location
				</button>
			</>
		);
	}

	return (
		<button
			type="button"
			className={className}
			onClick={(e) => {
				onClick?.(e);
				requestLiveShare(true);
			}}
		>
			<Icon name="locate" size={18} />
			Share live location
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
