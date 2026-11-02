import { LIVE_LOCATION_WATCHER_TOUCH_MS } from '$lib/live-location';
import { readContextFile, writeContextFile } from './context-io';

const WATCH_TOUCH_FILE = 'live-watch-touch.json';

export async function touchLiveWatchSession(): Promise<void> {
	await writeContextFile(WATCH_TOUCH_FILE, `${JSON.stringify({ at: Date.now() })}\n`);
}

export async function liveWatchersActive(
	withinMs = LIVE_LOCATION_WATCHER_TOUCH_MS
): Promise<boolean> {
	const raw = await readContextFile(WATCH_TOUCH_FILE);
	if (!raw.trim()) return false;
	try {
		const at = Number((JSON.parse(raw) as { at?: unknown }).at);
		return Number.isFinite(at) && Date.now() - at < withinMs;
	} catch {
		return false;
	}
}
