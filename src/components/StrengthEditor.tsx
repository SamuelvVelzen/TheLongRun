import { useState } from 'react';
import {
	formatStrengthNotes,
	parseStrengthNotes,
	type StrengthExercise
} from '$lib/strength';

/**
 * Structured strength logger. Add exercises and sets (reps × kg) one at a time; it serializes to
 * the same `exercise: 10x40, 8x45` notes text so you can also just type it. `initial` seeds it
 * once; changes flow out via `onChange`.
 */
export function StrengthEditor({
	initial,
	onChange
}: {
	initial: string;
	onChange: (text: string) => void;
}) {
	const seed = parseStrengthNotes(initial);
	const [exercises, setExercises] = useState<StrengthExercise[]>(
		seed.exercises.length ? seed.exercises : [{ name: '', sets: [{ reps: 0, kg: null }] }]
	);
	const [extra, setExtra] = useState(seed.extra);

	function push(next: StrengthExercise[], nextExtra = extra) {
		setExercises(next);
		onChange(formatStrengthNotes(next, nextExtra));
	}

	const setName = (i: number, name: string) =>
		push(exercises.map((e, idx) => (idx === i ? { ...e, name } : e)));

	const addExercise = () => push([...exercises, { name: '', sets: [{ reps: 0, kg: null }] }]);

	const removeExercise = (i: number) => push(exercises.filter((_, idx) => idx !== i));

	const addSet = (i: number) =>
		push(
			exercises.map((e, idx) =>
				idx === i
					? { ...e, sets: [...e.sets, { ...(e.sets[e.sets.length - 1] ?? { reps: 0, kg: null }) }] }
					: e
			)
		);

	const removeSet = (i: number, si: number) =>
		push(
			exercises.map((e, idx) =>
				idx === i ? { ...e, sets: e.sets.filter((_, s) => s !== si) } : e
			)
		);

	const setSet = (i: number, si: number, field: 'reps' | 'kg', raw: string) => {
		const val = raw === '' ? (field === 'kg' ? null : 0) : Number(raw);
		push(
			exercises.map((e, idx) =>
				idx === i
					? { ...e, sets: e.sets.map((s, s2) => (s2 === si ? { ...s, [field]: val } : s)) }
					: e
			)
		);
	};

	return (
		<div className="strength-editor">
			{exercises.map((ex, i) => (
				<div className="strength-ex" key={i}>
					<div className="strength-ex-head">
						<input
							className="strength-name"
							placeholder="Exercise (e.g. seated row)"
							value={ex.name}
							onChange={(e) => setName(i, e.target.value)}
						/>
						<button
							type="button"
							className="strength-x"
							aria-label="Remove exercise"
							onClick={() => removeExercise(i)}
						>
							×
						</button>
					</div>
					<div className="strength-sets">
						{ex.sets.map((s, si) => (
							<span className="strength-set" key={si}>
								<input
									type="number"
									min="0"
									placeholder="reps"
									value={s.reps || ''}
									onChange={(e) => setSet(i, si, 'reps', e.target.value)}
								/>
								<span className="strength-x-sep">×</span>
								<input
									type="number"
									min="0"
									step="0.5"
									placeholder="kg"
									value={s.kg ?? ''}
									onChange={(e) => setSet(i, si, 'kg', e.target.value)}
								/>
								<button
									type="button"
									className="strength-x"
									aria-label="Remove set"
									onClick={() => removeSet(i, si)}
								>
									×
								</button>
							</span>
						))}
						<button type="button" className="btn btn-ghost strength-add-set" onClick={() => addSet(i)}>
							+ set
						</button>
					</div>
				</div>
			))}
			<button type="button" className="btn btn-ghost" onClick={addExercise}>
				+ exercise
			</button>
			<label className="field" style={{ marginTop: '0.7rem' }}>
				<span>Extra notes (optional)</span>
				<textarea
					rows={2}
					placeholder="How it felt, tempo, supersets…"
					value={extra}
					onChange={(e) => {
						setExtra(e.target.value);
						onChange(formatStrengthNotes(exercises, e.target.value));
					}}
				/>
			</label>
		</div>
	);
}
