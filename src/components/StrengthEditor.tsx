import { useState } from 'react';
import {
	formatStrengthNotes,
	parseStrengthNotes,
	type StrengthExercise
} from '$lib/strength';
import { cn, ui } from '$lib/ui';

const removeBtn =
	'inline-flex items-center justify-center box-border border-0 bg-transparent text-muted cursor-pointer text-[1.05rem] leading-none size-11 min-w-11 min-h-11 p-0 hover:text-warn active:text-warn';

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
		<div className="grid gap-[0.7rem]">
			{exercises.map((ex, i) => (
				<div className="border border-line rounded-[10px] p-[0.6rem_0.7rem] bg-black/15" key={i}>
					<div className="flex gap-2 items-center">
						<input
							className="flex-1 min-w-0"
							placeholder="Exercise (e.g. seated row)"
							value={ex.name}
							onChange={(e) => setName(i, e.target.value)}
						/>
						<button
							type="button"
							className={removeBtn}
							aria-label="Remove exercise"
							onClick={() => removeExercise(i)}
						>
							×
						</button>
					</div>
					<div className="flex flex-wrap items-center gap-1.5 mt-2">
						{ex.sets.map((s, si) => (
							<span
								className="inline-flex items-center gap-[0.2rem] border border-line rounded-lg p-[0.15rem_0.3rem]"
								key={si}
							>
								<input
									className="w-[3.75rem] min-h-11 text-center"
									type="number"
									min="0"
									placeholder="reps"
									value={s.reps || ''}
									onChange={(e) => setSet(i, si, 'reps', e.target.value)}
								/>
								<span className={ui.muted}>×</span>
								<input
									className="w-[3.75rem] min-h-11 text-center"
									type="number"
									min="0"
									step="0.5"
									placeholder="kg"
									value={s.kg ?? ''}
									onChange={(e) => setSet(i, si, 'kg', e.target.value)}
								/>
								<button
									type="button"
									className={removeBtn}
									aria-label="Remove set"
									onClick={() => removeSet(i, si)}
								>
									×
								</button>
							</span>
						))}
						<button
							type="button"
							className={cn(ui.btnGhost, 'min-h-11 px-[0.85rem] py-[0.45rem]')}
							onClick={() => addSet(i)}
						>
							+ set
						</button>
					</div>
				</div>
			))}
			<button type="button" className={ui.btnGhost} onClick={addExercise}>
				+ exercise
			</button>
			<label className={cn(ui.field, 'mt-[0.7rem]')}>
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
