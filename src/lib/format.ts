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

export function roundKm(meters: number): number {
	return Math.round((meters / 1000) * 100) / 100;
}
