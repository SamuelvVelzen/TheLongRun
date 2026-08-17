import tzlookup from 'tz-lookup';

/** IANA timezone for a coordinate (offline), or null if it can't be resolved. */
export function timezoneForCoord(lat: number, lng: number): string | null {
	try {
		return tzlookup(lat, lng);
	} catch {
		return null;
	}
}

export type GeoPlace = { country: string; province: string; place: string };

const EMPTY_PLACE: GeoPlace = { country: '', province: '', place: '' };

/**
 * Reverse-geocode a coordinate to country / province / municipality via OpenStreetMap's Nominatim
 * (network, best-effort). Returns empty strings on any failure so callers never break on it.
 * Fair-use: one request per activity + a throttled backfill; sends an identifying User-Agent.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<GeoPlace> {
	try {
		const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=12&accept-language=en`;
		const res = await fetch(url, {
			headers: { 'User-Agent': 'the-long-run/1.0 (personal training tracker)' }
		});
		if (!res.ok) return EMPTY_PLACE;
		const data = (await res.json()) as { address?: Record<string, string> };
		const a = data.address ?? {};
		return {
			country: a.country ?? '',
			province: a.state ?? a.province ?? a.region ?? '',
			place:
				a.city ?? a.town ?? a.village ?? a.municipality ?? a.suburb ?? a.county ?? ''
		};
	} catch {
		return EMPTY_PLACE;
	}
}
