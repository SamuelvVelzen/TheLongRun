import {
	Button,
	ConfirmDialog,
	Field,
	ReorderableList,
	reorderOnDragEnd,
	SegmentedToggle,
	SortableDragHandle,
	SortableItem
} from './ui';
import { buttonClass } from './ui/Button';
import { compactIconButtonClass } from './ui/IconButtons';
import { useState } from 'react';
import { Icon } from './Icon';
import {
	emptyStrengthSet,
	formatStrengthNotes,
	inferExerciseKind,
	parseStrengthNotes,
	type StrengthExercise,
	type StrengthKind
} from '$lib/strength';
import { cn } from '$lib/ui';
import { DeleteButton } from './DeleteButton';

const KIND_OPTIONS: { value: StrengthKind; label: string }[] = [
	{ value: 'weighted', label: 'Weight' },
	{ value: 'reps', label: 'Reps' },
	{ value: 'time', label: 'Time' }
];

type ExerciseRow = { key: string; exercise: StrengthExercise };

function newRowKey() {
	return crypto.randomUUID();
}

function seedRows(initial: string): ExerciseRow[] {
	const seed = parseStrengthNotes(initial);
	const exercises: StrengthExercise[] = !seed.exercises.length
		? [{ name: '', sets: [emptyStrengthSet()], kind: 'weighted' }]
		: seed.exercises.map((e) => ({ ...e, kind: inferExerciseKind(e) }));
	return exercises.map((exercise) => ({ key: newRowKey(), exercise }));
}

function rowsToExercises(rows: ExerciseRow[]): StrengthExercise[] {
	return rows.map((r) => r.exercise);
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
	const [rows, setRows] = useState<ExerciseRow[]>(() => seedRows(initial));
	const [extra, setExtra] = useState(seed.extra);
	const [pending, setPending] = useState<
		{ kind: 'exercise'; i: number } | { kind: 'set'; i: number; si: number } | null
	>(null);

	function push(nextRows: ExerciseRow[], nextExtra = extra) {
		setRows(nextRows);
		onChange(formatStrengthNotes(rowsToExercises(nextRows), nextExtra));
	}

	const updateRow = (i: number, patch: Partial<StrengthExercise>) =>
		push(rows.map((r, idx) => (idx === i ? { ...r, exercise: { ...r.exercise, ...patch } } : r)));

	const setName = (i: number, name: string) => updateRow(i, { name });

	const setKind = (i: number, kind: StrengthKind) => updateRow(i, { kind });

	const addExercise = () =>
		push([
			...rows,
			{ key: newRowKey(), exercise: { name: '', sets: [emptyStrengthSet()], kind: 'weighted' } }
		]);

	const removeExercise = (i: number) => push(rows.filter((_, idx) => idx !== i));

	const addSet = (i: number) =>
		push(
			rows.map((r, idx) => {
				if (idx !== i) return r;
				const last = r.exercise.sets[r.exercise.sets.length - 1] ?? emptyStrengthSet();
				return {
					...r,
					exercise: { ...r.exercise, sets: [...r.exercise.sets, { ...last }] }
				};
			})
		);

	const removeSet = (i: number, si: number) =>
		push(
			rows.map((r, idx) =>
				idx === i
					? { ...r, exercise: { ...r.exercise, sets: r.exercise.sets.filter((_, s) => s !== si) } }
					: r
			)
		);

	const setSet = (i: number, si: number, field: 'reps' | 'kg' | 'sec', raw: string) => {
		const val = raw === '' ? 0 : Number(raw);
		push(
			rows.map((r, idx) => {
				if (idx !== i) return r;
				return {
					...r,
					exercise: {
						...r.exercise,
						sets: r.exercise.sets.map((s, s2) => (s2 === si ? { ...s, [field]: val } : s))
					}
				};
			})
		);
	};

	return (
		<div className="grid gap-[0.7rem]">
			<ReorderableList
				className="grid gap-2"
				itemIds={rows.map((r) => r.key)}
				onDragEnd={(event) => {
					const next = reorderOnDragEnd(rows, event, (r) => r.key);
					if (next) push(next);
				}}
			>
				{rows.map((row, i) => (
					<SortableExerciseCard
						key={row.key}
						id={row.key}
						index={i}
						exercise={row.exercise}
						onName={(name) => setName(i, name)}
						onKind={(kind) => setKind(i, kind)}
						onDeleteExercise={() => setPending({ kind: 'exercise', i })}
						onAddSet={() => addSet(i)}
						onDeleteSet={(si) => setPending({ kind: 'set', i, si })}
						onSetField={(si, field, raw) => setSet(i, si, field, raw)}
					/>
				))}
			</ReorderableList>
			<button type="button" className={buttonClass({ variant: 'ghost' })} onClick={addExercise}>
				+ exercise
			</button>
			<Field as="label" className="mt-[0.7rem]">
				<span>Extra notes (optional)</span>
				<textarea
					rows={2}
					placeholder="How it felt, tempo, supersets…"
					value={extra}
					onChange={(e) => {
						setExtra(e.target.value);
						onChange(formatStrengthNotes(rowsToExercises(rows), e.target.value));
					}}
				/>
			</Field>
			<ConfirmDialog
				open={pending != null}
				title={pending?.kind === 'set' ? 'Delete this set?' : 'Delete this exercise?'}
				description={
					pending?.kind === 'exercise'
						? rows[pending.i]?.exercise.name
							? `“${rows[pending.i]!.exercise.name}” and its sets will be removed.`
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

function SortableExerciseCard({
	id,
	index,
	exercise: ex,
	onName,
	onKind,
	onDeleteExercise,
	onAddSet,
	onDeleteSet,
	onSetField
}: {
	id: string;
	index: number;
	exercise: StrengthExercise;
	onName: (name: string) => void;
	onKind: (kind: StrengthKind) => void;
	onDeleteExercise: () => void;
	onAddSet: () => void;
	onDeleteSet: (si: number) => void;
	onSetField: (si: number, field: 'reps' | 'kg' | 'sec', raw: string) => void;
}) {
	const kind = inferExerciseKind(ex);

	const setGrid =
		kind === 'weighted'
			? 'grid-cols-[2.25rem_1fr_1fr_2rem] max-sm:grid-cols-[2.25rem_1fr_1fr_2rem]'
			: 'grid-cols-[2.25rem_1fr_2rem]';

	return (
		<SortableItem id={id} className="rounded-box border border-line bg-inset p-3">
			<div className="flex items-center gap-1.5">
				<SortableDragHandle label="Reorder exercise" />
				<span
					className={cn(
						'shrink-0 text-[0.72rem] font-semibold tracking-[0.06em] text-muted uppercase'
					)}
				>
					{index + 1}
				</span>
				<input
					className="min-w-0 flex-1"
					placeholder="Exercise (e.g. seated row)"
					value={ex.name}
					onChange={(e) => onName(e.target.value)}
				/>
				<DeleteButton label="Delete exercise" onClick={onDeleteExercise} />
			</div>
			<SegmentedToggle
				className="mt-2"
				aria-label="How this exercise is logged"
				value={kind}
				onChange={onKind}
				options={KIND_OPTIONS}
			/>

			<div className="mt-3 overflow-x-auto">
				<div
					className={cn(
						'mb-1 grid gap-x-2 gap-y-0 px-1 text-[0.68rem] font-semibold tracking-[0.06em] text-muted uppercase',
						setGrid
					)}
				>
					<span />
					<span>{kind === 'time' ? 'Seconds' : 'Reps'}</span>
					{kind === 'weighted' ? <span>kg</span> : null}
					<span className="sr-only">Remove</span>
				</div>
				<ul className="m-0 grid list-none gap-1.5 p-0">
					{ex.sets.map((s, si) => (
						<li
							key={si}
							className={cn(
								'grid items-center gap-x-2 rounded-inset border border-line/70 bg-canvas/40 px-1 py-1',
								setGrid
							)}
						>
							<span
								className={cn(
									'flex size-7 items-center justify-center font-display text-[0.85rem] font-bold text-muted'
								)}
								aria-hidden
							>
								{si + 1}
							</span>
							{kind !== 'time' ? (
								<CompactSetInput
									aria-label={`Set ${si + 1} reps`}
									value={s.reps}
									inputMode="numeric"
									onChange={(v) => onSetField(si, 'reps', v)}
								/>
							) : (
								<CompactSetInput
									aria-label={`Set ${si + 1} seconds`}
									value={s.sec ?? 0}
									inputMode="numeric"
									onChange={(v) => onSetField(si, 'sec', v)}
								/>
							)}
							{kind === 'weighted' ? (
								<CompactSetInput
									aria-label={`Set ${si + 1} kg`}
									value={s.kg ?? 0}
									step={0.5}
									inputMode="decimal"
									onChange={(v) => onSetField(si, 'kg', v)}
								/>
							) : null}
							<DeleteButton compact label="Delete set" onClick={() => onDeleteSet(si)} />
						</li>
					))}
				</ul>
				<button
					type="button"
					className={buttonClass({ variant: 'ghost', size: 'sm', className: 'mt-2 w-full' })}
					onClick={onAddSet}
				>
					+ set
				</button>
			</div>
		</SortableItem>
	);
}

function CompactSetInput({
	'aria-label': ariaLabel,
	value,
	step = 1,
	inputMode,
	onChange
}: {
	'aria-label': string;
	value: number | string;
	step?: number | string;
	inputMode?: 'numeric' | 'decimal';
	onChange: (raw: string) => void;
}) {
	const stepNum = typeof step === 'string' ? Number(step) : step;
	const numeric = Number(value);
	const display = Number.isFinite(numeric) ? numeric : 0;
	const atMin = display <= 0;

	const bump = (delta: number) => {
		const next = Math.max(0, display + delta);
		const rounded =
			stepNum > 0 && stepNum < 1 ? Math.round(next / stepNum) * stepNum : next;
		const raw = stepNum < 1 ? String(rounded) : String(Math.round(rounded));
		onChange(raw);
	};

	return (
		<div className="mx-auto flex w-full max-w-[11rem] min-w-0 items-center gap-1">
			<Button
				type="button"
				variant="ghost"
				size="sm"
				className={cn(compactIconButtonClass, 'size-8! min-h-8! min-w-8!')}
				aria-label={`Decrease ${ariaLabel}`}
				title={`Decrease ${ariaLabel}`}
				disabled={atMin}
				onClick={() => bump(-stepNum)}
			>
				<Icon name="minus" size={14} />
			</Button>
			<input
				aria-label={ariaLabel}
				className={cn(
					'min-h-11 w-14 min-w-0 flex-1 text-center font-display text-[1.2rem] font-bold',
					'[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
				)}
				type="number"
				min={0}
				step={step}
				inputMode={inputMode}
				value={display}
				onChange={(e) => onChange(e.target.value)}
			/>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				className={cn(compactIconButtonClass, 'size-8! min-h-8! min-w-8!')}
				aria-label={`Increase ${ariaLabel}`}
				title={`Increase ${ariaLabel}`}
				onClick={() => bump(stepNum)}
			>
				<Icon name="plus" size={14} />
			</Button>
		</div>
	);
}