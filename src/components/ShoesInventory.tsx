import { saveShoes } from '$lib/server/functions';
import {
    addShoe,
    removeShoe,
    restoreShoe,
    retireShoe,
    setActiveShoe,
    shoeKey,
    shoeWearLabel,
    unknownLoggedShoes,
    type ShoeContext,
    type ShoeWear
} from '$lib/shoes';
import { cn, ui } from '$lib/ui';
import { useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { ConfirmDialog } from './Dialog';
import { errorMessage, useSnackbar } from './Snackbar';

function PairRow({
	name,
	role,
	wear,
	authed,
	busy,
	onDaily,
	onRetire,
	onRestore,
	onRemove
}: {
	name: string;
	role: 'active' | 'rotation' | 'retired';
	wear: ShoeWear | null;
	authed: boolean;
	busy: boolean;
	onDaily: () => void;
	onRetire: () => void;
	onRestore: () => void;
	onRemove: () => void;
}) {
	const sub = shoeWearLabel(wear);
	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 border-b border-line last:border-b-0">
			<div className="flex-1 min-w-40">
				<div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
					<strong className="font-display text-[1.02rem] tracking-[-0.02em]">{name}</strong>
					{role === 'active' && <span className={cn(ui.statusPill, 'bg-accent/15 text-accent')}>Daily</span>}
					{role === 'retired' && <span className={cn(ui.statusPill, 'text-muted border border-line')}>Retired</span>}
				</div>
				<p className={cn(ui.muted, 'm-0 mt-1 text-[0.82rem]')}>{sub || 'No km logged yet'}</p>
			</div>
			{authed && (
				<div className="flex flex-wrap gap-2">
					{role !== 'active' && (
						<button type="button" className={cn(ui.btnGhost, ui.btnSm)} disabled={busy} onClick={onDaily}>
							Set daily
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

export function ShoesInventory({
	initial,
	wear,
	authed
}: {
	initial: ShoeContext;
	wear: Record<string, ShoeWear>;
	authed: boolean;
}) {
	const router = useRouter();
	const snack = useSnackbar();
	const [shoes, setShoes] = useState(initial);
	const [notes, setNotes] = useState(initial.notes);
	const [newName, setNewName] = useState('');
	const [busy, setBusy] = useState(false);
	const [removeName, setRemoveName] = useState<string | null>(null);

	useEffect(() => {
		setShoes(initial);
		setNotes(initial.notes);
	}, [initial]);

	async function persist(next: ShoeContext, okMessage: string): Promise<boolean> {
		setBusy(true);
		try {
			await saveShoes({ data: next });
			setShoes(next);
			setNotes(next.notes);
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

	const rotationRest = shoes.rotation.filter((n) => shoeKey(n) !== shoeKey(shoes.active));
	const unknown = unknownLoggedShoes(shoes, wear);

	if (!authed) {
		return (
			<div className={cn(ui.panel, 'mb-5')}>
				<h2>Shoes</h2>
				{!shoes.active && !shoes.rotation.length && !shoes.retired.length ? (
					<p className={cn(ui.muted, 'mt-[0.8rem] mb-0')}>No pairs in the inventory yet.</p>
				) : (
					<div className="mt-[0.4rem]">
						{shoes.active ? (
							<PairRow
								name={shoes.active}
								role="active"
								wear={wear[shoeKey(shoes.active)] ?? null}
								authed={false}
								busy={false}
								onDaily={() => {}}
								onRetire={() => {}}
								onRestore={() => {}}
								onRemove={() => {}}
							/>
						) : null}
						{rotationRest.map((n) => (
							<PairRow
								key={shoeKey(n)}
								name={n}
								role="rotation"
								wear={wear[shoeKey(n)] ?? null}
								authed={false}
								busy={false}
								onDaily={() => {}}
								onRetire={() => {}}
								onRestore={() => {}}
								onRemove={() => {}}
							/>
						))}
						{shoes.retired.map((n) => (
							<PairRow
								key={shoeKey(n)}
								name={n}
								role="retired"
								wear={wear[shoeKey(n)] ?? null}
								authed={false}
								busy={false}
								onDaily={() => {}}
								onRetire={() => {}}
								onRestore={() => {}}
								onRemove={() => {}}
							/>
						))}
					</div>
				)}
				{shoes.notes ? <p className={cn(ui.muted, 'mt-3 mb-0')}>{shoes.notes}</p> : null}
			</div>
		);
	}

	return (
		<div className={cn(ui.panel, ui.form, 'mb-5')}>
			<div>
				<h2>Shoes</h2>
				<p className={cn(ui.muted, 'mt-1 mb-0 text-[0.9rem]')}>
					Daily pair is the default when you log or import a run. Mileage is counted from logged
					activities — Strava GPX files do not include gear.
				</p>
			</div>

			<div className="mt-[0.2rem]">
				{shoes.active ? (
					<PairRow
						name={shoes.active}
						role="active"
						wear={wear[shoeKey(shoes.active)] ?? null}
						authed
						busy={busy}
						onDaily={() => {}}
						onRetire={() => persist(retireShoe(shoes, shoes.active), `Retired ${shoes.active}`)}
						onRestore={() => {}}
						onRemove={() => setRemoveName(shoes.active)}
					/>
				) : (
					<p className={cn(ui.muted, 'py-3 mb-0 border-b border-line')}>No daily pair set.</p>
				)}
				{rotationRest.map((n) => (
					<PairRow
						key={shoeKey(n)}
						name={n}
						role="rotation"
						wear={wear[shoeKey(n)] ?? null}
						authed
						busy={busy}
						onDaily={() => persist(setActiveShoe(shoes, n), `${n} is now daily`)}
						onRetire={() => persist(retireShoe(shoes, n), `Retired ${n}`)}
						onRestore={() => {}}
						onRemove={() => setRemoveName(n)}
					/>
				))}
				{shoes.retired.map((n) => (
					<PairRow
						key={shoeKey(n)}
						name={n}
						role="retired"
						wear={wear[shoeKey(n)] ?? null}
						authed
						busy={busy}
						onDaily={() => persist(setActiveShoe(shoes, n), `${n} is now daily`)}
						onRetire={() => {}}
						onRestore={() => persist(restoreShoe(shoes, n), `Restored ${n}`)}
						onRemove={() => setRemoveName(n)}
					/>
				))}
			</div>

			{unknown.length > 0 && (
				<div>
					<h3 className={ui.formSectionTitle}>Seen in logs</h3>
					<p className={cn(ui.muted, 'mt-0 mb-2 text-[0.85rem]')}>
						Logged on activities but not in this inventory.
					</p>
					{unknown.map((w) => (
						<div
							key={shoeKey(w.name)}
							className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 border-b border-line last:border-b-0"
						>
							<div className="flex-1 min-w-40">
								<strong className="font-display text-[1.02rem]">{w.name}</strong>
								<p className={cn(ui.muted, 'm-0 mt-1 text-[0.82rem]')}>{shoeWearLabel(w)}</p>
							</div>
							<button
								type="button"
								className={cn(ui.btnGhost, ui.btnSm)}
								disabled={busy}
								onClick={() => persist(addShoe(shoes, w.name), `Added ${w.name}`)}
							>
								Add to rotation
							</button>
						</div>
					))}
				</div>
			)}

			<div className="flex gap-[0.4rem] items-end">
				<label className={cn(ui.field, 'flex-1 min-w-0')}>
					<span>Add a pair</span>
					<input
						value={newName}
						placeholder="e.g. Saucony Endorphin Speed 4"
						disabled={busy}
						onChange={(e) => setNewName(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault();
								const n = newName.trim();
								if (!n) return;
								void persist(addShoe(shoes, n), `Added ${n}`).then((ok) => {
									if (ok) setNewName('');
								});
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
						if (!n) return;
						void persist(addShoe(shoes, n), `Added ${n}`).then((ok) => {
							if (ok) setNewName('');
						});
					}}
				>
					Add
				</button>
			</div>

			<label className={ui.field}>
				<span>Notes</span>
				<textarea
					rows={3}
					value={notes}
					disabled={busy}
					placeholder="When to use which pair, replacement notes…"
					onChange={(e) => setNotes(e.target.value)}
				/>
			</label>
			<div>
				<button
					type="button"
					className={ui.btnGhost}
					disabled={busy}
					onClick={() => persist({ ...shoes, notes }, 'Saved shoe notes')}
				>
					Save notes
				</button>
			</div>

			<ConfirmDialog
				open={removeName != null}
				title="Remove this pair?"
				description={
					removeName
						? `${removeName} leaves the inventory. Logged activities keep the name; mileage still counts if you add it back.`
						: undefined
				}
				confirmLabel="Remove"
				onClose={() => setRemoveName(null)}
				onConfirm={async () => {
					if (!removeName) return;
					const ok = await persist(removeShoe(shoes, removeName), `Removed ${removeName}`);
					if (!ok) throw new Error('Save failed');
					setRemoveName(null);
				}}
			/>
		</div>
	);
}
