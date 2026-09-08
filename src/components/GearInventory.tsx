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
import { ConfirmDialog } from './Dialog';
import { errorMessage, useSnackbar } from './Snackbar';

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
	const [newName, setNewName] = useState('');
	const [notes, setNotes] = useState(catalog.notes);
	const rotationRest = catalog.rotation.filter((n) => gearKey(n) !== gearKey(catalog.active));
	const unknown = unknownLoggedGear(catalog, wear);

	useEffect(() => {
		setNotes(catalog.notes);
	}, [catalog.notes]);

	function addNamed(n: string) {
		void onPersist(addGear(catalog, n), `Added ${n}`).then((ok) => {
			if (ok) setNewName('');
		});
	}

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
					<div className="flex gap-[0.4rem] items-end mt-4">
						<label className={cn(ui.field, 'flex-1 min-w-0')}>
							<span>{meta.addLabel}</span>
							<input
								value={newName}
								placeholder={meta.addPlaceholder}
								disabled={busy}
								onChange={(e) => setNewName(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === 'Enter') {
										e.preventDefault();
										const n = newName.trim();
										if (n) addNamed(n);
									}
								}}
							/>
						</label>
						<button
							type="button"
							className={cn(ui.btnPrimary, ui.btnSm, 'mb-[0.05rem]')}
							disabled={busy || !newName.trim()}
							onClick={() => {
								const n = newName.trim();
								if (n) addNamed(n);
							}}
						>
							Add
						</button>
					</div>

					<label className={cn(ui.field, 'mt-3')}>
						<span>Notes</span>
						<textarea
							rows={2}
							value={notes}
							disabled={busy}
							placeholder={meta.notesPlaceholder}
							onChange={(e) => setNotes(e.target.value)}
						/>
					</label>
					<div className={ui.actions}>
						<button
							type="button"
							className={ui.btnGhost}
							disabled={busy || notes === catalog.notes}
							onClick={() => void onPersist({ ...catalog, notes }, `Saved ${meta.label.toLowerCase()} notes`)}
						>
							Save notes
						</button>
					</div>
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
