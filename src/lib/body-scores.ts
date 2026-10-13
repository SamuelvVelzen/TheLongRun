import { z } from 'zod';
import { capitalize, MAX_BODY_AREA, type BodyNotes } from '$lib/body-notes';

/** One 0–10 score per body note on an activity. `area` is kept so history reads after a rename or resolve. */
export type BodyScore = { note_id: string | null; area: string; score: number };

/** An open body note the forms ask a score for. */
export type BodyArea = { id: string; area: string };

/** Form row — one per open note plus any saved score whose note is gone or resolved. */
export type BodyScoreRow = { note_id: string | null; area: string; score: number | null };

export const MAX_BODY_SCORES = 12;
export const LEGACY_BODY_AREA = 'Pain';

export const bodyScoreSchema = z.object({
	note_id: z
		.string()
		.trim()
		.max(40)
		.nullish()
		.transform((v) => v || null),
	area: z.string().trim().min(1).max(MAX_BODY_AREA),
	score: z.number().int().min(0).max(10)
});

export const bodyScoresSchema = z.array(bodyScoreSchema).max(MAX_BODY_SCORES);

function sameArea(a: string, b: string): boolean {
	return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function sameScore(a: Pick<BodyScore, 'note_id' | 'area'>, b: Pick<BodyScore, 'note_id' | 'area'>) {
	if (a.note_id && b.note_id) return a.note_id === b.note_id;
	return sameArea(a.area, b.area);
}

/** Lenient read of the stored JSON (string or array): broken entries and duplicates are dropped. */
export function parseBodyScores(raw: unknown): BodyScore[] {
	let value = raw;
	if (typeof value === 'string') {
		try {
			value = JSON.parse(value);
		} catch {
			return [];
		}
	}
	if (!Array.isArray(value)) return [];
	const out: BodyScore[] = [];
	for (const item of value) {
		const parsed = bodyScoreSchema.safeParse(item);
		if (!parsed.success || out.some((s) => sameScore(s, parsed.data))) continue;
		out.push(parsed.data);
		if (out.length >= MAX_BODY_SCORES) break;
	}
	return out;
}

/** Strict — for server save paths. */
export function validateBodyScores(raw: unknown): BodyScore[] {
	const parsed = bodyScoresSchema.safeParse(raw ?? []);
	if (!parsed.success) throw new Error('Body scores must be 0–10 with an area.');
	return parseBodyScores(parsed.data);
}

export function openBodyAreas(body: BodyNotes): BodyArea[] {
	return body.notes
		.filter((n) => n.status !== 'resolved')
		.map((n) => ({ id: n.id, area: capitalize(n.area) }));
}

/** Open notes first (profile order) with their saved score, then saved scores for notes no longer open. */
export function bodyScoreRows(saved: BodyScore[], open: BodyArea[]): BodyScoreRow[] {
	const used = new Set<number>();
	const pick = (match: (s: BodyScore) => boolean) => {
		const i = saved.findIndex((s, j) => !used.has(j) && match(s));
		if (i < 0) return null;
		used.add(i);
		return saved[i]!;
	};
	const rows: BodyScoreRow[] = open.map((a) => {
		const hit =
			pick((s) => s.note_id === a.id) ?? pick((s) => !s.note_id && sameArea(s.area, a.area));
		return { note_id: a.id, area: a.area, score: hit?.score ?? null };
	});
	saved.forEach((s, i) => {
		if (!used.has(i)) rows.push({ note_id: s.note_id, area: capitalize(s.area), score: s.score });
	});
	return rows;
}

export function rowsToBodyScores(rows: BodyScoreRow[]): BodyScore[] {
	return rows
		.filter((r): r is BodyScore => r.score != null)
		.map((r) => ({ note_id: r.note_id, area: r.area, score: r.score }));
}

/** Replace matching entries and append new ones — for partial updates such as an AI reply. */
export function mergeBodyScores(current: BodyScore[], incoming: BodyScore[]): BodyScore[] {
	const out = [...current];
	for (const s of incoming) {
		const i = out.findIndex((o) => sameScore(o, s));
		if (i >= 0) out[i] = { ...s, note_id: s.note_id ?? out[i]!.note_id };
		else out.push(s);
	}
	return out.slice(0, MAX_BODY_SCORES);
}

export function worstBodyScore(scores: BodyScore[]): number | null {
	return scores.length ? Math.max(...scores.map((s) => s.score)) : null;
}

/** `Shins 3, Left knee 5` — '' when nothing was scored. */
export function formatBodyScores(scores: BodyScore[]): string {
	return scores.map((s) => `${capitalize(s.area)} ${s.score}`).join(', ');
}

/**
 * Map AI-returned `{ area, score }` entries onto body notes (case-insensitive area match), and
 * the legacy single `shins` number onto the first open note.
 */
export function resolveAiBodyScores(
	entries: { area: string; score: number }[] | undefined,
	legacy: number | null | undefined,
	body: BodyNotes
): BodyScore[] | undefined {
	const open = body.notes.filter((n) => n.status !== 'resolved');
	const out: BodyScore[] = [];
	for (const e of entries ?? []) {
		const note =
			open.find((n) => sameArea(n.area, e.area)) ??
			body.notes.find((n) => sameArea(n.area, e.area));
		out.push({ note_id: note?.id ?? null, area: capitalize(note?.area ?? e.area), score: e.score });
	}
	if (legacy != null && !out.length) {
		const first = open[0];
		out.push({
			note_id: first?.id ?? null,
			area: first ? capitalize(first.area) : LEGACY_BODY_AREA,
			score: legacy
		});
	}
	return out.length ? out : undefined;
}

export type BodyScoreTrack = {
	key: string;
	/** Area label from the newest score. */
	area: string;
	/** Oldest → newest. */
	points: { slug: string; date: string; score: number }[];
};

/** One track per body area across runs (grouped by note id, else by area name). */
export function bodyScoreTracks(
	runs: { slug: string; date: string; body_scores: BodyScore[] }[]
): BodyScoreTrack[] {
	const tracks = new Map<string, BodyScoreTrack>();
	const ordered = [...runs].filter((r) => r.date).sort((a, b) => a.date.localeCompare(b.date));
	for (const run of ordered) {
		for (const s of run.body_scores) {
			const key = s.note_id || `area:${s.area.trim().toLowerCase()}`;
			const track = tracks.get(key) ?? { key, area: '', points: [] };
			track.area = capitalize(s.area);
			track.points.push({ slug: run.slug, date: run.date, score: s.score });
			tracks.set(key, track);
		}
	}
	return [...tracks.values()];
}
