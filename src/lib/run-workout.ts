/**
 * Display helpers for structured run workouts (`PlanSession.workout`).
 */
import { parseDurationSeconds } from '$lib/format';
import type { RunBlock, RunRepeat, RunStep, RunWorkout } from '$lib/plan-schema';

export type WorkoutLine = { text: string; depth: 0 | 1 };

export function isRepeatBlock(b: RunBlock): b is RunRepeat {
	return 'repeat' in b;
}

const KIND_LABELS: Record<RunStep['kind'], string> = {
	warmup: 'Warmup',
	run: 'Run',
	recovery: 'Recovery',
	cooldown: 'Cooldown'
};

function round1(n: number): number {
	return Math.round(n * 10) / 10;
}

function distanceLabel(km: number): string {
	if (km < 1) return `${Math.round(km * 1000)} m`;
	return `${round1(km)} km`;
}

function timeLabel(time: string): string {
	const sec = parseDurationSeconds(time);
	if (!sec) return time;
	if (sec % 60 !== 0) return time;
	const min = sec / 60;
	if (min < 60) return `${min} min`;
	const h = Math.floor(min / 60);
	const m = min % 60;
	return m ? `${h} h ${m} min` : `${h} h`;
}

function amountLabel(s: RunStep): string {
	if (s.distance_km != null) return distanceLabel(s.distance_km);
	if (s.time) return timeLabel(s.time);
	return '';
}

function isWalk(s: RunStep): boolean {
	return s.mode === 'walk';
}

function stepShort(s: RunStep, inRepeat: boolean): string {
	const amount = amountLabel(s);
	const walk = isWalk(s);
	switch (s.kind) {
		case 'warmup':
			return `${amount} warmup${walk ? ' walk' : ''}`;
		case 'cooldown':
			return `${amount} cooldown${walk ? ' walk' : ''}`;
		case 'recovery':
			return `${amount} ${walk ? 'walk' : 'jog'}`;
		default: {
			const effort = s.effort && !inRepeat ? ` ${s.effort}` : '';
			const pace = s.pace ? ` @ ${s.pace}` : '';
			return `${amount}${walk ? ' walk' : ''}${effort}${pace}`;
		}
	}
}

/** One line for the board, e.g. `1 km warmup · 2 × 6 min w/ 2 min walk · 1 km cooldown`. */
export function workoutSummary(workout: RunWorkout): string {
	return workout.blocks
		.map((b) => {
			if (!isRepeatBlock(b)) return stepShort(b, false);
			const work = b.steps.filter((s) => s.kind !== 'recovery');
			const rec = b.steps.filter((s) => s.kind === 'recovery');
			if (work.length <= 1) {
				const main = work[0] ? stepShort(work[0], true) : '';
				const rest = rec.map((s) => stepShort(s, true)).join(' + ');
				return `${b.repeat} × ${main}${rest ? `${main ? ' w/ ' : ''}${rest}` : ''}`;
			}
			return `${b.repeat} × (${b.steps.map((s) => stepShort(s, true)).join(' + ')})`;
		})
		.join(' · ');
}

function stepFull(s: RunStep): string {
	const parts = [`${KIND_LABELS[s.kind]} ${amountLabel(s)}${isWalk(s) ? ' walk' : ''}`];
	if (s.pace) parts.push(`@ ${s.pace}/km`);
	let text = parts.join(' ');
	if (s.effort) text += ` · ${s.effort}`;
	if (s.note) text += ` — ${s.note}`;
	return text;
}

/** Full step list; repeat groups get a `N ×` header with their steps one level deeper. */
export function workoutLines(workout: RunWorkout): WorkoutLine[] {
	const out: WorkoutLine[] = [];
	for (const b of workout.blocks) {
		if (isRepeatBlock(b)) {
			out.push({ text: `${b.repeat} ×`, depth: 0 });
			for (const s of b.steps) out.push({ text: stepFull(s), depth: 1 });
		} else {
			out.push({ text: stepFull(b), depth: 0 });
		}
	}
	return out;
}

/** Markdown bullet list of the steps, indented by `indent`. */
export function workoutMarkdown(workout: RunWorkout, indent = ''): string {
	return workoutLines(workout)
		.map((l) => `${indent}${l.depth ? '  ' : ''}- ${l.text}`)
		.join('\n');
}

/** Total km when every step is distance-based; null as soon as one step is timed. */
export function workoutTotalKm(workout: RunWorkout): number | null {
	let total = 0;
	for (const b of workout.blocks) {
		const steps = isRepeatBlock(b) ? b.steps : [b];
		const times = isRepeatBlock(b) ? b.repeat : 1;
		for (const s of steps) {
			if (s.distance_km == null) return null;
			total += s.distance_km * times;
		}
	}
	return round1(total);
}
