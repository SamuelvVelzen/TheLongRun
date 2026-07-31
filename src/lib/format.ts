/** Parse duration `M:SS`, `MM:SS`, or `H:MM:SS` → seconds. */
export function parseDurationSeconds(raw: string | null | undefined): number | null {
	const s = String(raw ?? '').trim();
	if (!s) return null;
	const parts = s.split(':').map((p) => Number(p));
	if (parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
	if (parts.length === 2) return parts[0] * 60 + parts[1];
	if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
	return null;
}

/** Normalize to `HH:mm` from `HH:mm`, `H:mm`, `HH:mm:ss`, or ISO-ish local datetime. */
export function normalizeStartTime(raw: string | null | undefined): string {
	const s = String(raw ?? '').trim();
	if (!s) return '';
	const hm = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
	if (hm) {
		const h = Number(hm[1]);
		const m = Number(hm[2]);
		if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
			return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
		}
		return '';
	}
	const iso = s.match(/T(\d{2}):(\d{2})/);
	if (iso) return `${iso[1]}:${iso[2]}`;
	const d = new Date(s);
	if (!Number.isNaN(d.getTime())) {
		return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
	}
	return '';
}

/** Format local Date → `HH:mm`. */
export function formatClockTime(d: Date | null | undefined): string {
	if (!d || Number.isNaN(d.getTime())) return '';
	return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function dayFromIsoDate(iso: string): string {
	const d = new Date(`${iso}T12:00:00`);
	if (Number.isNaN(d.getTime())) return 'Tuesday';
	return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
		d.getDay()
	];
}

export function guessSession(day: string, distanceKm: number | null): string {
	if (day === 'Sunday') return 'long';
	if (distanceKm != null && distanceKm >= 11) return 'long';
	if (day === 'Friday') return 'quality';
	return 'easy';
}

export function formatDuration(totalSeconds: number): string {
	if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '';
	const s = Math.round(totalSeconds);
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = s % 60;
	if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
	return `${m}:${String(sec).padStart(2, '0')}`;
}

export function formatPace(distanceMeters: number, movingSeconds: number): string {
	if (!distanceMeters || !movingSeconds) return '';
	const pace = movingSeconds / (distanceMeters / 1000);
	if (!Number.isFinite(pace) || pace <= 0) return '';
	const m = Math.floor(pace / 60);
	const s = Math.round(pace % 60);
	return `${m}:${String(s).padStart(2, '0')}`;
}

/** Strava CSV Average Speed is m/s → pace min/km. */
export function formatPaceFromSpeedMps(speedMps: number): string {
	if (!Number.isFinite(speedMps) || speedMps <= 0) return '';
	const pace = 1000 / speedMps;
	if (!Number.isFinite(pace) || pace <= 0) return '';
	const m = Math.floor(pace / 60);
	const s = Math.round(pace % 60);
	return `${m}:${String(s).padStart(2, '0')}`;
}

/** m/s → km/h, one decimal. */
export function mpsToKmh(speedMps: number): number | null {
	if (!Number.isFinite(speedMps) || speedMps <= 0) return null;
	return Math.round(speedMps * 3.6 * 10) / 10;
}

export function roundKm(meters: number): number {
	return Math.round((meters / 1000) * 100) / 100;
}

/** Round elevation meters to one decimal (or whole if near-integer). */
export function roundElev(meters: number): number {
	return Math.round(meters * 10) / 10;
}
