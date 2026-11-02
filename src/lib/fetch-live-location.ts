import type { LiveLocationView } from './live-location';
import { getLiveLocation } from './server/functions';

/** Bypass client request memoization — live ping changes outside route loaders. */
export function fetchLiveLocation(): Promise<LiveLocationView | null> {
	return getLiveLocation({ data: { bump: Date.now() } });
}
