import { normalizeActivityType } from '$lib/activity';
import {
	computeBestEffortsFromTrack,
	mergeFastestEfforts,
	supportsBestEfforts,
	type BestEffort
} from '$lib/best-efforts';
import { computeRouteAnalyticsFromParts, haversineMeters, type RouteAnalytics, type TrackSample } from '$lib/splits';
import type { RunRecord } from '$lib/types';

/** Watch-restart / new file: treat as one stream for rolling efforts. */
export const SHORT_COMBINE_GAP_MS = 3 * 60 * 1000;
/** Bigger than this between files is a teleport, not running. */
export const COMBINE_HOP_M = 200;

export type GeoTrack = {
	points: TrackSample[];
	coords: [number, number][];
};

function num(v: unknown): number | null {
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
}

function interpolateHr(timeMs: number, series: { tMs: number; hr: number }[]): number | undefined {
	if (!series.length) return undefined;
	if (timeMs <= series[0]!.tMs) return series[0]!.hr;
	const last = series[series.length - 1]!;
	if (timeMs >= last.tMs) return last.hr;
	for (let i = 1; i < series.length; i++) {
		const a = series[i - 1]!;
		const b = series[i]!;
		if (timeMs > b.tMs) continue;
		const span = b.tMs - a.tMs;
		if (span <= 0) return b.hr;
		const t = (timeMs - a.tMs) / span;
		return Math.round(a.hr + (b.hr - a.hr) * t);
	}
	return last.hr;
}

/** Rebuild timed samples (with optional ele + HR) from stored GeoJSON. */
export function trackFromGeoJson(geo: unknown): GeoTrack {
	if (!geo || typeof geo !== 'object') return { points: [], coords: [] };
	const g = geo as {
		geometry?: { coordinates?: unknown };
		properties?: { times?: unknown; hr_series?: unknown };
	};
	const raw = g.geometry?.coordinates;
	if (!Array.isArray(raw) || raw.length < 2) return { points: [], coords: [] };

	const times = Array.isArray(g.properties?.times) ? g.properties.times : [];
	const hrRaw = Array.isArray(g.properties?.hr_series) ? g.properties.hr_series : [];
	const hrSeries = (hrRaw as unknown[])
		.map((pair) => {
			if (!Array.isArray(pair) || pair.length < 2) return null;
			const t = Number(pair[0]);
			const hr = Number(pair[1]);
			if (!Number.isFinite(t) || !Number.isFinite(hr) || hr <= 0) return null;
			return { tMs: t > 1e12 ? t : t * 1000, hr };
		})
		.filter((x): x is { tMs: number; hr: number } => x != null)
		.sort((a, b) => a.tMs - b.tMs);

	const points: TrackSample[] = [];
	const coords: [number, number][] = [];
	for (let i = 0; i < raw.length; i++) {
		const c = raw[i];
		if (!Array.isArray(c) || c.length < 2) continue;
		const lng = Number(c[0]);
		const lat = Number(c[1]);
		if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
		coords.push([lat, lng]);
		const sample: TrackSample = { lat, lng };
		const ele = c.length >= 3 ? num(c[2]) : null;
		if (ele != null) sample.elev = ele;
		const timeMs = i < times.length ? num(times[i]) : null;
		if (timeMs != null) {
			sample.timeMs = timeMs;
			const hr = interpolateHr(timeMs, hrSeries);
			if (hr != null && hr > 0) sample.hr = hr;
		}
		points.push(sample);
	}
	return { points, coords };
}

export function pieceTracksForEfforts(parts: TrackSample[][]): TrackSample[][] {
	const pieces: TrackSample[][] = [];
	for (const part of parts) {
		const samples = part.filter(
			(p) =>
				Number.isFinite(p.lat) &&
				Number.isFinite(p.lng) &&
				p.timeMs != null &&
				Number.isFinite(p.timeMs)
		);
		if (samples.length < 2) continue;
		const prev = pieces[pieces.length - 1];
		if (!prev) {
			pieces.push([...samples]);
			continue;
		}
		const a = prev[prev.length - 1]!;
		const b = samples[0]!;
		const dt = (b.timeMs ?? 0) - (a.timeMs ?? 0);
		const hop = haversineMeters(a.lat, a.lng, b.lat, b.lng);
		if (
			a.timeMs != null &&
			b.timeMs != null &&
			dt >= 0 &&
			dt <= SHORT_COMBINE_GAP_MS &&
			Number.isFinite(hop) &&
			hop <= COMBINE_HOP_M
		) {
			prev.push(...samples);
		} else {
			pieces.push([...samples]);
		}
	}
	return pieces;
}

export function combinedBestEfforts(
	parts: TrackSample[][],
	memberEfforts: BestEffort[][]
): BestEffort[] {
	const pieces = pieceTracksForEfforts(parts);
	const fromGps = pieces.map((p) => computeBestEffortsFromTrack(p));
	return mergeFastestEfforts([...fromGps, ...memberEfforts]);
}

export function combinedAnalytics(
	parts: TrackSample[][],
	opts?: { avgHr?: number | null; maxHr?: number | null; profileMaxHr?: number | null }
): RouteAnalytics | null {
	return computeRouteAnalyticsFromParts(
		parts.filter((p) => p.length >= 2),
		opts
	);
}

export function sameTypeForEfforts(members: Pick<RunRecord, 'activity_type'>[]): boolean {
	const types = new Set(members.map((m) => normalizeActivityType(m.activity_type)));
	if (types.size !== 1) return false;
	return supportsBestEfforts([...types][0]);
}
