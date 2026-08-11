import { formatPace } from '$lib/format';
import { buildHrZoneSummary, type HrZoneSummary } from '$lib/hr-zones';

export interface TrackSample {
	lat: number;
	lng: number;
	/** Epoch milliseconds when available. */
	timeMs?: number;
	hr?: number;
	elev?: number;
}

export interface KmSplit {
	/** 1-based km index (partial last split keeps sequential index). */
	km: number;
	distanceKm: number;
	pace: string;
	seconds: number;
	avgHr: number | null;
	isPartial: boolean;
}

export interface KmMarker {
	km: number;
	lat: number;
	lng: number;
}

export interface RouteAnalytics {
	splits: KmSplit[];
	hrZones: HrZoneSummary | null;
	kmMarkers: KmMarker[];
	/** Downsampled per-point HR series (epoch seconds + bpm) for recomputing zones. */
	hrSamples?: { t: number; hr: number }[];
}

const EARTH_M = 6371000;
/** Gaps longer than this are treated as pauses (excluded from moving time). */
const MAX_MOVING_GAP_S = 45;

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
	const toRad = (d: number) => (d * Math.PI) / 180;
	const dLat = toRad(lat2 - lat1);
	const dLng = toRad(lng2 - lng1);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
	return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

function interpolateSample(a: TrackSample, b: TrackSample, t: number): TrackSample {
	return {
		lat: lerp(a.lat, b.lat, t),
		lng: lerp(a.lng, b.lng, t),
		timeMs:
			a.timeMs != null && b.timeMs != null ? Math.round(lerp(a.timeMs, b.timeMs, t)) : undefined,
		hr: a.hr != null && b.hr != null ? Math.round(lerp(a.hr, b.hr, t)) : (b.hr ?? a.hr),
		elev: a.elev != null && b.elev != null ? lerp(a.elev, b.elev, t) : (b.elev ?? a.elev)
	};
}

function movingSegSeconds(a: TrackSample, b: TrackSample, frac = 1): number {
	if (a.timeMs == null || b.timeMs == null) return 0;
	const dt = ((b.timeMs - a.timeMs) / 1000) * frac;
	if (!Number.isFinite(dt) || dt <= 0 || dt > MAX_MOVING_GAP_S) return 0;
	return dt;
}

/**
 * Per-km splits + km markers from GPS.
 * Requires timestamps on enough points to compute pace; otherwise returns empty splits
 * (markers still computed from distance alone when possible).
 * Split duration uses moving time (pauses / large GPS gaps excluded).
 */
export function computeRouteAnalytics(
	samples: TrackSample[],
	opts?: {
		avgHr?: number | null;
		maxHr?: number | null;
		profileMaxHr?: number | null;
	}
): RouteAnalytics | null {
	const pts = samples.filter(
		(p) =>
			Number.isFinite(p.lat) &&
			Number.isFinite(p.lng) &&
			Math.abs(p.lat) <= 90 &&
			Math.abs(p.lng) <= 180 &&
			!(p.lat === 0 && p.lng === 0)
	);
	if (pts.length < 2) return null;

	const canPace = pts.filter((p) => p.timeMs != null && Number.isFinite(p.timeMs)).length >= 2;

	const splits: KmSplit[] = [];
	const kmMarkers: KmMarker[] = [];

	let cum = 0;
	let nextKm = 1000;
	let splitStartCum = 0;
	let splitMoving = 0;
	const hrBuf: number[] = [];

	const finishSplit = (endCum: number, isPartial: boolean) => {
		const distM = endCum - splitStartCum;
		if (distM < 50) return;
		const distanceKm = Math.round((distM / 1000) * 100) / 100;
		let seconds = 0;
		let pace = '';
		if (canPace) {
			seconds = Math.max(1, Math.round(splitMoving));
			pace = formatPace(distM, seconds);
			if (!pace) return;
		}
		const avgHr = hrBuf.length
			? Math.round(hrBuf.reduce((a, b) => a + b, 0) / hrBuf.length)
			: null;
		splits.push({
			km: splits.length + 1,
			distanceKm,
			pace,
			seconds,
			avgHr,
			isPartial
		});
	};

	for (let i = 1; i < pts.length; i++) {
		const a = pts[i - 1]!;
		const b = pts[i]!;
		const seg = haversineMeters(a.lat, a.lng, b.lat, b.lng);
		if (!Number.isFinite(seg) || seg <= 0) continue;
		// Skip GPS jumps — do not inflate distance
		if (seg > 200) continue;

		const startCum = cum;
		const endCum = cum + seg;
		const fullMoving = canPace ? movingSegSeconds(a, b, 1) : 0;

		let consumed = 0;
		while (nextKm <= endCum) {
			const t = seg > 0 ? (nextKm - startCum) / seg : 0;
			const at = interpolateSample(a, b, Math.min(1, Math.max(0, t)));
			kmMarkers.push({ km: nextKm / 1000, lat: at.lat, lng: at.lng });

			const frac = Math.min(1, Math.max(0, t)) - consumed;
			if (canPace && frac > 0) {
				splitMoving += movingSegSeconds(a, b, frac);
			}

			if (canPace) finishSplit(nextKm, false);

			splitStartCum = nextKm;
			splitMoving = 0;
			hrBuf.length = 0;
			if (at.hr != null && at.hr > 0) hrBuf.push(at.hr);
			consumed = Math.min(1, Math.max(0, t));
			nextKm += 1000;
		}

		const remainFrac = 1 - consumed;
		if (canPace && remainFrac > 0) {
			splitMoving += fullMoving > 0 ? fullMoving * remainFrac : movingSegSeconds(a, b, remainFrac);
		}

		if (b.hr != null && b.hr > 0) hrBuf.push(b.hr);
		cum = endCum;
	}

	if (canPace && cum - splitStartCum >= 150) {
		finishSplit(cum, true);
	}

	const hrMax = opts?.profileMaxHr ?? opts?.maxHr ?? null;
	const hrSamplesFull = pts
		.filter((p) => p.timeMs != null && p.hr != null && p.hr > 0)
		.map((p) => ({ timeMs: p.timeMs!, hr: p.hr! }));
	const hrZones = buildHrZoneSummary({
		hrMax,
		source: opts?.profileMaxHr != null ? 'profile' : 'activity',
		avgHr: opts?.avgHr ?? null,
		samples: hrSamplesFull
	});

	if (!splits.length && !kmMarkers.length && !hrZones) return null;

	return {
		splits: canPace ? splits : [],
		hrZones,
		kmMarkers,
		hrSamples: hrSamplesFull.map((s) => ({ t: Math.round(s.timeMs / 1000), hr: s.hr }))
	};
}

/** Serialize for GeoJSON properties (compact). */
export function analyticsToProperties(analytics: RouteAnalytics): Record<string, unknown> {
	// Cap the stored HR series so properties stay small; ~360 points keeps zone math faithful.
	const series = analytics.hrSamples ?? [];
	const cap = 360;
	const step = series.length > cap ? (series.length - 1) / (cap - 1) : 1;
	const hrSeries =
		series.length > cap
			? Array.from({ length: cap }, (_, i) => series[Math.round(i * step)]!)
			: series;
	return {
		splits: analytics.splits,
		hr_zones: analytics.hrZones,
		km_markers: analytics.kmMarkers,
		hr_series: hrSeries.map((s) => [s.t, s.hr])
	};
}

/** Read analytics from GeoJSON Feature properties. */
export function analyticsFromProperties(props: unknown): RouteAnalytics | null {
	if (!props || typeof props !== 'object') return null;
	const p = props as Record<string, unknown>;
	const splits = Array.isArray(p.splits) ? (p.splits as KmSplit[]) : [];
	const kmMarkers = Array.isArray(p.km_markers) ? (p.km_markers as KmMarker[]) : [];
	const hrZones =
		p.hr_zones && typeof p.hr_zones === 'object' ? (p.hr_zones as HrZoneSummary) : null;
	const hrSamples = Array.isArray(p.hr_series)
		? (p.hr_series as [number, number][])
				.filter((pair) => Array.isArray(pair) && pair.length === 2)
				.map(([t, hr]) => ({ t, hr }))
		: [];
	if (!splits.length && !kmMarkers.length && !hrZones && !hrSamples.length) return null;
	return { splits, hrZones, kmMarkers, hrSamples };
}
