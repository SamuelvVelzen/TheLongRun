import { useState } from 'react';
import {
	emptyStrengthSet,
	formatStrengthNotes,
	inferExerciseKind,
	parseStrengthNotes,
	type StrengthExercise,
	type StrengthKind
} from '$lib/strength';
import { cn, ui } from '$lib/ui';
import { ConfirmDialog } from './Dialog';
import { DeleteButton, TrashIcon } from './DeleteButton';
import { SegmentedToggle } from './SegmentedToggle';

const KIND_OPTIONS: { value: StrengthKind; label: string }[] = [
	{ value: 'weighted', label: 'Weight' },
	{ value: 'reps', label: 'Reps' },
	{ value: 'time', label: 'Time' }
];

function seedExercises(initial: string): StrengthExercise[] {
	const seed = parseStrengthNotes(initial);
	if (!seed.exercises.length) {
		return [{ name: '', sets: [emptyStrengthSet()], kind: 'weighted' }];
	}
	return seed.exercises.map((e) => ({ ...e, kind: inferExerciseKind(e) }));
}

/**
 * Structured strength logger. Each exercise is weight (reps × kg), bodyweight reps, or a timed
 * hold. Serializes to notes text (`10x40`, `15`, `45s`) so you can also type it. `initial` seeds
 * it once; changes flow out via `onChange`.
 */
export function StrengthEditor({
	initial,
	onChange
}: {
	initial: string;
	onChange: (text: string) => void;
}) {
	const seed = parseStrengthNotes(initial);
	const [exercises, setExercises] = useState<StrengthExercise[]>(() => seedExercises(initial));
	const [extra, setExtra] = useState(seed.extra);
	const [pending, setPending] = useState<
		{ kind: 'exercise'; i: number } | { kind: 'set'; i: number; si: number } | null
	>(null);

	function push(next: StrengthExercise[], nextExtra = extra) {
		setExercises(next);
		onChange(formatStrengthNotes(next, nextExtra));
	}

	const setName = (i: number, name: string) =>
		push(exercises.map((e, idx) => (idx === i ? { ...e, name } : e)));

	const setKind = (i: number, kind: StrengthKind) =>
		push(exercises.map((e, idx) => (idx === i ? { ...e, kind } : e)));

	const addExercise = () =>
		push([...exercises, { name: '', sets: [emptyStrengthSet()], kind: 'weighted' }]);

	const removeExercise = (i: number) => push(exercises.filter((_, idx) => idx !== i));

	const addSet = (i: number) =>
		push(
			exercises.map((e, idx) =>
				idx === i
					? { ...e, sets: [...e.sets, { ...(e.sets[e.sets.length - 1] ?? emptyStrengthSet()) }] }
					: e
			)
		);

	const removeSet = (i: number, si: number) =>
		push(
			exercises.map((e, idx) =>
				idx === i ? { ...e, sets: e.sets.filter((_, s) => s !== si) } : e
			)
		);

	const setSet = (i: number, si: number, field: 'reps' | 'kg' | 'sec', raw: string) => {
		const val = raw === '' ? (field === 'reps' ? 0 : null) : Number(raw);
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
			{exercises.map((ex, i) => {
				const kind = inferExerciseKind(ex);
				return (
					<div className="border border-line rounded-xl p-3 bg-inset" key={i}>
						<div className="flex gap-2 items-center">
							<input
								className="flex-1 min-w-0"
								placeholder="Exercise (e.g. seated row)"
								value={ex.name}
								onChange={(e) => setName(i, e.target.value)}
							/>
							<DeleteButton
								label="Delete exercise"
								onClick={() => setPending({ kind: 'exercise', i })}
							/>
						</div>
						<SegmentedToggle
							className="mt-2 max-sm:w-full max-sm:[&>button]:flex-1"
							aria-label="How this exercise is logged"
							value={kind}
							onChange={(k) => setKind(i, k)}
							options={KIND_OPTIONS}
						/>
						<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 mt-3">
							{ex.sets.map((s, si) => (
								<div
									className="flex flex-col gap-2.5 border border-line rounded-xl p-3 bg-inset"
									key={si}
								>
									<div className="flex items-center justify-between gap-2">
										<span
											className={cn(
												ui.muted,
												'text-[0.72rem] uppercase tracking-[0.06em] font-semibold'
											)}
										>
											Set {si + 1}
										</span>
										<button
											type="button"
											className={cn(
												ui.btnGhost,
												ui.btnDanger,
												ui.btnIcon,
												'size-9 min-h-9 min-w-9'
											)}
											aria-label="Delete set"
											onClick={() => setPending({ kind: 'set', i, si })}
										>
											<TrashIcon />
										</button>
									</div>
									{kind !== 'time' && (
										<SetField
											label="Reps"
											placeholder="—"
											value={s.reps || ''}
											inputMode="numeric"
											onChange={(v) => setSet(i, si, 'reps', v)}
										/>
									)}
									{kind === 'weighted' && (
										<SetField
											label="kg"
											placeholder="—"
											value={s.kg ?? ''}
											step="0.5"
											inputMode="decimal"
											onChange={(v) => setSet(i, si, 'kg', v)}
										/>
									)}
									{kind === 'time' && (
										<SetField
											label="Seconds"
											placeholder="—"
											value={s.sec ?? ''}
											inputMode="numeric"
											onChange={(v) => setSet(i, si, 'sec', v)}
										/>
									)}
								</div>
							))}
							<button
								type="button"
								className={cn(
									ui.btnGhost,
									'h-full min-h-29 rounded-xl border-dashed'
								)}
								onClick={() => addSet(i)}
							>
								+ set
							</button>
						</div>
					</div>
				);
			})}
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
			<ConfirmDialog
				open={pending != null}
				title={pending?.kind === 'set' ? 'Delete this set?' : 'Delete this exercise?'}
				description={
					pending?.kind === 'exercise'
						? exercises[pending.i]?.name
							? `“${exercises[pending.i]!.name}” and its sets will be removed.`
							: 'This exercise and its sets will be removed.'
						: pending?.kind === 'set'
							? 'This set will be removed from the exercise.'
							: null
				}
				onClose={() => setPending(null)}
				onConfirm={() => {
					if (!pending) return;
					if (pending.kind === 'exercise') removeExercise(pending.i);
					else removeSet(pending.i, pending.si);
				}}
			/>
		</div>
	);
}

function SetField({
	label,
	placeholder,
	value,
	step,
	inputMode,
	onChange
}: {
	label: string;
	placeholder: string;
	value: number | string;
	step?: string;
	inputMode?: 'numeric' | 'decimal';
	onChange: (raw: string) => void;
}) {
	return (
		<label className="grid gap-1 text-[0.78rem] text-muted">
			<span>{label}</span>
			<input
				className="w-full min-h-14 text-center font-display text-[1.35rem] font-bold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
				type="number"
				min="0"
				step={step}
				inputMode={inputMode}
				placeholder={placeholder}
				value={value}
				onChange={(e) => onChange(e.target.value)}
			/>
		</label>
	);
}
