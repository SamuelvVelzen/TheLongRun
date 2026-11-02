import { subscribeAppResume } from '$lib/app-resume';
import { fetchLiveLocation } from '$lib/fetch-live-location';
import {
	LIVE_LOCATION_ACTIVE_PING_MS,
	LIVE_LOCATION_PING_MS,
	LIVE_MAP_PATH,
	LIVE_PING_EVENT,
	LIVE_SHARE_EVENT,
	dispatchLivePing,
	type LiveLocationView,
	type LivePingDetail
} from '$lib/live-location';
import { touchLiveWatch } from '$lib/server/functions';
import { useRouterState } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

function useLiveLocationPollLoop(watchMap: boolean) {
	useEffect(() => {
		let cancelled = false;
		let pollTimer: ReturnType<typeof setTimeout> | null = null;

		const clearPoll = () => {
			if (pollTimer != null) {
				clearTimeout(pollTimer);
				pollTimer = null;
			}
		};

		const poll = () => {
			void fetchLiveLocation()
				.then((next) => {
					if (cancelled) return;
					dispatchLivePing(next);
				})
				.catch(() => {
					/* ignore */
				});
			if (watchMap) {
				void touchLiveWatch().catch(() => {
					/* ignore */
				});
			}
		};

		const schedule = () => {
			clearPoll();
			const ms = watchMap ? LIVE_LOCATION_ACTIVE_PING_MS : LIVE_LOCATION_PING_MS;
			pollTimer = setTimeout(() => {
				poll();
				schedule();
			}, ms);
		};

		poll();
		schedule();
		const offResume = subscribeAppResume(poll);
		const onShare = () => poll();
		window.addEventListener(LIVE_SHARE_EVENT, onShare);
		return () => {
			cancelled = true;
			clearPoll();
			offResume();
			window.removeEventListener(LIVE_SHARE_EVENT, onShare);
		};
	}, [watchMap]);
}

/** Single app-wide poll; faster on `/live`. */
export function LiveLocationPoll() {
	const onLiveMap = useRouterState({
		select: (s) => s.location.pathname === LIVE_MAP_PATH
	});
	useLiveLocationPollLoop(onLiveMap);
	return null;
}

/** Subscribe to poll results (see `LiveLocationPoll`). */
export function useLiveLocationPing(): LiveLocationView | null {
	const [ping, setPing] = useState<LiveLocationView | null>(null);
	const onLiveMap = useRouterState({
		select: (s) => s.location.pathname === LIVE_MAP_PATH
	});

	useEffect(() => {
		const onPing = (e: Event) => {
			setPing((e as CustomEvent<LivePingDetail>).detail?.ping ?? null);
		};
		window.addEventListener(LIVE_PING_EVENT, onPing);
		return () => window.removeEventListener(LIVE_PING_EVENT, onPing);
	}, []);

	useEffect(() => {
		if (!onLiveMap) return;
		let cancelled = false;

		const pull = () => {
			void fetchLiveLocation()
				.then((next) => {
					if (cancelled) return;
					setPing(next);
					dispatchLivePing(next);
				})
				.catch(() => {
					/* ignore */
				});
		};

		pull();
		const onShare = () => pull();
		const onVisible = () => {
			if (document.visibilityState === 'visible') pull();
		};
		window.addEventListener(LIVE_SHARE_EVENT, onShare);
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			cancelled = true;
			window.removeEventListener(LIVE_SHARE_EVENT, onShare);
			document.removeEventListener('visibilitychange', onVisible);
		};
	}, [onLiveMap]);

	return ping;
}
