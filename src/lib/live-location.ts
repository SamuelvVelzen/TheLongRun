/** Live location broadcast: one ping in the context table, polled by maps. */

export const LIVE_LOCATION_PING_MS = 60_000;
export const LIVE_LOCATION_STALE_MS = 5 * 60_000;
export const LIVE_SHARE_KEY = 'tlr-live-share';
export const LIVE_SHARE_EVENT = 'tlr-live-share';
export const LIVE_SHARE_REQUEST = 'tlr-live-share-request';
export const LIVE_WATCH_PROMPT_KEY = 'tlr-live-watch-prompt';

export type LiveLocationPing = {
	lat: number;
	lng: number;
	accuracy: number | null;
	/** Degrees clockwise from true north, when known. */
	heading: number | null;
	updatedAt: number;
};

export type LiveShareDetail = { sharing: boolean };
export type LiveShareRequestDetail = { want: boolean };

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

export function liveShareAuthed(): boolean {
	return typeof document !== 'undefined' && document.documentElement.dataset.liveShareAuth === '1';
}

export function liveShareOn(): boolean {
	return typeof document !== 'undefined' && document.documentElement.dataset.liveShare === 'on';
}

export function liveAgo(updatedAt: number, now = Date.now()): string {
	const s = Math.max(0, Math.round((now - updatedAt) / 1000));
	if (s < 45) return 'just now';
	const m = Math.max(1, Math.round(s / 60));
	return m === 1 ? '1 min ago' : `${m} min ago`;
}

export function liveWatchPromptSeen(): boolean {
	try {
		return sessionStorage.getItem(LIVE_WATCH_PROMPT_KEY) === '1';
	} catch {
		return false;
	}
}

export function setLiveWatchPromptSeen() {
	try {
		sessionStorage.setItem(LIVE_WATCH_PROMPT_KEY, '1');
	} catch {
		/* ignore */
	}
}
