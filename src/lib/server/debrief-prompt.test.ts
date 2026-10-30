import type { RunRecord } from '$lib/types';
import { formatStrengthNotes } from '$lib/strength';
import { describe, expect, it } from 'vitest';
import { stillNeedsDebrief } from './debrief-prompt';

function run(partial: Partial<RunRecord> & Pick<RunRecord, 'activity_type'>): RunRecord {
	return {
		id: 1,
		slug: '2025-10-30-test',
		date: '2025-10-30',
		week: 1,
		day: 'Thu',
		session: 'quality',
		effort: null,
		body_scores: [],
		legs: null,
		energy: null,
		weather: '',
		surface: '',
		wanted_faster: null,
		distance_km: null,
		start_time: '18:00',
		time: '45:00',
		elapsed_time: '45:00',
		avg_pace: '',
		avg_hr: null,
		max_hr: null,
		elev_gain: null,
		calories: null,
		kilojoules: null,
		max_speed: null,
		cadence: null,
		gear: '',
		summary_image: '',
		splits_image: '',
		strava_id: '',
		route: '',
		notes: '',
		before_notes: '',
		after_notes: '',
		country: '',
		province: '',
		place: '',
		best_efforts: [],
		...partial
	};
}

describe('stillNeedsDebrief', () => {
	it('keeps planned strength on the debrief list when notes hold lifts and coach intent', () => {
		const notes = formatStrengthNotes(
			[{ name: 'Squat', sets: [{ reps: 5, kg: 60, sec: null }] }],
			'Controlled tempo. Stop if back tightens.'
		);
		expect(
			stillNeedsDebrief(
				run({
					activity_type: 'strength',
					notes
				})
			)
		).toBe(true);
	});

	it('drops strength after subjective scores are saved', () => {
		expect(
			stillNeedsDebrief(
				run({
					activity_type: 'strength',
					notes: formatStrengthNotes(
						[{ name: 'Squat', sets: [{ reps: 5, kg: 60, sec: null }] }],
						'Plan detail'
					),
					effort: 7
				})
			)
		).toBe(false);
	});

	it('treats run notes as debrief evidence', () => {
		expect(stillNeedsDebrief(run({ activity_type: 'run', notes: 'Felt smooth, easy day.' }))).toBe(
			false
		);
		expect(stillNeedsDebrief(run({ activity_type: 'run', notes: '' }))).toBe(true);
	});
});
