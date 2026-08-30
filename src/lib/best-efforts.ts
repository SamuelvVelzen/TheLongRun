import { normalizeActivityType } from '$lib/activity';
import { formatDuration, formatPace } from '$lib/format';
import { haversineMeters, type KmSplit, type TrackSample } from '$lib/splits';

export type BestEffortKey = '400m' | '1k' | '1mi' | '5k' | '10k' | '15k' | 'half' | 'marathon';

export type BestEffortDistance = {
	key: BestEffortKey;
	meters: number;
	label: string;
	/** Faster than this is treated as a GPS glitch (a bit quicker than the world record). */
	minSeconds: number;
};

export const BEST_EFFORT_DISTANCES: BestEffortDistance[] = [
	{ key: '400m', meters: 400, label: '400 m', minSeconds: 40 },
	{ key: '1k', meters: 1000, label: '1 km', minSeconds: 130 },
	{ key: '1mi', meters: 1609.344, label: '1 mile', minSeconds: 220 },
	{ key: '5k', meters: 5000, label: '5 km', minSeconds: 720 },
	{ key: '10k', meters: 10000, label: '10 km', minSeconds: 1500 },
	{ key: '15k', meters: 15000, label: '15 km', minSeconds: 2300 },
	{ key: 'half', meters: 21097.5, label: 'Half marathon', minSeconds: 3400 },
	{ key: 'marathon', meters: 42195, label: 'Marathon', minSeconds: 7000 }
];

export type BestEffort = {
	key: BestEffortKey;
	meters: number;
	seconds: number;
};

export type RankedBestEffort = BestEffort & {
	label: string;
	rank: number;
};

export type EffortHighlight = RankedBestEffort & {
	rankLabel: string;
};

export type BestEffortBoardRow = {
	key: BestEffortKey;
	label: string;
	entries: {
		rank: 1 | 2 | 3;
		slug: string;
		date: string;
		seconds: number;
		pace: string;
	}[];
};

const DISTANCE_BY_KEY = new Map(BEST_EFFORT_DISTANCES.map((d) => [d.key, d]));

export function supportsBestEfforts(activityType: string | null | undefined): boolean {
	const t = normalizeActivityType(activityType);
	return t === 'run' || t === 'walk';
}

export function distanceLabel(key: string): string {
	return DISTANCE_BY_KEY.get(key as BestEffortKey)?.label ?? key;
}

export function rankLabel(rank: number): string {
	if (rank === 1) return '1st';
	if (rank === 2) return '2nd';
	if (rank === 3) return '3rd';
	return `${rank}th`;
}

export function rankPhrase(rank: number): string {
	if (rank === 1) return 'fastest';
	if (rank === 2) return '2nd fastest';
	if (rank === 3) return '3rd fastest';
	return rankLabel(rank);
}

export function parseBestEfforts(raw: unknown): BestEffort[] {
	let value = raw;
	if (typeof value === 'string') {
		try {
			value = JSON.parse(value) as unknown;
		} catch {
			return [];
		}
	}
	if (!Array.isArray(value)) return [];
	const out: BestEffort[] = [];
	const seen = new Set<string>();
	for (const item of value) {
		if (!item || typeof item !== 'object') continue;
		const o = item as Record<string, unknown>;
		const key = String(o.key ?? '') as BestEffortKey;
		const def = DISTANCE_BY_KEY.get(key);
		const seconds = Number(o.seconds);
		if (!def || !Number.isFinite(seconds) || seconds <= 0) continue;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({ key, meters: def.meters, seconds: Math.round(seconds) });
	}
	return out;
}

type CumPiece = { dist: number[]; time: number[] };

function fastestOnPiece(dist: number[], time: number[], target: number): number | null {
	const n = dist.length;
	if (n < 2 || dist[n - 1]! < target) return null;
	let best = Infinity;
	let i = 0;
	for (let j = 1; j < n; j++) {
		while (i + 1 < j && dist[j]! - dist[i + 1]! >= target) i++;
		if (dist[j]! - dist[i]! < target) continue;
		const startD = dist[j]! - target;
		let tStart = time[i]!;
		const span = dist[i + 1]! - dist[i]!;
		if (span > 0) {
			const frac = Math.min(1, Math.max(0, (startD - dist[i]!) / span));
			tStart = time[i]! + frac * (time[i + 1]! - time[i]!);
		}
		const elapsed = time[j]! - tStart;
		if (elapsed > 0 && elapsed < best) best = elapsed;
	}
	return Number.isFinite(best) ? best : null;
}

function bestAcrossPieces(pieces: CumPiece[], target: number, minSeconds: number): number | null {
	let best: number | null = null;
	for (const piece of pieces) {
		const t = fastestOnPiece(piece.dist, piece.time, target);
		if (t == null || t < minSeconds) continue;
		if (best == null || t < best) best = t;
	}
	return best == null ? null : Math.round(best);
}

function effortsFromPieces(pieces: CumPiece[]): BestEffort[] {
	if (!pieces.length) return [];
	const out: BestEffort[] = [];
	for (const def of BEST_EFFORT_DISTANCES) {
		const seconds = bestAcrossPieces(pieces, def.meters, def.minSeconds);
		if (seconds == null) continue;
		out.push({ key: def.key, meters: def.meters, seconds });
	}
	return out;
}

/** Same-spot freeze (trees, pause). Do not split the stream. */
const STUCK_M = 0.5;
/** Straight-line hops this long are not treated as running distance. */
const TELEPORT_M = 200;
/** Speed cap only applies to hops of this size, so 1 Hz GPS jitter is kept. */
const SPIKE_M = 50;
/** ~45 km/h — faster over SPIKE_M is a false acceleration. */
const MAX_SPEED_MPS = 12.5;

/**
 * Fastest rolling window for each standard distance, using GPS + timestamps.
 * Elapsed time (clock) is used, matching Strava: a pause in the window counts against it.
 *
 * Bad GPS is ignored, not used as a wall:
 * - stuck/duplicate points keep elapsed time and stay one stream (trees / standing pause)
 * - isolated teleports are dropped so they cannot fake metres
 * - signal loss then a new fix counts elapsed but not the straight-line jump
 */
export function computeBestEffortsFromTrack(samples: TrackSample[]): BestEffort[] {
	const pts = samples
		.filter(
			(p) =>
				Number.isFinite(p.lat) &&
				Number.isFinite(p.lng) &&
				Math.abs(p.lat) <= 90 &&
				Math.abs(p.lng) <= 180 &&
				!(p.lat === 0 && p.lng === 0) &&
				p.timeMs != null &&
				Number.isFinite(p.timeMs)
		)
		.sort((a, b) => a.timeMs! - b.timeMs!);
	if (pts.length < 2) return [];

	const dist = [0];
	const time = [0];
	let last = pts[0]!;

	const pushTimeOnly = (dt: number, p: TrackSample) => {
		time.push(time[time.length - 1]! + dt);
		dist.push(dist[dist.length - 1]!);
		last = p;
	};

	for (let i = 1; i < pts.length; i++) {
		const p = pts[i]!;
		const dt = (p.timeMs! - last.timeMs!) / 1000;
		if (!Number.isFinite(dt) || dt <= 0) continue;

		const seg = haversineMeters(last.lat, last.lng, p.lat, p.lng);
		if (!Number.isFinite(seg)) continue;

		if (seg <= STUCK_M) {
			pushTimeOnly(dt, p);
			continue;
		}

		const tooFast = seg >= SPIKE_M && seg / dt > MAX_SPEED_MPS;
		if (tooFast || seg > TELEPORT_M) {
			const next = pts[i + 1];
			if (next) {
				const back = haversineMeters(last.lat, last.lng, next.lat, next.lng);
				if (Number.isFinite(back) && back <= TELEPORT_M) continue;
			}
			pushTimeOnly(dt, p);
			continue;
		}

		dist.push(dist[dist.length - 1]! + seg);
		time.push(time[time.length - 1]! + dt);
		last = p;
	}

	return effortsFromPieces([{ dist, time }]);
}

/** Fill distance keys the GPS pass missed (e.g. older imports) without replacing GPS times. */
export function mergeMissingBestEfforts(stored: BestEffort[], fallback: BestEffort[]): BestEffort[] {
	if (!fallback.length) return stored;
	const have = new Set(stored.map((e) => e.key));
	const extra = fallback.filter((e) => !have.has(e.key));
	if (!extra.length) return stored;
	return [...stored, ...extra].sort((a, b) => a.meters - b.meters);
}

export function missingEffortKeys(distanceKm: number | null | undefined, efforts: BestEffort[]): BestEffortKey[] {
	const meters = (Number(distanceKm) || 0) * 1000;
	const have = new Set(efforts.map((e) => e.key));
	return BEST_EFFORT_DISTANCES.filter((d) => meters >= d.meters && !have.has(d.key)).map((d) => d.key);
}

export function effortsEqual(a: BestEffort[], b: BestEffort[]): boolean {
	if (a.length !== b.length) return false;
	return a.every((e, i) => e.key === b[i]!.key && e.seconds === b[i]!.seconds && e.meters === b[i]!.meters);
}

/**
 * Approximate best efforts from stored km splits (for activities imported before
 * GPS timestamps were kept). Consecutive splits, not a true rolling window.
 */
export function computeBestEffortsFromSplits(splits: KmSplit[]): BestEffort[] {
	if (!splits.length) return [];
	const dist = [0];
	const time = [0];
	for (const split of splits) {
		const d = Number(split.distanceKm);
		const s = Number(split.seconds);
		if (!Number.isFinite(d) || d <= 0 || !Number.isFinite(s) || s <= 0) continue;
		dist.push(dist[dist.length - 1]! + d * 1000);
		time.push(time[time.length - 1]! + s);
	}
	if (dist.length < 2) return [];
	return effortsFromPieces([{ dist, time }]);
}

type EffortOwner = {
	slug: string;
	date: string;
	activity_type: string;
	best_efforts?: BestEffort[] | null;
};

function comparable(all: EffortOwner[], activityType: string): EffortOwner[] {
	const type = normalizeActivityType(activityType);
	return all.filter((r) => normalizeActivityType(r.activity_type) === type);
}

/** Rank of `slug`'s efforts among the same activity type. */
export function rankEffortsForActivity(
	slug: string,
	activityType: string,
	all: EffortOwner[]
): RankedBestEffort[] {
	const mine = all.find((r) => r.slug === slug);
	const mineEfforts = mine?.best_efforts ?? [];
	if (!mineEfforts.length) return [];
	const pool = comparable(all, activityType);
	const ranked: RankedBestEffort[] = [];
	for (const effort of mineEfforts) {
		const def = DISTANCE_BY_KEY.get(effort.key);
		if (!def) continue;
		const others = pool
			.map((r) => {
				const match = (r.best_efforts ?? []).find((e) => e.key === effort.key);
				return match ? { slug: r.slug, date: r.date, seconds: match.seconds } : null;
			})
			.filter((x): x is { slug: string; date: string; seconds: number } => x != null)
			.sort(
				(a, b) => a.seconds - b.seconds || a.date.localeCompare(b.date) || a.slug.localeCompare(b.slug)
			);
		const rank = others.findIndex((x) => x.slug === slug) + 1;
		if (rank < 1) continue;
		ranked.push({
			key: effort.key,
			meters: def.meters,
			seconds: effort.seconds,
			label: def.label,
			rank
		});
	}
	ranked.sort((a, b) => a.meters - b.meters);
	return ranked;
}

export function highlightsForActivity(
	slug: string,
	activityType: string,
	all: EffortOwner[]
): EffortHighlight[] {
	return rankEffortsForActivity(slug, activityType, all)
		.filter((e) => e.rank >= 1 && e.rank <= 3)
		.map((e) => ({ ...e, rankLabel: rankPhrase(e.rank) }));
}

/** All-time top 3 per distance for one activity type. */
export function buildBestEffortBoard(all: EffortOwner[], activityType: string): BestEffortBoardRow[] {
	const pool = comparable(all, activityType);
	const rows: BestEffortBoardRow[] = [];
	for (const def of BEST_EFFORT_DISTANCES) {
		const entries = pool
			.map((r) => {
				const match = (r.best_efforts ?? []).find((e) => e.key === def.key);
				return match ? { slug: r.slug, date: r.date, seconds: match.seconds } : null;
			})
			.filter((x): x is { slug: string; date: string; seconds: number } => x != null)
			.sort(
				(a, b) => a.seconds - b.seconds || a.date.localeCompare(b.date) || a.slug.localeCompare(b.slug)
			)
			.slice(0, 3)
			.map((e, i) => ({
				rank: (i + 1) as 1 | 2 | 3,
				slug: e.slug,
				date: e.date,
				seconds: e.seconds,
				pace: formatPace(def.meters, e.seconds)
			}));
		if (entries.length) rows.push({ key: def.key, label: def.label, entries });
	}
	return rows;
}

export function formatEffortTime(seconds: number): string {
	return formatDuration(seconds);
}

export function formatEffortPace(meters: number, seconds: number): string {
	return formatPace(meters, seconds);
}
