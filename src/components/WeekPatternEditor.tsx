import { ACTIVITY_TYPES, activityLabel, type ActivityType } from '$lib/activity';
import { cn, ui } from '$lib/ui';
import {
	compactSlot,
	MAX_WEEK_SLOTS,
	weekdayIndex,
	WEEKDAYS,
	type Weekday,
	type WeekSlot,
	type WeekSlotConstraint
} from '$lib/week-mix';
import { useEffect, useRef, useState } from 'react';
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

type DraftConstraint = 'usual' | WeekSlotConstraint;

type Draft = {
	id: string | null;
	day: Weekday;
	activity_type: ActivityType;
	constraint: DraftConstraint;
	notes: string;
};

const CONSTRAINT_OPTIONS: { value: DraftConstraint; label: string }[] = [
	{ value: 'usual', label: 'Usual' },
	{ value: 'fixed', label: "Can't change" },
	{ value: 'optional', label: 'Optional' }
];

function constraintHint(constraint: DraftConstraint): string {
	if (constraint === 'fixed') {
		return 'Keep this session as-is — commute, appointment, or anything you cannot move or slow down.';
	}
	if (constraint === 'optional') {
		return 'The coach may skip this if weather or life gets in the way.';
	}
	return 'The coach may adjust kind, distance, and day if recovery or life requires it.';
}

function notesPlaceholder(constraint: DraftConstraint): string {
	if (constraint === 'fixed') return "Commute — if I go slower I'll be late";
	if (constraint === 'optional') return 'Skip if raining';
	return 'Anything the coach should know about this session';
}

function emptyDraft(day: Weekday): Draft {
	return { id: null, day, activity_type: 'run', constraint: 'usual', notes: '' };
}

function draftFromRow(row: SlotRow): Draft {
	return {
		id: row.id,
		day: row.day,
		activity_type: row.activity_type,
		constraint: row.constraint ?? 'usual',
		notes: row.notes ?? ''
	};
}

function slotFromDraft(draft: Draft): WeekSlot {
	return compactSlot({
		day: draft.day,
		activity_type: draft.activity_type,
		constraint: draft.constraint === 'usual' ? undefined : draft.constraint,
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
	children: string;
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
			aria-label={ariaLabel ?? children}
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

export function WeekPatternEditor({
	rows,
	onChange,
	disabled
}: {
	rows: SlotRow[];
	onChange: (rows: SlotRow[]) => void;
	disabled?: boolean;
}) {
	const [draft, setDraft] = useState<Draft | null>(null);
	const [pending, setPending] = useState<SlotRow | null>(null);
	const [noteId, setNoteId] = useState<string | null>(null);
	const [noteText, setNoteText] = useState('');
	const [flashId, setFlashId] = useState<string | null>(null);
	const flashRef = useRef<HTMLDivElement | null>(null);
	const noteRef = useRef<HTMLTextAreaElement | null>(null);

	const grouped = WEEKDAYS.map((day) => ({
		day,
		rows: sortRows(rows.filter((r) => r.day === day))
	})).filter((g) => g.rows.length);

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

	function toggleConstraint(row: SlotRow, value: WeekSlotConstraint) {
		replaceRow(
			row.id,
			compactSlot({
				day: row.day,
				activity_type: row.activity_type,
				notes: row.notes,
				constraint: row.constraint === value ? undefined : value
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

	const editing = draft?.id != null;
	const atCap = rows.length >= MAX_WEEK_SLOTS;

	return (
		<div className="grid gap-3 mt-[0.45rem]">
			{grouped.length === 0 && (
				<p className={cn(ui.muted, 'm-0')}>No sessions yet — add the days you usually train.</p>
			)}
			{grouped.map((group) => (
				<div key={group.day} className="grid gap-[0.4rem]">
					<p className="m-0 text-[0.72rem] tracking-[0.08em] uppercase font-bold text-accent-fg">
						{group.day}
					</p>
					<div className="border border-line rounded-xl bg-inset overflow-hidden">
						{group.rows.map((row, i) => {
							const notes = row.notes?.trim();
							const editingNote = noteId === row.id;
							return (
								<div
									key={row.id}
									ref={row.id === flashId ? flashRef : undefined}
									className={i > 0 ? 'border-t border-line' : undefined}
								>
									<div className="relative flex items-center gap-2 min-h-11 px-3">
										<button
											type="button"
											className="absolute inset-0 z-0 appearance-none m-0 p-0 border-0 rounded-none bg-transparent cursor-pointer hover:bg-accent/8 disabled:opacity-35 disabled:cursor-not-allowed"
											aria-label={`Edit ${group.day} ${activityLabel(row.activity_type)}`}
											disabled={disabled}
											onClick={() => openEdit(row)}
										/>
										<div className="relative z-[1] flex flex-wrap items-center gap-2 min-w-0 flex-1 pointer-events-none">
											<span className="inline-flex items-center gap-2 text-fg font-semibold">
												<ActivityIcon type={row.activity_type} size={16} />
												{activityLabel(row.activity_type)}
											</span>
											<div className="flex flex-wrap items-center gap-1.5 pointer-events-auto">
												<RowChip
													pressed={row.constraint === 'optional'}
													disabled={disabled}
													onClick={() => toggleConstraint(row, 'optional')}
												>
													Optional
												</RowChip>
												<RowChip
													pressed={row.constraint === 'fixed'}
													disabled={disabled}
													aria-label="Can't change"
													onClick={() => toggleConstraint(row, 'fixed')}
												>
													Can't change
												</RowChip>
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
											</div>
										</div>
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
									</div>
									{editingNote && (
										<label className={cn(ui.field, 'relative z-[1] px-3 pb-2.5')}>
											<textarea
												ref={noteRef}
												rows={2}
												value={noteText}
												disabled={disabled}
												placeholder={notesPlaceholder(row.constraint ?? 'usual')}
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
			))}
			<button
				className={ui.btnGhost}
				type="button"
				disabled={disabled || atCap}
				onClick={openAdd}
			>
				<Icon name="plus" size={16} />
				Add activity
			</button>

			<Dialog
				open={draft != null}
				title={editing ? 'Edit activity' : 'Add activity'}
				className="sm:!max-w-[32rem]"
				onClose={() => setDraft(null)}
				actions={
					<>
						<button className={ui.btnGhost} type="button" onClick={() => setDraft(null)}>
							Cancel
						</button>
						<button className={ui.btnPrimary} type="button" onClick={saveDraft} disabled={disabled}>
							{editing ? 'Save' : 'Add'}
						</button>
					</>
				}
			>
				{draft && (
					<div className="grid gap-4">
						<div className={ui.field}>
							<span>Day</span>
							<ChoiceChips
								aria-label="Day"
								value={draft.day}
								options={DAY_OPTIONS}
								disabled={disabled}
								onChange={(day) => setDraft({ ...draft, day })}
							/>
						</div>
						<div className={ui.field}>
							<span>Activity</span>
							<ChoiceChips
								aria-label="Activity"
								value={draft.activity_type}
								options={SPORT_OPTIONS}
								disabled={disabled}
								onChange={(activity_type) => setDraft({ ...draft, activity_type })}
							/>
						</div>
						<div className={ui.field}>
							<span>For the coach</span>
							<ChoiceChips
								aria-label="How the coach may treat this session"
								value={draft.constraint}
								options={CONSTRAINT_OPTIONS}
								disabled={disabled}
								onChange={(constraint) => setDraft({ ...draft, constraint })}
							/>
							<span className={ui.fieldHint}>{constraintHint(draft.constraint)}</span>
						</div>
						<label className={ui.field}>
							<span>Notes</span>
							<textarea
								rows={3}
								value={draft.notes}
								disabled={disabled}
								placeholder={notesPlaceholder(draft.constraint)}
								onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
							/>
							<span className={ui.fieldHint}>Copied into the generate and debrief prompts.</span>
						</label>
					</div>
				)}
			</Dialog>

			<ConfirmDialog
				open={pending != null}
				title="Delete this activity?"
				description={
					pending
						? `${pending.day} ${activityLabel(pending.activity_type).toLowerCase()} will be removed from your usual week.`
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
