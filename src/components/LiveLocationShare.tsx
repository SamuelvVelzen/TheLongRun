import { useAuthed } from '$lib/auth';
import {
	LIVE_LOCATION_PING_MS,
	LIVE_SHARE_EVENT,
	LIVE_SHARE_REQUEST,
	liveShareWanted,
	requestLiveShare,
	setLiveShareWanted,
	syncLiveShareDom,
	type LiveShareDetail,
	type LiveShareRequestDetail
} from '$lib/live-location';
import { getLastHeading, noteGpsHeading, retainHeadingTrack } from '$lib/location-heading';
import { pingLiveLocation, stopLiveLocation } from '$lib/server/functions';
import { cn, ui } from '$lib/ui';
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
	const snack = useSnackbar();
	const [sharing, setSharing] = useState(false);
	const [confirmOpen, setConfirmOpen] = useState(false);
	const sharingRef = useRef(false);
	const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const releaseHeadingRef = useRef<(() => void) | null>(null);

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
		releaseHeadingRef.current?.();
		releaseHeadingRef.current = null;
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
		releaseHeadingRef.current?.();
		releaseHeadingRef.current = retainHeadingTrack();
		if (timerRef.current) clearInterval(timerRef.current);
		timerRef.current = setInterval(() => {
			void ping().catch(() => {
				/* keep sharing; retry next minute */
			});
		}, LIVE_LOCATION_PING_MS);
	}, [ping, setOn, snack]);

	useLayoutEffect(() => {
		syncLiveShareDom(authed, sharingRef.current);
	}, [authed]);

	useEffect(() => {
		if (!authed) {
			sharingRef.current = false;
			setSharing(false);
			syncLiveShareDom(false, false);
			if (timerRef.current) {
				clearInterval(timerRef.current);
				timerRef.current = null;
			}
			releaseHeadingRef.current?.();
			releaseHeadingRef.current = null;
			return;
		}
		if (liveShareWanted() && !sharingRef.current) void start();
	}, [authed, start]);

	useEffect(() => {
		return () => {
			if (timerRef.current) {
				clearInterval(timerRef.current);
				timerRef.current = null;
			}
			releaseHeadingRef.current?.();
			releaseHeadingRef.current = null;
		};
	}, []);

	useEffect(() => {
		if (!authed) return;
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
	}, [authed, ping, stop]);

	if (!authed) return null;

	return (
		<>
			<Dialog
				open={confirmOpen}
				title="Share live location"
				onClose={() => setConfirmOpen(false)}
				actions={
					<>
						<button className={ui.btnGhost} type="button" onClick={() => setConfirmOpen(false)}>
							Cancel
						</button>
						<button className={ui.btnPrimary} type="button" onClick={() => void start()}>
							Share
						</button>
					</>
				}
			>
				<p className={cn(ui.muted, 'm-0 leading-[1.45]')}>
					Anyone looking at this site will see where you are on the map. The pin updates about
					once a minute. You can stop at any time.
				</p>
			</Dialog>
			{sharing ? (
				<div
					className="live-share-host fixed z-[55] inset-x-0 bottom-[calc(1.15rem+env(safe-area-inset-bottom,0px))] flex justify-center px-4 pointer-events-none max-sm:bottom-[calc(5.1rem+env(safe-area-inset-bottom,0px))] max-sm:px-3"
				>
					<div
						className="live-share-banner pointer-events-auto flex items-center gap-[0.45rem] w-[min(32rem,100%)] py-[0.65rem] pr-[0.45rem] pl-[0.9rem] rounded-[14px] border border-accent/40 bg-surface shadow-lift"
						role="status"
					>
						<span className="size-2 shrink-0 rounded-full bg-accent" aria-hidden="true" />
						<p className="m-0 flex-1 text-[0.88rem] leading-[1.35]">
							Location is being shared on the map.
						</p>
						<button className={ui.snackAction} type="button" onClick={() => void stop()}>
							Stop
						</button>
					</div>
				</div>
			) : null}
		</>
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
