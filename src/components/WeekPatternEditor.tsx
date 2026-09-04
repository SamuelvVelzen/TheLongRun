import { ACTIVITY_TYPES, activityLabel, type ActivityType } from '$lib/activity';
import { cn, ui } from '$lib/ui';
import {
    MAX_WEEK_SLOTS,
    weekdayIndex,
    WEEKDAYS,
    type Weekday,
    type WeekSlot
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
	return rows.map(({ day, activity_type }) => ({ day, activity_type }));
}

const DAY_OPTIONS = WEEKDAYS.map((d) => ({ value: d, label: d.slice(0, 3) }));
const SPORT_OPTIONS = ACTIVITY_TYPES.map((t) => ({
	value: t,
	label: sportChipLabel(t, activityLabel(t))
}));

type Draft = { id: string | null; day: Weekday; activity_type: ActivityType };

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
	const [flashId, setFlashId] = useState<string | null>(null);
	const flashRef = useRef<HTMLDivElement | null>(null);

	const grouped = WEEKDAYS.map((day) => ({
		day,
		rows: sortRows(rows.filter((r) => r.day === day))
	})).filter((g) => g.rows.length);

	useEffect(() => {
		if (!flashId || !flashRef.current) return;
		flashRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
		const t = window.setTimeout(() => setFlashId(null), 2200);
		return () => window.clearTimeout(t);
	}, [flashId]);

	function openAdd() {
		setDraft({ id: null, day: defaultDay(rows), activity_type: 'run' });
	}

	function openEdit(row: SlotRow) {
		setDraft({ id: row.id, day: row.day, activity_type: row.activity_type });
	}

	function saveDraft() {
		if (!draft) return;
		if (draft.id) {
			onChange(
				rows.map((r) =>
					r.id === draft.id ? { ...r, day: draft.day, activity_type: draft.activity_type } : r
				)
			);
			setFlashId(draft.id);
		} else {
			const id = `slot-${++slotSeq}`;
			onChange([...rows, { id, day: draft.day, activity_type: draft.activity_type }]);
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
						{group.rows.map((row, i) => (
							<div
								key={row.id}
								ref={row.id === flashId ? flashRef : undefined}
								className={cn(
									'grid grid-cols-[minmax(0,1fr)_auto] items-center min-h-11 pl-[0.35rem] pr-2 transition-[background-color,box-shadow] duration-300',
									i > 0 && 'border-t border-line',
									row.id === flashId && 'bg-accent/12 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_35%,transparent)]'
								)}
							>
								<button
									type="button"
									className="appearance-none inline-flex items-center gap-2 min-h-11 m-0 px-[0.7rem] py-2 rounded-lg border-0 bg-transparent text-left text-fg font-semibold cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
									disabled={disabled}
									onClick={() => openEdit(row)}
								>
									<ActivityIcon type={row.activity_type} size={16} />
									{activityLabel(row.activity_type)}
								</button>
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
						))}
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
