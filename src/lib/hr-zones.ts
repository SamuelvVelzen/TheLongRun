/** Classic 5-zone %HRmax bands (Z1–Z5). */
export const HR_ZONE_DEFS = [
	{ zone: 1, label: 'Recovery', minPct: 0, maxPct: 60 },
	{ zone: 2, label: 'Easy', minPct: 60, maxPct: 70 },
	{ zone: 3, label: 'Aerobic', minPct: 70, maxPct: 80 },
	{ zone: 4, label: 'Threshold', minPct: 80, maxPct: 90 },
	{ zone: 5, label: 'Max', minPct: 90, maxPct: 100 }
] as const;

export type HrZoneSource = 'activity' | 'profile' | 'alltime';

export interface HrZoneBand {
	zone: number;
	label: string;
	minPct: number;
	maxPct: number;
	minBpm: number;
	maxBpm: number;
	seconds: number;
	pct: number;
}

export interface HrZoneSummary {
	hrMax: number;
	source: HrZoneSource;
	/** Time-in-zone when per-point HR exists; otherwise null. */
	distribution: HrZoneBand[] | null;
	/** Zone that avg HR falls into. */
	avgZone: number | null;
	avgHr: number | null;
}

export function zoneForHr(hr: number, hrMax: number): number {
	if (!Number.isFinite(hr) || !Number.isFinite(hrMax) || hrMax <= 0) return 0;
	const pct = (hr / hrMax) * 100;
	for (const z of HR_ZONE_DEFS) {
		if (pct < z.maxPct || z.zone === 5) return z.zone;
	}
	return 5;
}

function bandShell(hrMax: number): HrZoneBand[] {
	return HR_ZONE_DEFS.map((z) => ({
		zone: z.zone,
		label: z.label,
		minPct: z.minPct,
		maxPct: z.maxPct,
		minBpm: Math.round((z.minPct / 100) * hrMax),
		maxBpm: Math.round((z.maxPct / 100) * hrMax),
		seconds: 0,
		pct: 0
	}));
}

/**
 * Build HR zone summary.
 * Prefer athlete profile max when provided; else use activity max_hr.
 */
export function buildHrZoneSummary(opts: {
	hrMax: number | null;
	source?: HrZoneSource;
	avgHr?: number | null;
	/** Samples with timeMs + hr for time-in-zone. */
	samples?: { timeMs: number; hr: number }[];
}): HrZoneSummary | null {
	const hrMax = opts.hrMax != null && opts.hrMax > 0 ? Math.round(opts.hrMax) : null;
	if (hrMax == null) return null;

	const source = opts.source ?? 'activity';
	const avgHr =
		opts.avgHr != null && Number.isFinite(opts.avgHr) && opts.avgHr > 0
			? Math.round(opts.avgHr)
			: null;
	const avgZone = avgHr != null ? zoneForHr(avgHr, hrMax) : null;

	const samples = (opts.samples ?? [])
		.filter((s) => Number.isFinite(s.timeMs) && Number.isFinite(s.hr) && s.hr > 0)
		.sort((a, b) => a.timeMs - b.timeMs);

	if (samples.length < 2) {
		return { hrMax, source, distribution: null, avgZone, avgHr };
	}

	const bands = bandShell(hrMax);
	let total = 0;
	for (let i = 1; i < samples.length; i++) {
		const dt = (samples[i]!.timeMs - samples[i - 1]!.timeMs) / 1000;
		if (!Number.isFinite(dt) || dt <= 0 || dt > 45) continue;
		const hr = samples[i]!.hr;
		const z = zoneForHr(hr, hrMax);
		const band = bands.find((b) => b.zone === z);
		if (band) {
			band.seconds += dt;
			total += dt;
		}
	}

	if (total <= 0) {
		return { hrMax, source, distribution: null, avgZone, avgHr };
	}

	for (const b of bands) {
		b.seconds = Math.round(b.seconds);
		b.pct = Math.round((b.seconds / total) * 1000) / 10;
	}

	return { hrMax, source, distribution: bands, avgZone, avgHr };
}
