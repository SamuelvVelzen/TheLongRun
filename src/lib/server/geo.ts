import tzlookup from 'tz-lookup';
import { iso1A2Code } from '@rapideditor/country-coder';

/** IANA timezone for a coordinate (offline), or null if it can't be resolved. */
export function timezoneForCoord(lat: number, lng: number): string | null {
	try {
		return tzlookup(lat, lng);
	} catch {
		return null;
	}
}

/** Country name for a coordinate (offline point-in-polygon), or '' if unknown. */
export function countryForCoord(lat: number, lng: number): string {
	const code = iso1A2Code([lng, lat]);
	if (!code) return '';
	try {
		return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
	} catch {
		return code;
	}
}
