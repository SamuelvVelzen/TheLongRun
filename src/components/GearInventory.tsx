import { saveGear } from '$lib/server/functions';
import {
	addGear,
	catalogHasItems,
	GEAR_KINDS,
	gearKey,
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
import { cn, ui } from '$lib/ui';
import { useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { ConfirmDialog } from './Dialog';
import { errorMessage, useSnackbar } from './Snackbar';
import { Actions, Button, Form, useAppForm } from './ui';

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
						<span className={cn(ui.statusPill, 'bg-accent/15 text-accent-fg')}>{activeLabel}</span>
					)}
					{role === 'retired' && (
						<span className={cn(ui.statusPill, 'text-muted border border-line')}>Retired</span>
					)}
				</div>
				<p className={cn(ui.muted, 'm-0 mt-1 text-[0.82rem]')}>{sub || 'No km logged yet'}</p>
			</div>
			{authed && (
				<div className="flex flex-wrap gap-2">
					{role !== 'active' && (
						<button type="button" className={cn(ui.btnGhost, ui.btnSm)} disabled={busy} onClick={onSetActive}>
							{setActiveLabel}
						</button>
					)}
					{role !== 'retired' ? (
						<button type="button" className={cn(ui.btnGhost, ui.btnSm)} disabled={busy} onClick={onRetire}>
							Retire
						</button>
					) : (
						<button type="button" className={cn(ui.btnGhost, ui.btnSm)} disabled={busy} onClick={onRestore}>
							Restore
						</button>
					)}
					<button
						type="button"
						className={cn(ui.btnGhost, ui.btnDanger, ui.btnSm)}
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
		<div className="mt-5 first:mt-0">
			<h3 className={ui.formSectionTitle}>
				{meta.section} — {meta.label}
			</h3>

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
					<p className={cn(ui.muted, 'py-3 mb-0 border-b border-line')}>{meta.emptyLabel}</p>
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
					<p className={cn(ui.muted, 'mt-0 mb-2 text-[0.85rem]')}>
						Logged on activities but not in this inventory.
					</p>
					{unknown.map((w) => (
						<div
							key={gearKey(w.name)}
							className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 border-b border-line last:border-b-0"
						>
							<div className="flex-1 min-w-40">
								<strong className="font-display text-[1.02rem]">{w.name}</strong>
								<p className={cn(ui.muted, 'm-0 mt-1 text-[0.82rem]')}>{gearWearLabel(w, kind)}</p>
							</div>
							<button
								type="button"
								className={cn(ui.btnGhost, ui.btnSm)}
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
				<p className={cn(ui.muted, 'mt-3 mb-0')}>{catalog.notes}</p>
			) : null}
		</div>
	);
}

export function GearInventory({
	initial,
	wear,
	authed
}: {
	initial: GearContext;
	wear: Record<GearKind, Record<string, GearWear>>;
	authed: boolean;
}) {
	const router = useRouter();
	const snack = useSnackbar();
	const [gear, setGear] = useState(initial);
	const [busy, setBusy] = useState(false);
	const [remove, setRemove] = useState<{ kind: GearKind; name: string } | null>(null);

	useEffect(() => {
		setGear(initial);
	}, [initial]);

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

	const empty = GEAR_KINDS.every((k) => !catalogHasItems(gear[k]));

	return (
		<div className={cn(ui.panel, authed && ui.form, 'mb-5')}>
			<div>
				<h2>Gear</h2>
				<p className={cn(ui.muted, 'mt-1 mb-0 text-[0.9rem]')}>
					{empty && !authed
						? 'No kit in the inventory yet.'
						: 'Default kit is used when you log or import that sport. Mileage is counted from logged activities — Strava GPX files do not include gear.'}
				</p>
			</div>

			{GEAR_KINDS.map((kind) => (
				<KindSection
					key={kind}
					kind={kind}
					catalog={gear[kind]}
					wear={wear[kind]}
					authed={authed}
					busy={busy}
					onPersist={(catalog, message) => persist({ ...gear, [kind]: catalog }, message)}
					onRemove={(name) => setRemove({ kind, name })}
				/>
			))}

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
				<form.SubmitButton className={cn(ui.btnSm, 'mb-[0.05rem]')}>Add</form.SubmitButton>
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
