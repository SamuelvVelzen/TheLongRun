import { ACTIVITY_TYPES, activityLabel, type ActivityType } from '$lib/activity';
import { habitsHaveText, type ActivityHabits, type HabitPair } from '$lib/activity-habits';
import {
    addGear,
    catalogHasItems,
    GEAR_KINDS,
    gearKey,
    gearKindForActivity,
    gearMeta,
    gearWearLabel,
    removeGear,
    restoreGear,
    retireGear,
    setActiveGear,
    unknownLoggedGear,
    type GearCatalog,
    type GearContext,
    type GearKind,
    type GearWear
} from '$lib/gear';
import { saveActivityHabits, saveGear } from '$lib/server/functions';
import { cn } from '$lib/ui';
import { useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { SportHabitsForm } from './ActivityHabitsEditor';
import { ConfirmDialog } from './Dialog';
import { sportChipLabel } from './Icon';
import { errorMessage, useSnackbar } from './Snackbar';
import { Actions, buttonClass, Form, formClass, formSectionTitleClass, panelClass, statusPillClass, useAppForm } from './ui';

/** Kit shown under this sport — walk shares Run's shoes, strength has none. */
function kitKindForSection(type: ActivityType): GearKind | null {
	if (type === 'walk' || type === 'strength') return null;
	return gearKindForActivity(type);
}

function ItemRow({
	name,
	role,
	wear,
	kind,
	authed,
	busy,
	activeLabel,
	setActiveLabel,
	onSetActive,
	onRetire,
	onRestore,
	onRemove
}: {
	name: string;
	role: 'active' | 'rotation' | 'retired';
	wear: GearWear | null;
	kind: GearKind;
	authed: boolean;
	busy: boolean;
	activeLabel: string;
	setActiveLabel: string;
	onSetActive: () => void;
	onRetire: () => void;
	onRestore: () => void;
	onRemove: () => void;
}) {
	const sub = gearWearLabel(wear, kind);
	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 border-b border-line last:border-b-0">
			<div className="flex-1 min-w-40">
				<div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
					<strong className="font-display text-[1.02rem] tracking-[-0.02em]">{name}</strong>
					{role === 'active' && (
						<span className={statusPillClass('bg-accent/15 text-accent-fg')}>{activeLabel}</span>
					)}
					{role === 'retired' && (
						<span className={statusPillClass('text-muted border border-line')}>Retired</span>
					)}
				</div>
				<p className={cn('text-muted', 'm-0 mt-1 text-[0.82rem]')}>{sub || 'No km logged yet'}</p>
			</div>
			{authed && (
				<div className="flex flex-wrap gap-2">
					{role !== 'active' && (
						<button type="button" className={buttonClass({ variant: 'ghost', size: 'sm' })} disabled={busy} onClick={onSetActive}>
							{setActiveLabel}
						</button>
					)}
					{role !== 'retired' ? (
						<button type="button" className={buttonClass({ variant: 'ghost', size: 'sm' })} disabled={busy} onClick={onRetire}>
							Retire
						</button>
					) : (
						<button type="button" className={buttonClass({ variant: 'ghost', size: 'sm' })} disabled={busy} onClick={onRestore}>
							Restore
						</button>
					)}
					<button
						type="button"
						className={buttonClass({ variant: 'danger', size: 'sm' })}
						disabled={busy}
						onClick={onRemove}
					>
						Remove
					</button>
				</div>
			)}
		</div>
	);
}

function KindSection({
	kind,
	catalog,
	wear,
	authed,
	busy,
	onPersist,
	onRemove
}: {
	kind: GearKind;
	catalog: GearCatalog;
	wear: Record<string, GearWear>;
	authed: boolean;
	busy: boolean;
	onPersist: (next: GearCatalog, okMessage: string) => Promise<boolean>;
	onRemove: (name: string) => void;
}) {
	const meta = gearMeta(kind);
	const rotationRest = catalog.rotation.filter((n) => gearKey(n) !== gearKey(catalog.active));
	const unknown = unknownLoggedGear(catalog, wear);

	return (
		<div>
			<p className={cn('text-muted', 'm-0 mb-2 text-[0.8rem] font-display uppercase tracking-[0.08em]')}>
				{meta.label}
			</p>

			<div>
				{catalog.active ? (
					<ItemRow
						name={catalog.active}
						role="active"
						wear={wear[gearKey(catalog.active)] ?? null}
						kind={kind}
						authed={authed}
						busy={busy}
						activeLabel={meta.activeLabel}
						setActiveLabel={meta.setActiveLabel}
						onSetActive={() => {}}
						onRetire={() =>
							void onPersist(retireGear(catalog, catalog.active), `Retired ${catalog.active}`)
						}
						onRestore={() => {}}
						onRemove={() => onRemove(catalog.active)}
					/>
				) : (
					<p className={cn('text-muted', 'py-3 mb-0 border-b border-line')}>{meta.emptyLabel}</p>
				)}
				{rotationRest.map((n) => (
					<ItemRow
						key={gearKey(n)}
						name={n}
						role="rotation"
						wear={wear[gearKey(n)] ?? null}
						kind={kind}
						authed={authed}
						busy={busy}
						activeLabel={meta.activeLabel}
						setActiveLabel={meta.setActiveLabel}
						onSetActive={() =>
							void onPersist(setActiveGear(catalog, n), `${n} is now ${meta.activeLabel.toLowerCase()}`)
						}
						onRetire={() => void onPersist(retireGear(catalog, n), `Retired ${n}`)}
						onRestore={() => {}}
						onRemove={() => onRemove(n)}
					/>
				))}
				{catalog.retired.map((n) => (
					<ItemRow
						key={gearKey(n)}
						name={n}
						role="retired"
						wear={wear[gearKey(n)] ?? null}
						kind={kind}
						authed={authed}
						busy={busy}
						activeLabel={meta.activeLabel}
						setActiveLabel={meta.setActiveLabel}
						onSetActive={() =>
							void onPersist(setActiveGear(catalog, n), `${n} is now ${meta.activeLabel.toLowerCase()}`)
						}
						onRetire={() => {}}
						onRestore={() => void onPersist(restoreGear(catalog, n), `Restored ${n}`)}
						onRemove={() => onRemove(n)}
					/>
				))}
			</div>

			{authed && unknown.length > 0 && (
				<div className="mt-3">
					<p className={cn('text-muted', 'mt-0 mb-2 text-[0.85rem]')}>
						Logged on activities but not in this inventory.
					</p>
					{unknown.map((w) => (
						<div
							key={gearKey(w.name)}
							className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 border-b border-line last:border-b-0"
						>
							<div className="flex-1 min-w-40">
								<strong className="font-display text-[1.02rem]">{w.name}</strong>
								<p className={cn('text-muted', 'm-0 mt-1 text-[0.82rem]')}>{gearWearLabel(w, kind)}</p>
							</div>
							<button
								type="button"
								className={buttonClass({ variant: 'ghost', size: 'sm' })}
								disabled={busy}
								onClick={() => void onPersist(addGear(catalog, w.name), `Added ${w.name}`)}
							>
								Add to rotation
							</button>
						</div>
					))}
				</div>
			)}

			{authed && (
				<>
					<AddGearForm
						addLabel={meta.addLabel}
						placeholder={meta.addPlaceholder}
						busy={busy}
						onAdd={(n) => onPersist(addGear(catalog, n), `Added ${n}`)}
					/>
					<GearNotesForm
						notes={catalog.notes}
						placeholder={meta.notesPlaceholder}
						busy={busy}
						onSave={(next) => onPersist({ ...catalog, notes: next }, `Saved ${meta.label.toLowerCase()} notes`)}
					/>
				</>
			)}

			{!authed && catalog.notes ? (
				<p className={cn('text-muted', 'mt-3 mb-0')}>{catalog.notes}</p>
			) : null}
		</div>
	);
}

export function GearInventory({
	initial,
	wear,
	habits: initialHabits,
	authed
}: {
	initial: GearContext;
	wear: Record<GearKind, Record<string, GearWear>>;
	habits: ActivityHabits;
	authed: boolean;
}) {
	const router = useRouter();
	const snack = useSnackbar();
	const [gear, setGear] = useState(initial);
	const [habits, setHabits] = useState(initialHabits);
	const [busy, setBusy] = useState(false);
	const [remove, setRemove] = useState<{ kind: GearKind; name: string } | null>(null);

	useEffect(() => {
		setGear(initial);
	}, [initial]);

	useEffect(() => {
		setHabits(initialHabits);
	}, [initialHabits]);

	async function persist(next: GearContext, okMessage: string): Promise<boolean> {
		setBusy(true);
		try {
			await saveGear({ data: next });
			setGear(next);
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

	async function persistHabits(type: ActivityType, pair: HabitPair) {
		const saved = await saveActivityHabits({ data: { ...habits, [type]: pair } });
		setHabits(saved);
		await router.invalidate();
	}

	const emptyKit = GEAR_KINDS.every((k) => !catalogHasItems(gear[k]));
	const empty = emptyKit && !habitsHaveText(habits);

	return (
		<div className={panelClass(authed && formClass, 'mb-5')}>
			<div>
				<p className={cn('text-muted', 'mt-0 mb-0 text-[0.9rem]')}>
					{empty && !authed
						? 'No kit or habits yet.'
						: 'Default kit is used when you log or import that sport. Before/after notes fill in on a new activity — change them that day when the ritual was different. Mileage is counted from logged activities — Strava GPX files do not include gear.'}
				</p>
			</div>

			{ACTIVITY_TYPES.map((type) => {
				const kind = kitKindForSection(type);
				return (
					<div key={type} className="mt-6 first:mt-5">
						<h3 className={cn(formSectionTitleClass, 'flex items-center gap-1.5')}>
							{sportChipLabel(type, activityLabel(type))}
						</h3>
						{type === 'walk' ? (
							<p className={cn('text-muted', 'mt-0 mb-0 text-[0.88rem]')}>
								Walks use the same shoes as Run. Mileage from walks still counts on those pairs.
							</p>
						) : null}
						{kind ? (
							<div className="mt-3">
								<KindSection
									kind={kind}
									catalog={gear[kind]}
									wear={wear[kind]}
									authed={authed}
									busy={busy}
									onPersist={(catalog, message) => persist({ ...gear, [kind]: catalog }, message)}
									onRemove={(name) => setRemove({ kind, name })}
								/>
							</div>
						) : null}
						<SportHabitsForm
							type={type}
							pair={habits[type]}
							authed={authed}
							onSave={(pair) => persistHabits(type, pair)}
						/>
					</div>
				);
			})}

			<ConfirmDialog
				open={remove != null}
				title={`Remove this ${remove ? gearMeta(remove.kind).itemSingular : 'item'}?`}
				description={
					remove
						? `${remove.name} leaves the inventory. Logged activities keep the name; mileage still counts if you add it back.`
						: undefined
				}
				confirmLabel="Remove"
				onClose={() => setRemove(null)}
				onConfirm={async () => {
					if (!remove) return;
					const ok = await persist(
						{ ...gear, [remove.kind]: removeGear(gear[remove.kind], remove.name) },
						`Removed ${remove.name}`
					);
					if (!ok) throw new Error('Save failed');
					setRemove(null);
				}}
			/>
		</div>
	);
}

const addGearSchema = z.object({ name: z.string().trim().min(1) });

function AddGearForm({
	addLabel,
	placeholder,
	busy,
	onAdd
}: {
	addLabel: string;
	placeholder: string;
	busy: boolean;
	onAdd: (name: string) => Promise<boolean>;
}) {
	const form = useAppForm({
		defaultValues: { name: '' },
		validators: { onSubmit: addGearSchema },
		onSubmit: async ({ value }) => {
			const ok = await onAdd(value.name.trim());
			if (ok) form.reset();
		}
	});

	return (
		<form
			className="flex gap-[0.4rem] items-end mt-4"
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				void form.handleSubmit();
			}}
		>
			<form.AppField
				name="name"
				children={(field) => (
					<field.TextField
						label={addLabel}
						placeholder={placeholder}
						disabled={busy}
						className="flex-1 min-w-0"
					/>
				)}
			/>
			<form.AppForm>
				<form.SubmitButton className={buttonClass({ size: 'sm', className: 'mb-[0.05rem]' })}>Add</form.SubmitButton>
			</form.AppForm>
		</form>
	);
}

function GearNotesForm({
	notes,
	placeholder,
	busy,
	onSave
}: {
	notes: string;
	placeholder: string;
	busy: boolean;
	onSave: (notes: string) => Promise<boolean>;
}) {
	const form = useAppForm({
		defaultValues: { notes },
		onSubmit: async ({ value }) => {
			await onSave(value.notes);
		}
	});

	useEffect(() => {
		form.reset({ notes });
	}, [notes]);

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
				name="notes"
				children={(field) => (
					<field.TextAreaField label="Notes" rows={2} disabled={busy} placeholder={placeholder} />
				)}
			/>
			<form.Subscribe selector={(s) => s.values.notes}>
				{(value) =>
					value !== notes ? (
						<Actions>
							<form.AppForm>
								<form.SubmitButton variant="ghost">
									Save notes
								</form.SubmitButton>
							</form.AppForm>
						</Actions>
					) : null
				}
			</form.Subscribe>
		</Form>
	);
}
