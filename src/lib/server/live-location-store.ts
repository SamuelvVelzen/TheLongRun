import {
	parseLiveRouteSlug,
	roundCoord,
	roundHeading,
	type LiveLocationPing
} from '$lib/live-location';
import { haversineMeters } from '$lib/splits';
import { readContextFile, writeContextFile } from './context-io';

const LIVE_LOCATION_FILE = 'live-location.json';
const LIVE_MOVE_MIN_M = 45;

function parseLiveLocation(raw: string): LiveLocationPing | null {
	if (!raw.trim()) return null;
	try {
		const o = JSON.parse(raw) as {
			lat?: unknown;
			lng?: unknown;
			accuracy?: unknown;
			heading?: unknown;
			updatedAt?: unknown;
			lastMovedAt?: unknown;
			routeSlug?: unknown;
		};
		const lat = Number(o.lat);
		const lng = Number(o.lng);
		const updatedAt = Number(o.updatedAt);
		if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(updatedAt)) return null;
		if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
		const acc = o.accuracy == null ? null : Number(o.accuracy);
		const lastMovedAt = Number(o.lastMovedAt);
		return {
			lat,
			lng,
			accuracy: Number.isFinite(acc) && acc! >= 0 ? acc : null,
			heading: roundHeading(o.heading),
			updatedAt,
			lastMovedAt: Number.isFinite(lastMovedAt) ? lastMovedAt : updatedAt,
			routeSlug: parseLiveRouteSlug(o.routeSlug)
		};
	} catch {
		return null;
	}
}

export async function loadLiveLocation(): Promise<LiveLocationPing | null> {
	return parseLiveLocation(await readContextFile(LIVE_LOCATION_FILE));
}

export async function saveLiveLocation(pos: {
	lat: number;
	lng: number;
	accuracy?: number | null;
	heading?: number | null;
	routeSlug?: string | null;
}): Promise<LiveLocationPing> {
	const prev = parseLiveLocation(await readContextFile(LIVE_LOCATION_FILE));
	const now = Date.now();
	const lat = roundCoord(pos.lat);
	const lng = roundCoord(pos.lng);
	let lastMovedAt = now;
	if (prev) {
		const moved = haversineMeters(prev.lat, prev.lng, lat, lng);
		lastMovedAt = moved >= LIVE_MOVE_MIN_M ? now : prev.lastMovedAt ?? prev.updatedAt;
	}
	const acc = pos.accuracy == null ? null : Number(pos.accuracy);
	const next: LiveLocationPing = {
		lat,
		lng,
		accuracy: Number.isFinite(acc) && acc! >= 0 ? Math.round(acc!) : null,
		heading: roundHeading(pos.heading),
		updatedAt: now,
		lastMovedAt,
		routeSlug: parseLiveRouteSlug(pos.routeSlug)
	};
	await writeContextFile(LIVE_LOCATION_FILE, `${JSON.stringify(next)}\n`);
	return next;
}

export async function clearLiveLocation(): Promise<void> {
	await writeContextFile(LIVE_LOCATION_FILE, '');
}
