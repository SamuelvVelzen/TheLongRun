/** Live location broadcast: one ping in the context table, polled by maps. */

import { haversineMeters } from './splits';
import type { RouteTrack } from './types';

export const LIVE_LOCATION_PING_MS = 30_000;
/** Faster poll / broadcast while someone is watching the live map. */
export const LIVE_LOCATION_ACTIVE_PING_MS = 5_000;
/** Ping received recently — “live” (green). */
export const LIVE_LOCATION_FRESH_MS = 50_000;
/** No ping for a while — likely app backgrounded or closed. */
export const LIVE_LOCATION_UPDATE_STALE_MS = 2 * 60_000;
/** Same spot for a long time — suggest checking in. */
export const LIVE_LOCATION_IDLE_MOVE_MS = 20 * 60_000;
/** Watcher heartbeats within this window → treat as “following”. */
export const LIVE_LOCATION_WATCHER_TOUCH_MS = 90_000;
/** @deprecated use LIVE_LOCATION_UPDATE_STALE_MS on the client */
export const LIVE_LOCATION_STALE_MS = LIVE_LOCATION_UPDATE_STALE_MS;
export const LIVE_SHARE_KEY = 'tlr-live-share';
export const LIVE_SHARE_ROUTE_KEY = 'tlr-live-share-route';
export const LIVE_SHARE_EVENT = 'tlr-live-share';
export const LIVE_SHARE_REQUEST = 'tlr-live-share-request';
export const LIVE_PING_EVENT = 'tlr-live-ping';
/** Full-page live map (replaces overlay). */
export const LIVE_MAP_PATH = '/live';
/** Navigate to `LIVE_MAP_PATH` from non-React code (menus, map chrome, share flow). */
export const LIVE_MAP_NAV_EVENT = 'tlr-live-map-nav';

export type LiveLocationPing = {
	lat: number;
	lng: number;
	accuracy: number | null;
	/** Degrees clockwise from true north, when known. */
	heading: number | null;
	updatedAt: number;
	/** Last time the pin moved meaningfully (defaults to updatedAt on first ping). */
	lastMovedAt: number;
	/** Optional planned route slug — watchers see this track on the map. */
	routeSlug: string | null;
};

export type LivePingSignal = 'fresh' | 'stale' | 'idle';

/** `getLiveLocation` adds route track and watcher hint when available. */
export type LiveLocationView = LiveLocationPing & {
	routeTrack: RouteTrack | null;
	watchersActive?: boolean;
};

export type LiveShareDetail = { sharing: boolean };
export type LiveShareRequestDetail = { want: boolean };
export type LivePingDetail = { ping: LiveLocationView | null };

export function isLiveLocationFresh(updatedAt: number, now = Date.now()): boolean {
	return Number.isFinite(updatedAt) && now - updatedAt < LIVE_LOCATION_FRESH_MS;
}

export function livePingSignal(
	ping: Pick<LiveLocationPing, 'updatedAt' | 'lastMovedAt'>,
	now = Date.now()
): LivePingSignal {
	if (!Number.isFinite(ping.updatedAt) || now - ping.updatedAt > LIVE_LOCATION_UPDATE_STALE_MS) {
		return 'stale';
	}
	const movedAt = ping.lastMovedAt ?? ping.updatedAt;
	if (now - movedAt > LIVE_LOCATION_IDLE_MOVE_MS) return 'idle';
	return 'fresh';
}

export function livePingFollowerCopy(
	ping: Pick<LiveLocationPing, 'updatedAt' | 'lastMovedAt'>,
	now = Date.now()
): { title: string; detail: string | null; signal: LivePingSignal } {
	const signal = livePingSignal(ping, now);
	const ago = liveAgo(ping.updatedAt, now);
	if (signal === 'stale') {
		return {
			signal,
			title: 'Live — updates paused.',
			detail: `Last seen ${ago}. They may have closed the app — try checking in.`
		};
	}
	if (signal === 'idle') {
		return {
			signal,
			title: 'Live — no movement in a while.',
			detail: `Still at the last pin (${ago}). Check in with them if that seems off.`
		};
	}
	return {
		signal,
		title: 'Live location is on the map.',
		detail: null
	};
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

export function requestLiveWatch(_ping?: LiveLocationView | null) {
	if (typeof window === 'undefined') return;
	if (window.location.pathname === LIVE_MAP_PATH) return;
	window.dispatchEvent(new CustomEvent(LIVE_MAP_NAV_EVENT));
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

/** Distance along a shared planned route for the live pin (km). */
export function liveRouteKmProgress(
	ping: Pick<LiveLocationView, 'lat' | 'lng' | 'routeTrack'>
): { alongKm: number; totalKm: number } | null {
	const coords = ping.routeTrack?.coords;
	if (!coords || coords.length < 2) return null;
	let totalM = 0;
	const segLen: number[] = [];
	for (let i = 1; i < coords.length; i++) {
		const d = haversineMeters(coords[i - 1]![0], coords[i - 1]![1], coords[i]![0], coords[i]![1]);
		const seg = Number.isFinite(d) && d > 0 && d <= 200 ? d : 0;
		segLen.push(seg);
		totalM += seg;
	}
	if (totalM < 50) return null;

	let alongM = 0;
	let bestDist = Infinity;
	let prefix = 0;
	for (let i = 1; i < coords.length; i++) {
		const seg = segLen[i - 1]!;
		if (seg <= 0) continue;
		const a = coords[i - 1]!;
		const b = coords[i]!;
		const t = closestSegmentT(ping.lat, ping.lng, a[0], a[1], b[0], b[1]);
		const projLat = a[0] + (b[0] - a[0]) * t;
		const projLng = a[1] + (b[1] - a[1]) * t;
		const dist = haversineMeters(ping.lat, ping.lng, projLat, projLng);
		if (dist < bestDist) {
			bestDist = dist;
			alongM = prefix + seg * t;
		}
		prefix += seg;
	}

	return {
		alongKm: Math.round((alongM / 1000) * 10) / 10,
		totalKm: Math.round((totalM / 1000) * 10) / 10
	};
}

export function formatLiveRouteKm(progress: { alongKm: number; totalKm: number }): string {
	return `${progress.alongKm} / ${progress.totalKm} km`;
}

function closestSegmentT(
	lat: number,
	lng: number,
	aLat: number,
	aLng: number,
	bLat: number,
	bLng: number
): number {
	const dLat = bLat - aLat;
	const dLng = bLng - aLng;
	const len2 = dLat * dLat + dLng * dLng;
	if (len2 <= 0) return 0;
	const t = ((lat - aLat) * dLat + (lng - aLng) * dLng) / len2;
	return Math.min(1, Math.max(0, t));
}
