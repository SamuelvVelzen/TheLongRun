/** Live location broadcast: one ping in the context table, polled by maps. */

import type { RouteTrack } from './types';

export const LIVE_LOCATION_PING_MS = 30_000;
export const LIVE_LOCATION_STALE_MS = 5 * 60_000;
export const LIVE_SHARE_KEY = 'tlr-live-share';
export const LIVE_SHARE_ROUTE_KEY = 'tlr-live-share-route';
export const LIVE_SHARE_EVENT = 'tlr-live-share';
export const LIVE_SHARE_REQUEST = 'tlr-live-share-request';
export const LIVE_WATCH_REQUEST = 'tlr-live-watch-request';
export const LIVE_PING_EVENT = 'tlr-live-ping';

export type LiveLocationPing = {
	lat: number;
	lng: number;
	accuracy: number | null;
	/** Degrees clockwise from true north, when known. */
	heading: number | null;
	updatedAt: number;
	/** Optional planned route slug — watchers see this track on the map. */
	routeSlug: string | null;
};

/** `getLiveLocation` adds the downsampled track when `routeSlug` is set. */
export type LiveLocationView = LiveLocationPing & {
	routeTrack: RouteTrack | null;
};

export type LiveShareDetail = { sharing: boolean };
export type LiveShareRequestDetail = { want: boolean };
export type LivePingDetail = { ping: LiveLocationView | null };

export function isLiveLocationFresh(updatedAt: number, now = Date.now()): boolean {
	return Number.isFinite(updatedAt) && now - updatedAt < LIVE_LOCATION_STALE_MS;
}

export function roundCoord(n: number): number {
	return Math.round(n * 1e5) / 1e5;
}

export function roundHeading(deg: unknown): number | null {
	const n = Number(deg);
	if (!Number.isFinite(n) || n < 0) return null;
	return Math.round(((n % 360) + 360) % 360);
}

export function liveShareWanted(): boolean {
	try {
		return localStorage.getItem(LIVE_SHARE_KEY) === '1';
	} catch {
		return false;
	}
}

export function setLiveShareWanted(on: boolean) {
	try {
		if (on) localStorage.setItem(LIVE_SHARE_KEY, '1');
		else localStorage.removeItem(LIVE_SHARE_KEY);
	} catch {
		/* ignore */
	}
}

export function liveShareRouteSlug(): string | null {
	try {
		const s = localStorage.getItem(LIVE_SHARE_ROUTE_KEY)?.trim();
		return s || null;
	} catch {
		return null;
	}
}

export function setLiveShareRouteSlug(slug: string | null) {
	try {
		const s = slug?.trim();
		if (s) localStorage.setItem(LIVE_SHARE_ROUTE_KEY, s);
		else localStorage.removeItem(LIVE_SHARE_ROUTE_KEY);
	} catch {
		/* ignore */
	}
}

export function parseLiveRouteSlug(raw: unknown): string | null {
	if (raw == null || raw === '') return null;
	const s = String(raw).trim();
	if (!s || s.includes('..') || s.includes('/') || s.includes('\\')) return null;
	return s;
}

export function syncLiveShareDom(authed: boolean, sharing: boolean) {
	if (typeof document === 'undefined') return;
	document.documentElement.dataset.liveShareAuth = authed ? '1' : '0';
	document.documentElement.dataset.liveShare = sharing ? 'on' : 'off';
	window.dispatchEvent(new CustomEvent<LiveShareDetail>(LIVE_SHARE_EVENT, { detail: { sharing } }));
}

export function requestLiveShare(want: boolean) {
	window.dispatchEvent(
		new CustomEvent<LiveShareRequestDetail>(LIVE_SHARE_REQUEST, { detail: { want } })
	);
}

export function requestLiveWatch() {
	window.dispatchEvent(new CustomEvent(LIVE_WATCH_REQUEST));
}

export function dispatchLivePing(ping: LiveLocationView | null) {
	window.dispatchEvent(new CustomEvent<LivePingDetail>(LIVE_PING_EVENT, { detail: { ping } }));
}

export function liveShareAuthed(): boolean {
	return typeof document !== 'undefined' && document.documentElement.dataset.liveShareAuth === '1';
}

export function liveShareOn(): boolean {
	return typeof document !== 'undefined' && document.documentElement.dataset.liveShare === 'on';
}

export function liveAgo(updatedAt: number, now = Date.now()): string {
	const s = Math.max(0, Math.round((now - updatedAt) / 1000));
	if (s < 22) return 'just now';
	const m = Math.max(1, Math.round(s / 60));
	return m === 1 ? '1 min ago' : `${m} min ago`;
}
