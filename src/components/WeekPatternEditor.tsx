import { buttonClass, fieldClass, fieldHintClass } from './ui';
import { ACTIVITY_TYPES, activityLabel, type ActivityType } from '$lib/activity';
import { cn } from '$lib/ui';
import {
	compactSlot,
	MAX_WEEK_SLOTS,
	normalizeDayLimits,
	slotConstraintLabel,
	weekdayIndex,
	WEEKDAYS,
	type DayLimit,
	type DayLimitKind,
	type Weekday,
	type WeekSlot,
	type WeekSlotConstraint
} from '$lib/week-mix';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChoiceChips } from './ChoiceChips';
import { DeleteButton } from './DeleteButton';
import { ConfirmDialog, Dialog } from './Dialog';
import { ActivityIcon, Icon, sportChipLabel } from './Icon';

export type SlotRow = WeekSlot & { id: string };

let slotSeq = 0;

export function rowsFrom(pattern: WeekSlot[]): SlotRow[] {
	return pattern.map((s) => ({ ...s, id: `slot-${++slotSeq}` }));
}

export function toPattern(rows: SlotRow[]): WeekSlot[] {
	return rows.map(({ day, activity_type, constraint, notes }) =>
		compactSlot({ day, activity_type, constraint, notes })
	);
}

const DAY_OPTIONS = WEEKDAYS.map((d) => ({ value: d, label: d.slice(0, 3) }));
const SPORT_OPTIONS = ACTIVITY_TYPES.map((t) => ({
	value: t,
	label: sportChipLabel(t, activityLabel(t))
}));

type Draft = {
	id: string | null;
	day: Weekday;
	activity_type: ActivityType;
	constraint: WeekSlotConstraint;
	notes: string;
};

const CONSTRAINTS: WeekSlotConstraint[] = ['fixed', 'optional', 'preference'];

const CONSTRAINT_OPTIONS = CONSTRAINTS.map((value) => ({ value, label: slotConstraintLabel(value) }));

function constraintHint(constraint: WeekSlotConstraint): string {
	if (constraint === 'fixed') {
		return 'Life fixes this one — commute, appointment. The coach keeps the day and never drops it.';
	}
	if (constraint === 'optional') {
		return 'Pinned, but the coach may skip it if weather or recovery make it a bad idea.';
	}
	return 'A soft wish. The coach keeps it when it fits, but may move, swap, or drop it.';
}

function notesPlaceholder(constraint: WeekSlotConstraint): string {
	if (constraint === 'fixed') return "Commute — if I go slower I'll be late";
	if (constraint === 'optional') return 'Skip if raining';
	return 'Group long run if possible';
}

function emptyDraft(day: Weekday): Draft {
	return { id: null, day, activity_type: 'bike', constraint: 'fixed', notes: '' };
}

function draftFromRow(row: SlotRow): Draft {
	return {
		id: row.id,
		day: row.day,
		activity_type: row.activity_type,
		constraint: row.constraint ?? 'preference',
		notes: row.notes ?? ''
	};
}

function slotFromDraft(draft: Draft): WeekSlot {
	return compactSlot({
		day: draft.day,
		activity_type: draft.activity_type,
		constraint: draft.constraint,
		notes: draft.notes
	});
}

function defaultDay(rows: SlotRow[]): Weekday {
	const used = new Set(rows.map((r) => r.day));
	return WEEKDAYS.find((d) => !used.has(d)) ?? 'Monday';
}

function sortRows(rows: SlotRow[]): SlotRow[] {
	return [...rows].sort((a, b) => {
		const d = weekdayIndex(a.day) - weekdayIndex(b.day);
		if (d !== 0) return d;
		return ACTIVITY_TYPES.indexOf(a.activity_type) - ACTIVITY_TYPES.indexOf(b.activity_type);
	});
}

type LimitDraft = {
	editing: Weekday | null;
	day: Weekday;
	kind: DayLimitKind;
	notes: string;
};

const LIMIT_KIND_OPTIONS: { value: DayLimitKind; label: string }[] = [
	{ value: 'off', label: 'Off' },
	{ value: 'limited', label: 'Limited' }
];

function limitHint(kind: DayLimitKind): string {
	return kind === 'off'
		? 'No sessions that day. Pinned activities still happen.'
		: 'Sessions are allowed, but only within the note — a time window or a max duration.';
}

function limitPlaceholder(kind: DayLimitKind): string {
	return kind === 'off' ? "Kids' swimming" : 'Only before 8:00, max 45 min';
}

const chip =
	'appearance-none inline-flex items-center justify-center gap-1 min-h-8! min-w-0 px-2.5 py-1 rounded-full border border-solid text-[0.75rem] font-semibold leading-none cursor-pointer transition-[color,background-color,border-color] duration-150 disabled:opacity-35 disabled:cursor-not-allowed';

function RowChip({
	pressed,
	children,
	onClick,
	disabled,
	'aria-label': ariaLabel
}: {
	pressed: boolean;
	children: ReactNode;
	onClick: () => void;
	disabled?: boolean;
	'aria-label'?: string;
}) {
	return (
		<button
			type="button"
			className={cn(
				chip,
				pressed
					? 'bg-accent text-accent-ink border-accent'
					: 'bg-transparent text-muted border-line hover:text-fg hover:border-accent/35'
			)}
			aria-pressed={pressed}
			aria-label={ariaLabel}
			disabled={disabled}
			onClick={(event) => {
				event.stopPropagation();
				onClick();
			}}
		>
			{children}
		</button>
	);
}

const staticChip =
	'inline-flex items-center justify-center gap-1 min-h-8 min-w-0 px-2.5 py-1 rounded-full border border-solid text-[0.75rem] font-semibold leading-none';

const blockLabel = 'm-0 text-[0.72rem] tracking-[0.08em] uppercase font-bold text-accent-fg';

export function WeekPatternEditor({
	rows,
	onChange,
	dayLimits,
	onDayLimitsChange,
	plannedSports,
	onPlannedSportsChange,
	disabled,
	readOnly
}: {
	rows: SlotRow[];
	onChange: (rows: SlotRow[]) => void;
	dayLimits: DayLimit[];
	onDayLimitsChange: (limits: DayLimit[]) => void;
	plannedSports: ActivityType[];
	onPlannedSportsChange: (sports: ActivityType[]) => void;
	disabled?: boolean;
	readOnly?: boolean;
}) {
	const [draft, setDraft] = useState<Draft | null>(null);
	const [pending, setPending] = useState<SlotRow | null>(null);
	const [noteId, setNoteId] = useState<string | null>(null);
	const [noteText, setNoteText] = useState('');
	const [flashId, setFlashId] = useState<string | null>(null);
	const [limitDraft, setLimitDraft] = useState<LimitDraft | null>(null);
	const flashRef = useRef<HTMLDivElement | null>(null);
	const noteRef = useRef<HTMLTextAreaElement | null>(null);

	const grouped = WEEKDAYS.map((day) => ({
		day,
		rows: sortRows(rows.filter((r) => r.day === day))
	})).filter((g) => g.rows.length);
	const limitByDay = new Map(dayLimits.map((l) => [l.day, l]));

	useEffect(() => {
		if (!flashId || !flashRef.current) return;
		flashRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		const t = window.setTimeout(() => setFlashId(null), 400);
		return () => window.clearTimeout(t);
	}, [flashId]);

	useEffect(() => {
		if (!noteId) return;
		noteRef.current?.focus();
		noteRef.current?.select();
	}, [noteId]);

	function togglePlanned(t: ActivityType) {
		const set = new Set(plannedSports);
		if (set.has(t)) set.delete(t);
		else set.add(t);
		onPlannedSportsChange(ACTIVITY_TYPES.filter((x) => set.has(x)));
	}

	function openAdd() {
		setNoteId(null);
		setDraft(emptyDraft(defaultDay(rows)));
	}

	function openEdit(row: SlotRow) {
		setNoteId(null);
		setDraft(draftFromRow(row));
	}

	function replaceRow(id: string, slot: WeekSlot) {
		onChange(rows.map((r) => (r.id === id ? { id: r.id, ...slot } : r)));
	}

	function setConstraint(row: SlotRow, value: WeekSlotConstraint) {
		replaceRow(
			row.id,
			compactSlot({
				day: row.day,
				activity_type: row.activity_type,
				notes: row.notes,
				constraint: value
			})
		);
	}

	function openNotes(row: SlotRow) {
		setDraft(null);
		setNoteId(row.id);
		setNoteText(row.notes ?? '');
	}

	function saveNotes() {
		if (!noteId) return;
		const row = rows.find((r) => r.id === noteId);
		if (row) {
			replaceRow(
				row.id,
				compactSlot({
					day: row.day,
					activity_type: row.activity_type,
					constraint: row.constraint,
					notes: noteText
				})
			);
		}
		setNoteId(null);
	}

	function saveDraft() {
		if (!draft) return;
		const slot = slotFromDraft(draft);
		if (draft.id) {
			replaceRow(draft.id, slot);
			setFlashId(draft.id);
		} else {
			const id = `slot-${++slotSeq}`;
			onChange([...rows, { id, ...slot }]);
			setFlashId(id);
		}
		setDraft(null);
	}

	function openAddLimit() {
		const day = WEEKDAYS.find((d) => !limitByDay.has(d)) ?? 'Monday';
		setLimitDraft({ editing: null, day, kind: 'off', notes: '' });
	}

	function openEditLimit(limit: DayLimit) {
		setLimitDraft({ editing: limit.day, day: limit.day, kind: limit.kind, notes: limit.notes ?? '' });
	}

	function saveLimit() {
		if (!limitDraft) return;
		const rest = dayLimits.filter((l) => l.day !== limitDraft.editing && l.day !== limitDraft.day);
		onDayLimitsChange(
			normalizeDayLimits([...rest, { day: limitDraft.day, kind: limitDraft.kind, notes: limitDraft.notes }])
		);
		setLimitDraft(null);
	}

	function removeLimit(day: Weekday) {
		onDayLimitsChange(dayLimits.filter((l) => l.day !== day));
	}

	const editing = draft?.id != null;
	const atCap = rows.length >= MAX_WEEK_SLOTS;
	const limitNoteMissing = limitDraft?.kind === 'limited' && !limitDraft.notes.trim();
	const limitReplaces =
		limitDraft != null && limitDraft.day !== limitDraft.editing && limitByDay.has(limitDraft.day);

	return (
		<div className="grid gap-5 mt-[0.45rem]">
			<div className="grid gap-[0.4rem]">
				<p className={blockLabel}>Coach plans</p>
				<div className="flex flex-wrap gap-1.5">
					{ACTIVITY_TYPES.map((t) =>
						readOnly ? (
							plannedSports.includes(t) ? (
								<span key={t} className={cn(staticChip, 'bg-accent text-accent-ink border-accent')}>
									{activityLabel(t)}
								</span>
							) : null
						) : (
							<RowChip
								key={t}
								pressed={plannedSports.includes(t)}
								disabled={disabled}
								aria-label={`Coach plans ${activityLabel(t).toLowerCase()}`}
								onClick={() => togglePlanned(t)}
							>
								<ActivityIcon type={t} size={14} />
								{activityLabel(t)}
							</RowChip>
						)
					)}
					{readOnly && plannedSports.length === 0 ? (
						<span className={cn('text-muted', 'text-[0.85rem]')}>Only pinned activities.</span>
					) : null}
				</div>
				{readOnly ? null : (
					<span className={fieldHintClass}>
						The coach decides how many of these and on which days. Sports you leave off still count as
						load from your history.
					</span>
				)}
			</div>

			<div className="grid gap-3">
				<p className={blockLabel}>Pinned activities</p>
				{grouped.length === 0 && (
					<p className={cn('text-muted', 'm-0')}>
						{readOnly
							? 'Nothing pinned.'
							: "Only pin what you can't move, like a commute. The coach plans the rest."}
					</p>
				)}
				{grouped.map((group) => {
					const offDay = limitByDay.get(group.day)?.kind === 'off';
					return (
						<div key={group.day} className="grid gap-[0.4rem]">
							<p className="m-0 text-[0.8rem] font-semibold text-fg">{group.day}</p>
							{offDay && (
								<p className={cn(fieldHintClass, 'm-0')}>
									{group.day} is marked off, but has pinned activities — those still happen.
								</p>
							)}
							<div className="border border-line rounded-xl bg-inset overflow-hidden">
								{group.rows.map((row, i) => {
									const notes = row.notes?.trim();
									const editingNote = noteId === row.id;
									const constraint = row.constraint ?? 'preference';
									return (
										<div
											key={row.id}
											ref={row.id === flashId ? flashRef : undefined}
											className={i > 0 ? 'border-t border-line' : undefined}
										>
											<div className="relative flex items-center gap-2 min-h-11 px-3">
												{readOnly ? null : (
													<button
														type="button"
														className="absolute inset-0 z-0 appearance-none m-0 p-0 border-0 rounded-none bg-transparent cursor-pointer hover:bg-accent/8 disabled:opacity-35 disabled:cursor-not-allowed"
														aria-label={`Edit ${group.day} ${activityLabel(row.activity_type)}`}
														disabled={disabled}
														onClick={() => openEdit(row)}
													/>
												)}
												<div className="relative z-[1] flex flex-wrap items-center gap-2 min-w-0 flex-1 pointer-events-none">
													<span className="inline-flex items-center gap-2 text-fg font-semibold">
														<ActivityIcon type={row.activity_type} size={16} />
														{activityLabel(row.activity_type)}
													</span>
													<div
														className={cn(
															'flex flex-wrap items-center gap-1.5',
															!readOnly && 'pointer-events-auto'
														)}
													>
														{readOnly ? (
															<>
																<span
																	className={cn(
																		staticChip,
																		constraint === 'preference'
																			? 'bg-transparent text-muted border-line'
																			: 'bg-accent text-accent-ink border-accent'
																	)}
																>
																	{slotConstraintLabel(constraint)}
																</span>
																{notes ? (
																	<span
																		className={cn(
																			staticChip,
																			'max-w-[min(100%,16rem)] bg-transparent text-muted border-line font-normal'
																		)}
																	>
																		<span className="truncate">{notes}</span>
																	</span>
																) : null}
															</>
														) : (
															<>
																{CONSTRAINTS.map((c) => (
																	<RowChip
																		key={c}
																		pressed={constraint === c}
																		disabled={disabled}
																		aria-label={slotConstraintLabel(c)}
																		onClick={() => setConstraint(row, c)}
																	>
																		{slotConstraintLabel(c)}
																	</RowChip>
																))}
																{!editingNote && (
																	<button
																		type="button"
																		className={cn(
																			chip,
																			notes
																				? 'max-w-[min(100%,16rem)] bg-transparent text-muted border-line font-normal hover:text-fg hover:border-accent/35'
																				: 'bg-transparent text-muted border-dashed border-line hover:text-fg hover:border-accent/35'
																		)}
																		disabled={disabled}
																		aria-label={notes ? 'Edit notes' : 'Add notes'}
																		onClick={(event) => {
																			event.stopPropagation();
																			openNotes(row);
																		}}
																	>
																		<span className={notes ? 'truncate' : undefined}>
																			{notes || '+ note'}
																		</span>
																	</button>
																)}
															</>
														)}
													</div>
												</div>
												{readOnly ? null : (
													<div className="relative z-[1] shrink-0">
														<DeleteButton
															compact
															label={`Delete ${group.day} ${activityLabel(row.activity_type)}`}
															disabled={disabled}
															onClick={(event) => {
																event.stopPropagation();
																setPending(row);
															}}
														/>
													</div>
												)}
											</div>
											{editingNote && (
												<label className={cn(fieldClass, 'relative z-[1] px-3 pb-2.5')}>
													<textarea
														ref={noteRef}
														rows={2}
														value={noteText}
														disabled={disabled}
														placeholder={notesPlaceholder(constraint)}
														onChange={(event) => setNoteText(event.target.value)}
														onBlur={saveNotes}
														onKeyDown={(event) => {
															if (event.key === 'Escape') {
																event.preventDefault();
																setNoteId(null);
															}
															if (event.key === 'Enter' && !event.shiftKey) {
																event.preventDefault();
																event.currentTarget.blur();
															}
														}}
													/>
												</label>
											)}
										</div>
									);
								})}
							</div>
						</div>
					);
				})}
				{readOnly ? null : (
					<button
						className={buttonClass({ variant: 'ghost' })}
						type="button"
						disabled={disabled || atCap}
						onClick={openAdd}
					>
						<Icon name="plus" size={16} />
						Pin an activity
					</button>
				)}
			</div>

			<div className="grid gap-[0.4rem]">
				<p className={blockLabel}>Day limits</p>
				{dayLimits.length === 0 ? (
					<p className={cn('text-muted', 'm-0')}>
						{readOnly ? 'Every day is available.' : 'Every day is available. Add a limit for days you can’t train, or only part of the day.'}
					</p>
				) : (
					<div className="border border-line rounded-xl bg-inset overflow-hidden">
						{dayLimits.map((limit, i) => (
							<div
								key={limit.day}
								className={cn('relative flex items-center gap-2 min-h-11 px-3', i > 0 && 'border-t border-line')}
							>
								{readOnly ? null : (
									<button
										type="button"
										className="absolute inset-0 z-0 appearance-none m-0 p-0 border-0 rounded-none bg-transparent cursor-pointer hover:bg-accent/8 disabled:opacity-35 disabled:cursor-not-allowed"
										aria-label={`Edit ${limit.day} limit`}
										disabled={disabled}
										onClick={() => openEditLimit(limit)}
									/>
								)}
								<div className="relative z-[1] flex flex-wrap items-center gap-2 min-w-0 flex-1 pointer-events-none">
									<span className="text-fg font-semibold">{limit.day}</span>
									<span className={cn(staticChip, 'bg-accent text-accent-ink border-accent')}>
										{limit.kind === 'off' ? 'Off' : 'Limited'}
									</span>
									{limit.notes ? (
										<span className={cn('text-muted', 'text-[0.85rem] truncate max-w-[min(100%,20rem)]')}>
											{limit.notes}
										</span>
									) : null}
								</div>
								{readOnly ? null : (
									<div className="relative z-[1] shrink-0">
										<DeleteButton
											compact
											label={`Delete ${limit.day} limit`}
											disabled={disabled}
											onClick={(event) => {
												event.stopPropagation();
												removeLimit(limit.day);
											}}
										/>
									</div>
								)}
							</div>
						))}
					</div>
				)}
				{readOnly ? null : (
					<button
						className={buttonClass({ variant: 'ghost' })}
						type="button"
						disabled={disabled || dayLimits.length >= WEEKDAYS.length}
						onClick={openAddLimit}
					>
						<Icon name="plus" size={16} />
						Day limit
					</button>
				)}
			</div>

			<Dialog
				open={draft != null}
				title={editing ? 'Edit pinned activity' : 'Pin an activity'}
				className="sm:!max-w-[32rem]"
				onClose={() => setDraft(null)}
				actions={
					<>
						<button className={buttonClass({ variant: 'ghost' })} type="button" onClick={() => setDraft(null)}>
							Cancel
						</button>
						<button className={buttonClass()} type="button" onClick={saveDraft} disabled={disabled}>
							{editing ? 'Save' : 'Add'}
						</button>
					</>
				}
			>
				{draft && (
					<div className="grid gap-4">
						<div className={fieldClass}>
							<span>Day</span>
							<ChoiceChips
								aria-label="Day"
								value={draft.day}
								options={DAY_OPTIONS}
								disabled={disabled}
								onChange={(day) => setDraft({ ...draft, day })}
							/>
						</div>
						<div className={fieldClass}>
							<span>Activity</span>
							<ChoiceChips
								aria-label="Activity"
								value={draft.activity_type}
								options={SPORT_OPTIONS}
								disabled={disabled}
								onChange={(activity_type) => setDraft({ ...draft, activity_type })}
							/>
						</div>
						<div className={fieldClass}>
							<span>For the coach</span>
							<ChoiceChips
								aria-label="How the coach may treat this activity"
								value={draft.constraint}
								options={CONSTRAINT_OPTIONS}
								disabled={disabled}
								onChange={(constraint) => setDraft({ ...draft, constraint })}
							/>
							<span className={fieldHintClass}>{constraintHint(draft.constraint)}</span>
						</div>
						<label className={fieldClass}>
							<span>Notes</span>
							<textarea
								rows={3}
								value={draft.notes}
								disabled={disabled}
								placeholder={notesPlaceholder(draft.constraint)}
								onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
							/>
							<span className={fieldHintClass}>Copied into the generate and debrief prompts.</span>
						</label>
					</div>
				)}
			</Dialog>

			<Dialog
				open={limitDraft != null}
				title={limitDraft?.editing ? 'Edit day limit' : 'Add day limit'}
				className="sm:!max-w-[32rem]"
				onClose={() => setLimitDraft(null)}
				actions={
					<>
						<button
							className={buttonClass({ variant: 'ghost' })}
							type="button"
							onClick={() => setLimitDraft(null)}
						>
							Cancel
						</button>
						<button
							className={buttonClass()}
							type="button"
							onClick={saveLimit}
							disabled={disabled || limitNoteMissing}
						>
							{limitDraft?.editing ? 'Save' : 'Add'}
						</button>
					</>
				}
			>
				{limitDraft && (
					<div className="grid gap-4">
						<div className={fieldClass}>
							<span>Day</span>
							<ChoiceChips
								aria-label="Day"
								value={limitDraft.day}
								options={DAY_OPTIONS}
								disabled={disabled}
								onChange={(day) => setLimitDraft({ ...limitDraft, day })}
							/>
							{limitReplaces ? (
								<span className={fieldHintClass}>Replaces the limit already set for {limitDraft.day}.</span>
							) : null}
						</div>
						<div className={fieldClass}>
							<span>Limit</span>
							<ChoiceChips
								aria-label="Limit"
								value={limitDraft.kind}
								options={LIMIT_KIND_OPTIONS}
								disabled={disabled}
								onChange={(kind) => setLimitDraft({ ...limitDraft, kind })}
							/>
							<span className={fieldHintClass}>{limitHint(limitDraft.kind)}</span>
						</div>
						<label className={fieldClass}>
							<span>{limitDraft.kind === 'limited' ? 'When or how much' : 'Why (optional)'}</span>
							<textarea
								rows={2}
								value={limitDraft.notes}
								disabled={disabled}
								placeholder={limitPlaceholder(limitDraft.kind)}
								onChange={(event) => setLimitDraft({ ...limitDraft, notes: event.target.value })}
							/>
							<span className={fieldHintClass}>
								{limitDraft.kind === 'limited'
									? 'Required — the coach fits any session that day inside this.'
									: 'Copied into the prompts so the coach knows why.'}
							</span>
						</label>
					</div>
				)}
			</Dialog>

			<ConfirmDialog
				open={pending != null}
				title="Remove this pinned activity?"
				description={
					pending
						? `${pending.day} ${activityLabel(pending.activity_type).toLowerCase()} will be removed from your week setup.`
						: null
				}
				onClose={() => setPending(null)}
				onConfirm={() => {
					if (!pending) return;
					onChange(rows.filter((r) => r.id !== pending.id));
				}}
			/>
		</div>
	);
}
