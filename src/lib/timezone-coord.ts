import tzlookup from 'tz-lookup';

/** IANA timezone for a coordinate (offline), or null if it can't be resolved. */
export function timezoneForCoord(lat: number, lng: number): string | null {
	try {
		return tzlookup(lat, lng);
	} catch {
		return null;
	}
}
