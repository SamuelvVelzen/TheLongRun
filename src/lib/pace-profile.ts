import { normalizeActivityType } from '$lib/activity';
import type { BestEffortKey } from '$lib/best-efforts';
import { parseDurationSeconds } from '$lib/format';
import type { Goal, RunRecord } from '$lib/types';

const OBSERVED_DAYS = 42;
const FALLBACK_RUNS = 12;
const FITNESS_DAYS = 120;
const MIN_GROUP = 2;

const SESSION_ORDER = ['easy', 'long', 'steady', 'tempo', 'quality', 'race'] as const;
const FITNESS_KEYS: BestEffortKey[] = ['5k', '10k', 'half'];
const EFFORT_LABEL: Record<string, string> = { '5k': '5k', '10k': '10k', half: 'half marathon' };

/** `M:SS` from seconds per km, rounding 59.6 s up to the next minute. */
export function paceFromSeconds(secPerKm: number): string {
	const total = Math.round(secPerKm);
	return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function quantile(sorted: number[], q: number): number {
	const pos = (sorted.length - 1) * q;
	const lo = Math.floor(pos);
	const hi = Math.ceil(pos);
	return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

function daysBefore(todayIso: string, days: number): string {
	const d = new Date(`${todayIso}T12:00:00`);
	d.setDate(d.getDate() - days);
	return d.toISOString().slice(0, 10);
}

function paceSeconds(r: RunRecord): number | null {
	const s = parseDurationSeconds(r.avg_pace);
	return s != null && s > 120 && s < 20 * 60 ? s : null;
}

export type ObservedPace = { session: string; count: number; low: string; high: string };

export type PaceProfile = {
	observed: ObservedPace[];
	cadence: number | null;
	windowLabel: string;
	fitness: {
		source: string;
		date: string;
		vdot: number;
		easy: string;
		threshold: string;
		interval: string;
	} | null;
};

function recentRuns(runs: RunRecord[], todayIso: string): { runs: RunRecord[]; label: string } {
	const all = runs
		.filter((r) => normalizeActivityType(r.activity_type) === 'run' && r.date <= todayIso)
		.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
	const cutoff = daysBefore(todayIso, OBSERVED_DAYS);
	const windowed = all.filter((r) => r.date >= cutoff);
	if (windowed.length >= MIN_GROUP * 2) return { runs: windowed, label: 'last 6 weeks' };
	return { runs: all.slice(0, FALLBACK_RUNS), label: `last ${Math.min(all.length, FALLBACK_RUNS)} runs` };
}

// Daniels / Gilbert: VO2 cost of running at v (m/min) and the share of VO2max held for t minutes.
function vo2At(v: number): number {
	return -4.6 + 0.182258 * v + 0.000104 * v * v;
}

function vdotFrom(meters: number, seconds: number): number {
	const t = seconds / 60;
	const v = meters / t;
	const pct = 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
	return vo2At(v) / pct;
}

function paceAtFraction(vdot: number, fraction: number): string {
	const vo2 = vdot * fraction;
	const a = 0.000104;
	const b = 0.182258;
	const c = -4.6 - vo2;
	const v = (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
	return paceFromSeconds(60000 / v);
}

function fitnessSource(
	runs: RunRecord[],
	medals: Goal[],
	todayIso: string
): { meters: number; seconds: number; source: string; date: string } | null {
	const cutoff = daysBefore(todayIso, FITNESS_DAYS);
	let best: { meters: number; seconds: number; source: string; date: string; vdot: number } | null = null;
	const consider = (meters: number, seconds: number, source: string, date: string) => {
		if (!(meters > 0 && seconds > 0)) return;
		const vdot = vdotFrom(meters, seconds);
		if (!Number.isFinite(vdot) || vdot < 20 || vdot > 85) return;
		if (!best || vdot > best.vdot) best = { meters, seconds, source, date, vdot };
	};
	// Only race efforts: a best 10k inside an easy long run would put every zone far too slow.
	for (const r of runs) {
		if (normalizeActivityType(r.activity_type) !== 'run' || r.date < cutoff || r.date > todayIso) continue;
		if (String(r.session ?? '').toLowerCase() !== 'race') continue;
		for (const e of r.best_efforts ?? []) {
			if (FITNESS_KEYS.includes(e.key)) consider(e.meters, e.seconds, `best ${EFFORT_LABEL[e.key]}`, r.date);
		}
	}
	for (const m of medals) {
		const res = m.result;
		if (!res || res.date < cutoff) continue;
		const secs = parseDurationSeconds(res.time);
		const km = res.distance_km ?? m.distance_km;
		if (secs && km) consider(km * 1000, secs, `race ${m.name}`, res.date);
	}
	return best;
}

export function buildPaceProfile(runs: RunRecord[], medals: Goal[], todayIso: string): PaceProfile {
	const { runs: recent, label } = recentRuns(runs, todayIso);
	const bySession = new Map<string, number[]>();
	for (const r of recent) {
		const s = paceSeconds(r);
		if (s == null) continue;
		const key = String(r.session || 'other').toLowerCase();
		const list = bySession.get(key) ?? [];
		list.push(s);
		bySession.set(key, list);
	}
	const order = (k: string) => {
		const i = (SESSION_ORDER as readonly string[]).indexOf(k);
		return i < 0 ? SESSION_ORDER.length : i;
	};
	const observed: ObservedPace[] = [...bySession.entries()]
		.filter(([k, list]) => k !== 'other' && list.length >= MIN_GROUP)
		.sort((a, b) => order(a[0]) - order(b[0]))
		.map(([session, list]) => {
			const sorted = [...list].sort((a, b) => a - b);
			return {
				session,
				count: list.length,
				low: paceFromSeconds(quantile(sorted, 0.25)),
				high: paceFromSeconds(quantile(sorted, 0.75))
			};
		});
	const cadences = recent
		.map((r) => r.cadence)
		.filter((c): c is number => c != null && c > 100 && c < 240)
		.sort((a, b) => a - b);
	const cadence = cadences.length ? Math.round(quantile(cadences, 0.5)) : null;

	const src = fitnessSource(runs, medals, todayIso);
	const fitness = src
		? (() => {
				const vdot = vdotFrom(src.meters, src.seconds);
				return {
					source: src.source,
					date: src.date,
					vdot: Math.round(vdot * 10) / 10,
					easy: `${paceAtFraction(vdot, 0.7)}-${paceAtFraction(vdot, 0.62)}`,
					threshold: `${paceAtFraction(vdot, 0.88)}-${paceAtFraction(vdot, 0.85)}`,
					interval: `${paceAtFraction(vdot, 0.99)}-${paceAtFraction(vdot, 0.96)}`
				};
			})()
		: null;
	return { observed, cadence, windowLabel: label, fitness };
}

/** Typical observed easy pace (`M:SS`) — used to make JSON examples look like my running. */
export function typicalEasyPace(profile: PaceProfile): string | null {
	const easy = profile.observed.find((o) => o.session === 'easy') ?? profile.observed[0];
	return easy ? easy.high : null;
}

export function formatPaceSection(profile: PaceProfile): string {
	const lines: string[] = [];
	if (profile.observed.length) {
		lines.push(
			`- Observed (${profile.windowLabel}, avg pace per run, middle half): ${profile.observed
				.map((o) => `${o.session} ${o.low}-${o.high}/km (${o.count})`)
				.join(' · ')}`
		);
	}
	if (profile.cadence != null) lines.push(`- Typical cadence: ${profile.cadence} spm`);
	if (profile.fitness) {
		const f = profile.fitness;
		lines.push(
			`- Equivalent paces from ${f.source} on ${f.date} (VDOT ${f.vdot}): easy ${f.easy}, threshold ${f.threshold}, interval ${f.interval} /km — the fastest each zone should go; trail, hills and heat run slower.`
		);
	}
	if (!lines.length) return '';
	return `## Paces (auto-computed — current)\n${lines.join('\n')}`;
}
