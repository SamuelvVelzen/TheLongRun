import {
	compactFuelText,
	FUEL_OUTCOME_OPTIONS,
	FUEL_PHASE_META,
	FUEL_PHASE_OPTIONS,
	FUEL_PHASES,
	FUEL_PLACEHOLDERS,
	fuelTallyLabel,
	groupFuelLog,
	MAX_FUEL_GUIDANCE,
	MAX_FUEL_ITEM,
	MAX_FUEL_TIMING,
	newFuelId,
	type FuelEntry,
	type FuelGroup,
	type FuelLog as FuelLogData,
	type FuelPhase,
	type FuelRunRef
} from '$lib/fuel';
import { fuelFormSchema, type FuelFormValues } from '$lib/fuel-schema';
import { renameFuelItem, saveFuelLog } from '$lib/server/functions';
import { cn } from '$lib/ui';
import { Link, useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { ConfirmDialog } from './Dialog';
import { FuelDescribePanel } from './FuelDescribePanel';
import { FuelTryLine } from './FuelParts';
import { Icon } from './Icon';
import { errorMessage, useSnackbar } from './Snackbar';
import {
	Actions,
	Button,
	buttonClass,
	Dialog,
	Form,
	formClass,
	FormGrid,
	formSectionTitleClass,
	panelClass,
	statusPillClass,
	useAppForm
} from './ui';

function emptyForm(phase: FuelPhase): FuelFormValues {
	return { phase, item: '', timing: '', outcome: 'good', notes: '' };
}

function FuelEntryForm({
	initial,
	submitLabel,
	onSave,
	onCancel
}: {
	initial: FuelFormValues;
	submitLabel: string;
	onSave: (values: FuelFormValues) => Promise<boolean>;
	onCancel: () => void;
}) {
	const form = useAppForm({
		defaultValues: initial,
		validators: { onSubmit: fuelFormSchema },
		onSubmit: async ({ value }) => {
			await onSave({
				...value,
				item: compactFuelText(value.item, MAX_FUEL_ITEM),
				timing: compactFuelText(value.timing, MAX_FUEL_TIMING),
				notes: value.notes.trim()
			});
		}
	});

	return (
		<Form
			className="mt-3"
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				void form.handleSubmit();
			}}
		>
			<form.AppField
				name="phase"
				children={(field) => <field.ChipField label="When" options={FUEL_PHASE_OPTIONS} />}
			/>
			<form.Subscribe selector={(s) => s.values.phase}>
				{(phase) => (
					<FormGrid>
						<form.AppField
							name="item"
							children={(field) => (
								<field.TextField label="Food or drink" required placeholder={FUEL_PLACEHOLDERS[phase].item} />
							)}
						/>
						<form.AppField
							name="timing"
							children={(field) => (
								<field.TextField
									label="Timing"
									required
									placeholder={FUEL_PLACEHOLDERS[phase].timing}
									hint="Your words — minutes, km, “at the water stations”, “night before”."
								/>
							)}
						/>
					</FormGrid>
				)}
			</form.Subscribe>
			<form.AppField
				name="outcome"
				children={(field) => <field.ChipField label="How it went" options={FUEL_OUTCOME_OPTIONS} />}
			/>
			<form.Subscribe selector={(s) => s.values.phase}>
				{(phase) => (
					<form.AppField
						name="notes"
						children={(field) => (
							<field.TextAreaField label="Notes" rows={2} placeholder={FUEL_PLACEHOLDERS[phase].notes} />
						)}
					/>
				)}
			</form.Subscribe>
			<Actions>
				<Button variant="ghost" onClick={onCancel}>
					Cancel
				</Button>
				<form.AppForm>
					<form.SubmitButton busyLabel="Saving…">
						<Icon name="check" size={16} />
						{submitLabel}
					</form.SubmitButton>
				</form.AppForm>
			</Actions>
		</Form>
	);
}

function tryMeta(entry: FuelEntry, runsBySlug: Record<string, FuelRunRef>) {
	const run = entry.slug ? runsBySlug[entry.slug] : null;
	if (run) {
		return (
			<Link to="/runs/$slug" params={{ slug: entry.slug }} className="text-accent-fg">
				{run.date}
				{run.distance_km != null ? ` · ${run.distance_km} km` : ''}
			</Link>
		);
	}
	return entry.date || null;
}

function FuelGroupRow({
	group,
	runsBySlug,
	authed,
	busy,
	editingId,
	onEdit,
	onCancelEdit,
	onSaveEdit,
	onRemove,
	onRename
}: {
	group: FuelGroup;
	runsBySlug: Record<string, FuelRunRef>;
	authed: boolean;
	busy: boolean;
	editingId: string | null;
	onEdit: (id: string) => void;
	onCancelEdit: () => void;
	onSaveEdit: (entry: FuelEntry, values: FuelFormValues) => Promise<boolean>;
	onRemove: (entry: FuelEntry) => void;
	onRename: (group: FuelGroup) => void;
}) {
	const latest = group.entries[0]!;
	return (
		<details className="group/fuel border-b border-line last:border-b-0">
			<summary className="list-none cursor-pointer [&::-webkit-details-marker]:hidden">
				<div className="flex items-center gap-2 min-h-11 py-1.5">
					<div className="flex-1 min-w-0">
						<div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
							<strong className="font-display text-[1.02rem] tracking-[-0.02em]">{group.item}</strong>
							<span
								className={statusPillClass(
									group.tally.bad > 0 ? 'bg-warn/10 text-warn' : 'bg-accent/15 text-accent-fg'
								)}
							>
								{fuelTallyLabel(group.tally)}
							</span>
						</div>
						<p className={cn('text-muted', 'm-0 mt-1 text-[0.82rem] truncate group-open/fuel:hidden')}>
							{latest.timing || 'timing not noted'}
							{group.entries.length > 1 ? ` · ${group.entries.length} tries` : ''}
						</p>
					</div>
					<span
						className={buttonClass({ variant: 'ghost', size: 'icon', className: 'pointer-events-none' })}
						aria-hidden="true"
					>
						<Icon
							name="arrow"
							size={16}
							className="rotate-90 transition-transform duration-150 group-open/fuel:-rotate-90"
						/>
					</span>
				</div>
			</summary>
			<div className="pb-3 pl-1">
				{group.entries.map((entry) =>
					editingId === entry.id ? (
						<FuelEntryForm
							key={entry.id}
							initial={{
								phase: entry.phase,
								item: entry.item,
								timing: entry.timing,
								outcome: entry.outcome,
								notes: entry.notes
							}}
							submitLabel="Save try"
							onCancel={onCancelEdit}
							onSave={(values) => onSaveEdit(entry, values)}
						/>
					) : (
						<FuelTryLine
							key={entry.id}
							entry={entry}
							meta={tryMeta(entry, runsBySlug)}
							actions={
								authed ? (
									<>
										<button
											type="button"
											className={buttonClass({ variant: 'ghost', size: 'sm' })}
											disabled={busy}
											onClick={() => onEdit(entry.id)}
										>
											Edit
										</button>
										<button
											type="button"
											className={buttonClass({ variant: 'danger', size: 'sm' })}
											disabled={busy}
											onClick={() => onRemove(entry)}
										>
											Remove
										</button>
									</>
								) : null
							}
						/>
					)
				)}
				{authed && (
					<button
						type="button"
						className={buttonClass({ variant: 'ghost', size: 'sm', className: 'mt-2' })}
						disabled={busy}
						onClick={() => onRename(group)}
					>
						<Icon name="pencil" size={14} />
						Rename item
					</button>
				)}
			</div>
		</details>
	);
}

const renameSchema = z.object({ name: z.string().trim().min(1, 'Give it a name.') });

function RenameDialog({
	group,
	onClose,
	onRename
}: {
	group: FuelGroup | null;
	onClose: () => void;
	onRename: (group: FuelGroup, name: string) => Promise<boolean>;
}) {
	const form = useAppForm({
		defaultValues: { name: group?.item ?? '' },
		validators: { onSubmit: renameSchema },
		onSubmit: async ({ value }) => {
			if (!group) return;
			const ok = await onRename(group, value.name.trim());
			if (ok) onClose();
		}
	});

	useEffect(() => {
		form.reset({ name: group?.item ?? '' });
	}, [group]);

	return (
		<Dialog open={group != null} title="Rename item" onClose={onClose}>
			<Form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					void form.handleSubmit();
				}}
			>
				<p className={cn('text-muted', 'm-0')}>
					Renames every {group ? FUEL_PHASE_META[group.phase].label.toLowerCase() : ''} try. Use an existing
					name to merge them into one item.
				</p>
				<form.AppField name="name" children={(field) => <field.TextField label="Name" />} />
				<Actions>
					<Button variant="ghost" onClick={onClose}>
						Cancel
					</Button>
					<form.AppForm>
						<form.SubmitButton busyLabel="Saving…">Rename</form.SubmitButton>
					</form.AppForm>
				</Actions>
			</Form>
		</Dialog>
	);
}

function GuidanceForm({
	guidance,
	busy,
	onSave
}: {
	guidance: string;
	busy: boolean;
	onSave: (guidance: string) => Promise<boolean>;
}) {
	const form = useAppForm({
		defaultValues: { guidance },
		onSubmit: async ({ value }) => {
			await onSave(value.guidance.trim().slice(0, MAX_FUEL_GUIDANCE));
		}
	});

	useEffect(() => {
		form.reset({ guidance });
	}, [guidance]);

	return (
		<Form
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				void form.handleSubmit();
			}}
		>
			<form.AppField
				name="guidance"
				children={(field) => (
					<field.TextAreaField
						label="General guidance"
						rows={4}
						disabled={busy}
						placeholder="Over 90 min: 30–45 g carbs per hour. Hot weather: drink earlier in the day."
					/>
				)}
			/>
			<form.Subscribe selector={(s) => s.values.guidance}>
				{(value) =>
					value !== guidance ? (
						<Actions>
							<form.AppForm>
								<form.SubmitButton variant="ghost">Save guidance</form.SubmitButton>
							</form.AppForm>
						</Actions>
					) : null
				}
			</form.Subscribe>
		</Form>
	);
}

export function FuelLog({
	initial,
	runsBySlug,
	promptTemplate,
	authed
}: {
	initial: FuelLogData;
	runsBySlug: Record<string, FuelRunRef>;
	promptTemplate: string;
	authed: boolean;
}) {
	const router = useRouter();
	const snack = useSnackbar();
	const [log, setLog] = useState(initial);
	const [busy, setBusy] = useState(false);
	const [adding, setAdding] = useState<FuelPhase | null>(null);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [remove, setRemove] = useState<FuelEntry | null>(null);
	const [rename, setRename] = useState<FuelGroup | null>(null);

	useEffect(() => {
		setLog(initial);
	}, [initial]);

	async function persist(next: FuelLogData, okMessage: string): Promise<boolean> {
		setBusy(true);
		try {
			const saved = await saveFuelLog({ data: next });
			setLog(saved);
			snack.success(okMessage);
			router.invalidate();
			return true;
		} catch (err) {
			snack.error(errorMessage(err, 'Save failed'));
			return false;
		} finally {
			setBusy(false);
		}
	}

	async function addEntry(values: FuelFormValues): Promise<boolean> {
		const entry: FuelEntry = { id: newFuelId(), date: '', slug: '', ...values };
		const ok = await persist({ ...log, entries: [...log.entries, entry] }, `Added ${entry.item}`);
		if (ok) setAdding(null);
		return ok;
	}

	async function saveEdit(entry: FuelEntry, values: FuelFormValues): Promise<boolean> {
		const ok = await persist(
			{ ...log, entries: log.entries.map((e) => (e.id === entry.id ? { ...e, ...values } : e)) },
			`Saved ${values.item}`
		);
		if (ok) setEditingId(null);
		return ok;
	}

	async function renameGroup(group: FuelGroup, name: string): Promise<boolean> {
		setBusy(true);
		try {
			const saved = await renameFuelItem({ data: { phase: group.phase, from: group.item, to: name } });
			setLog(saved);
			snack.success(`Renamed to ${name}`);
			router.invalidate();
			return true;
		} catch (err) {
			snack.error(errorMessage(err, 'Rename failed'));
			return false;
		} finally {
			setBusy(false);
		}
	}

	const groups = groupFuelLog(log);

	return (
		<>
			{authed && (
				<FuelDescribePanel
					log={log}
					promptTemplate={promptTemplate}
					onSaved={(saved) => setLog(saved)}
				/>
			)}

			{FUEL_PHASES.map((phase) => (
				<section key={phase} className={panelClass(authed && formClass, 'mb-5')}>
					<div className="flex items-center gap-2">
						<h3 className={cn(formSectionTitleClass, 'flex-1 m-0 mb-0 pb-0 border-b-0')}>
							{FUEL_PHASE_META[phase].title}
						</h3>
						{authed && adding !== phase && (
							<Button variant="ghost" size="sm" disabled={busy} onClick={() => setAdding(phase)}>
								<Icon name="plus" size={14} />
								Add
							</Button>
						)}
					</div>
					{groups[phase].length ? (
						<div className="mt-2">
							{groups[phase].map((g) => (
								<FuelGroupRow
									key={g.key}
									group={g}
									runsBySlug={runsBySlug}
									authed={authed}
									busy={busy}
									editingId={editingId}
									onEdit={setEditingId}
									onCancelEdit={() => setEditingId(null)}
									onSaveEdit={saveEdit}
									onRemove={setRemove}
									onRename={setRename}
								/>
							))}
						</div>
					) : (
						<p className={cn('text-muted', 'mt-2 mb-0 text-[0.9rem]')}>
							Nothing logged {phase === 'during' ? 'during runs' : `${phase} runs`} yet.
						</p>
					)}
					{adding === phase && (
						<FuelEntryForm
							initial={emptyForm(phase)}
							submitLabel="Add try"
							onCancel={() => setAdding(null)}
							onSave={addEntry}
						/>
					)}
				</section>
			))}

			<section className={panelClass(authed && formClass, 'mb-5')}>
				<h3 className={cn(formSectionTitleClass, 'm-0 mb-2 pb-0 border-b-0')}>Guidance</h3>
				{authed ? (
					<GuidanceForm
						guidance={log.guidance}
						busy={busy}
						onSave={(guidance) => persist({ ...log, guidance }, 'Saved guidance')}
					/>
				) : log.guidance ? (
					<p className="m-0 whitespace-pre-wrap">{log.guidance}</p>
				) : (
					<p className={cn('text-muted', 'm-0 text-[0.9rem]')}>No general guidance yet.</p>
				)}
			</section>

			<ConfirmDialog
				open={remove != null}
				title="Remove this try?"
				description={
					remove ? `${remove.item} · ${remove.timing || 'timing not noted'} leaves the fuel log.` : undefined
				}
				confirmLabel="Remove"
				onClose={() => setRemove(null)}
				onConfirm={async () => {
					if (!remove) return;
					const ok = await persist(
						{ ...log, entries: log.entries.filter((e) => e.id !== remove.id) },
						`Removed ${remove.item}`
					);
					if (!ok) throw new Error('Save failed');
					setRemove(null);
				}}
			/>
			<RenameDialog group={rename} onClose={() => setRename(null)} onRename={renameGroup} />
		</>
	);
}
