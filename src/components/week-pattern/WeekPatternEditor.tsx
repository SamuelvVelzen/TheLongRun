import { ConfirmDialog, Dialog, Field, FormSection, ChoiceChips, EditButton } from '../ui';
import { buttonClass } from '../ui/Button';
import { fieldClass, fieldHintClass } from '../ui/Field';
import { ui } from '../ui/tokens';
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
import { ActivityIcon, Icon, sportChipLabel } from '../Icon';
import { MoreMenu } from '../MoreMenu';

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

const CONSTRAINT_OPTIONS = CONSTRAINTS.map((value) => ({
	value,
	label: slotConstraintLabel(value)
}));

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

function constraintIcon(constraint: WeekSlotConstraint): 'locate' | 'skip' | 'sparkle' {
	if (constraint === 'fixed') return 'locate';
	if (constraint === 'optional') return 'skip';
	return 'sparkle';
}

function limitKindIcon(kind: DayLimitKind): 'moon' | 'warning' {
	return kind === 'off' ? 'moon' : 'warning';
}

const rowChipClass = cn(ui.choiceChip, 'min-h-9! px-2.5! py-1! text-[0.78rem]');

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
			className={rowChipClass}
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

const staticChip = cn(ui.tag, 'min-h-9 px-2.5 py-1 text-[0.78rem] font-semibold text-fg');

const listShell = 'rounded-box border border-line bg-canvas overflow-hidden divide-y divide-line';

const sectionActionClass =
	'appearance-none bg-transparent border-0 p-0 min-h-11 text-accent-fg font-semibold cursor-pointer text-[0.85rem] whitespace-nowrap disabled:opacity-45 disabled:cursor-not-allowed';

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
	const [pendingLimitDay, setPendingLimitDay] = useState<Weekday | null>(null);
	const [flashId, setFlashId] = useState<string | null>(null);
	const [limitDraft, setLimitDraft] = useState<LimitDraft | null>(null);
	const flashRef = useRef<HTMLDivElement | null>(null);

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

	function togglePlanned(t: ActivityType) {
		const set = new Set(plannedSports);
		if (set.has(t)) set.delete(t);
		else set.add(t);
		onPlannedSportsChange(ACTIVITY_TYPES.filter((x) => set.has(x)));
	}

	function openAdd() {
		setDraft(emptyDraft('Monday'));
	}

	function openEdit(row: SlotRow) {
		setDraft(draftFromRow(row));
	}

	function replaceRow(id: string, slot: WeekSlot) {
		onChange(rows.map((r) => (r.id === id ? { id: r.id, ...slot } : r)));
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
		setLimitDraft({
			editing: limit.day,
			day: limit.day,
			kind: limit.kind,
			notes: limit.notes ?? ''
		});
	}

	function saveLimit() {
		if (!limitDraft) return;
		const rest = dayLimits.filter((l) => l.day !== limitDraft.editing && l.day !== limitDraft.day);
		onDayLimitsChange(
			normalizeDayLimits([
				...rest,
				{ day: limitDraft.day, kind: limitDraft.kind, notes: limitDraft.notes }
			])
		);
		setLimitDraft(null);
	}

	function removeLimit(day: Weekday) {
		onDayLimitsChange(dayLimits.filter((l) => l.day !== day));
	}

	const editing = draft?.id != null;
	const atCap = rows.length >= MAX_WEEK_SLOTS;
	const limitNoteMissing = limitDraft?.kind === 'limited' && !limitDraft.notes.trim();

	return (
		<div className={ui.form}>
			<FormSection title="Coach plans">
				<div className={ui.choiceChips}>
					{ACTIVITY_TYPES.map((t) =>
						readOnly ? (
							plannedSports.includes(t) ? (
								<span key={t} className={cn(staticChip, ui.tagAccent)}>
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
						The coach decides how many of these and on which days. Sports you leave off still count
						as load from your history.
					</span>
				)}
			</FormSection>

			<FormSection
				title="Pinned activities"
				action={
					readOnly ? undefined : (
						<button
							type="button"
							className={sectionActionClass}
							disabled={disabled || atCap}
							onClick={openAdd}
						>
							+ Pin activity
						</button>
					)
				}
			>
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
						<div key={group.day} className="grid gap-2">
							<p className="m-0 text-[0.82rem] font-semibold tracking-[-0.01em] text-fg">{group.day}</p>
							{offDay && (
								<p className={cn(fieldHintClass, 'm-0')}>
									{group.day} is marked off, but has pinned activities — those still happen.
								</p>
							)}
							<div className={listShell}>
								{group.rows.map((row) => {
									const notes = row.notes?.trim();
									const constraint = row.constraint ?? 'preference';
									return (
										<div
											key={row.id}
											ref={row.id === flashId ? flashRef : undefined}
											className="px-3 py-2.5"
										>
											<div className="flex items-start gap-2 min-h-8">
												<div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
													<span className="inline-flex items-center gap-2 text-fg font-semibold">
														<ActivityIcon type={row.activity_type} size={16} />
														{activityLabel(row.activity_type)}
													</span>
													<span
														className={cn(
															staticChip,
															'inline-flex items-center gap-1 bg-transparent text-muted border-line font-semibold'
														)}
													>
														<Icon name={constraintIcon(constraint)} size={12} />
														{slotConstraintLabel(constraint)}
													</span>
												</div>
												{readOnly ? null : (
													<div className="flex shrink-0 items-center gap-0.5">
														<EditButton
															compact
															className="text-muted hover:text-fg"
															label={`Edit ${group.day} ${activityLabel(row.activity_type)}`}
															disabled={disabled}
															onClick={() => openEdit(row)}
														/>
														<MoreMenu
															compact
															label={`More for ${activityLabel(row.activity_type)}`}
															items={[
																{
																	label: 'Unpin',
																	icon: <Icon name="close" size={16} />,
																	danger: true,
																	onClick: () => setPending(row)
																}
															]}
														/>
													</div>
												)}
											</div>
											{notes ? (
												<p className="m-0 mt-1.5 text-[0.85rem] leading-snug text-muted">
													{notes}
												</p>
											) : readOnly ? null : (
												<p className="m-0 mt-1.5 text-[0.82rem] text-muted/70 italic">
													No note — edit to add context for the coach.
												</p>
											)}
										</div>
									);
								})}
							</div>
						</div>
					);
				})}
			</FormSection>

			<FormSection
				title="Day limits"
				action={
					readOnly ? undefined : (
						<button
							type="button"
							className={sectionActionClass}
							disabled={disabled || dayLimits.length >= WEEKDAYS.length}
							onClick={openAddLimit}
						>
							+ Day limit
						</button>
					)
				}
			>
				{dayLimits.length === 0 ? (
					<p className={cn('text-muted', 'm-0')}>
						{readOnly
							? 'Every day is available.'
							: 'Every day is available. Add a limit for days you can’t train, or only part of the day.'}
					</p>
				) : (
					<div className={listShell}>
						{dayLimits.map((limit) => (
							<div key={limit.day} className="px-3 py-2.5">
								<div className="flex items-start gap-2 min-h-8">
									<div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
										<span className="text-fg font-semibold">{limit.day}</span>
										<span
											className={cn(
												staticChip,
												'inline-flex items-center gap-1 bg-transparent text-muted border-line font-semibold'
											)}
										>
											<Icon name={limitKindIcon(limit.kind)} size={12} />
											{limit.kind === 'off' ? 'Off' : 'Limited'}
										</span>
									</div>
									{readOnly ? null : (
										<div className="flex shrink-0 items-center gap-0.5">
											<EditButton
												compact
												className="text-muted hover:text-fg"
												label={`Edit ${limit.day} limit`}
												disabled={disabled}
												onClick={() => openEditLimit(limit)}
											/>
											<MoreMenu
												compact
												label={`More for ${limit.day} limit`}
												items={[
													{
														label: 'Remove limit',
														icon: <Icon name="close" size={16} />,
														danger: true,
														onClick: () => setPendingLimitDay(limit.day)
													}
												]}
											/>
										</div>
									)}
								</div>
								{limit.notes ? (
									<p className="m-0 mt-1.5 text-[0.85rem] leading-snug text-muted">
										{limit.notes}
									</p>
								) : limit.kind === 'limited' ? (
									<p className="m-0 mt-1.5 text-[0.82rem] text-muted/70 italic">
										No window set — edit to describe when training fits.
									</p>
								) : null}
							</div>
						))}
					</div>
				)}
			</FormSection>

			<Dialog
				open={draft != null}
				title={editing ? 'Edit pinned activity' : 'Pin an activity'}
				className="sm:!max-w-[32rem]"
				onClose={() => setDraft(null)}
				actions={
					<>
						<button
							className={buttonClass({ variant: 'ghost' })}
							type="button"
							onClick={() => setDraft(null)}
						>
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
						<Field as="label">
							<span>Notes</span>
							<textarea
								rows={3}
								value={draft.notes}
								disabled={disabled}
								placeholder={notesPlaceholder(draft.constraint)}
								onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
							/>
							<span className={fieldHintClass}>Copied into the generate and debrief prompts.</span>
						</Field>
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
							<div className={ui.choiceChips}>
								{DAY_OPTIONS.map((opt) => {
									const taken =
										limitByDay.has(opt.value) && opt.value !== limitDraft.editing;
									return (
										<button
											key={opt.value}
											type="button"
											className={rowChipClass}
											aria-pressed={limitDraft.day === opt.value}
											disabled={disabled || taken}
											onClick={() => setLimitDraft({ ...limitDraft, day: opt.value })}
										>
											{opt.label}
										</button>
									);
								})}
							</div>
							{limitDraft.editing == null && dayLimits.length >= WEEKDAYS.length - 1 ? (
								<span className={fieldHintClass}>
									Each day can have at most one limit. Days that already have a limit are
									disabled.
								</span>
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
						<Field as="label">
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
						</Field>
					</div>
				)}
			</Dialog>

			<ConfirmDialog
				open={pending != null}
				title="Unpin this activity?"
				description={
					pending
						? `${pending.day} ${activityLabel(pending.activity_type).toLowerCase()} comes off your draft week setup. Your saved default week does not change until you choose Save as my default week.`
						: null
				}
				confirmLabel="Unpin"
				cancelLabel="Keep"
				onClose={() => setPending(null)}
				onConfirm={() => {
					if (!pending) return;
					onChange(rows.filter((r) => r.id !== pending.id));
					setPending(null);
				}}
			/>

			<ConfirmDialog
				open={pendingLimitDay != null}
				title="Remove this day limit?"
				description={
					pendingLimitDay
						? `${pendingLimitDay} goes back to a normal training day in your draft week setup.`
						: null
				}
				confirmLabel="Remove"
				cancelLabel="Keep"
				onClose={() => setPendingLimitDay(null)}
				onConfirm={() => {
					if (!pendingLimitDay) return;
					removeLimit(pendingLimitDay);
					setPendingLimitDay(null);
				}}
			/>
		</div>
	);
}
