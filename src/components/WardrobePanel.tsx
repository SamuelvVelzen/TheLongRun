import { formatGearCompact, type GearContext } from '$lib/gear';
import { saveWardrobe } from '$lib/server/functions';
import { cn } from '$lib/ui';
import {
	CLOTHING_CATEGORIES,
	CLOTHING_CATEGORY_META,
	clothingDetailLabel,
	formatWardrobeCompact,
	itemsByCategory,
	removeClothing,
	upsertClothing,
	wardrobeHasItems,
	type ClothingItem,
	type Wardrobe
} from '$lib/wardrobe';
import { useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { DeleteButton, EditButton, TrashIcon } from './DeleteButton';
import { Icon } from './Icon';
import { MoreMenu } from './MoreMenu';
import { WardrobeAddDialog } from './WardrobeAddDialog';
import { WardrobeAiDialog } from './WardrobeAiDialog';
import { ClothingForm } from './WardrobeClothingForm';
import {
	Actions,
	ConfirmDialog,
	Form,
	IconLabelButton,
	Panel,
	PanelTitle,
	errorMessage,
	useAppForm,
	useSnackbar
} from './ui';
import { buttonClass } from './ui/Button';

function ClothingRow({
	item,
	authed,
	busy,
	onCount,
	onEdit,
	onRemove
}: {
	item: ClothingItem;
	authed: boolean;
	busy: boolean;
	onCount: (count: number) => void;
	onEdit: () => void;
	onRemove: () => void;
}) {
	const detail = clothingDetailLabel(item);
	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 border-b border-line last:border-b-0">
			<div className="flex-1 min-w-40">
				<div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
					<strong className="font-display text-[1.02rem] tracking-[-0.02em]">{item.name}</strong>
					<span className="text-muted text-[0.9rem] tabular-nums">×{item.count}</span>
				</div>
				{detail && <p className={cn('text-muted', 'm-0 mt-1 text-[0.82rem]')}>{detail}</p>}
			</div>
			{authed && (
				<div className="flex flex-wrap gap-2">
					<button
						type="button"
						className={buttonClass({ variant: 'ghost', size: 'sm' })}
						disabled={busy || item.count <= 1}
						aria-label={`One fewer ${item.name}`}
						onClick={() => onCount(item.count - 1)}
					>
						−
					</button>
					<button
						type="button"
						className={buttonClass({ variant: 'ghost', size: 'sm' })}
						disabled={busy}
						aria-label={`One more ${item.name}`}
						onClick={() => onCount(item.count + 1)}
					>
						+
					</button>
					<EditButton
						compact
						disabled={busy}
						label={`Edit ${item.name}`}
						onClick={onEdit}
					/>
					<MoreMenu
						compact
						label={`More for ${item.name}`}
						items={[
							{
								label: 'Remove',
								icon: <TrashIcon className="size-4" />,
								onClick: onRemove,
								danger: true,
								disabled: busy
							}
						]}
					/>
				</div>
			)}
		</div>
	);
}

function WardrobeNotesForm({
	notes,
	busy,
	onSave
}: {
	notes: string;
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
			className="mt-5"
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				void form.handleSubmit();
			}}
		>
			<form.AppField
				name="notes"
				children={(field) => (
					<field.TextAreaField
						label="How you dress"
						rows={2}
						disabled={busy}
						placeholder="e.g. I run cold, start chilly, gloves below 5°C…"
					/>
				)}
			/>
			<form.Subscribe selector={(s) => s.values.notes}>
				{(value) =>
					value !== notes ? (
						<Actions>
							<form.AppForm>
								<form.SubmitButton variant="ghost">Save</form.SubmitButton>
							</form.AppForm>
						</Actions>
					) : null
				}
			</form.Subscribe>
		</Form>
	);
}

export function WardrobePanel({
	initial,
	gear,
	authed
}: {
	initial: Wardrobe;
	gear: GearContext;
	authed: boolean;
}) {
	const router = useRouter();
	const snack = useSnackbar();
	const [wardrobe, setWardrobe] = useState(initial);
	const [busy, setBusy] = useState(false);
	const [editing, setEditing] = useState<string | null>(null);
	const [remove, setRemove] = useState<ClothingItem | null>(null);
	const [asking, setAsking] = useState(false);
	const [adding, setAdding] = useState(false);
	const [kitCopied, setKitCopied] = useState(false);

	useEffect(() => {
		setWardrobe(initial);
	}, [initial]);

	async function persist(next: Wardrobe, okMessage: string): Promise<boolean> {
		setBusy(true);
		try {
			const saved = await saveWardrobe({ data: next });
			setWardrobe(saved);
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

	async function copyKitForAi() {
		const text = [formatGearCompact(gear), formatWardrobeCompact(wardrobe)]
			.filter(Boolean)
			.join('\n\n');
		if (!text) {
			snack.info('Nothing to copy yet — add gear or clothing first.');
			return;
		}
		try {
			await navigator.clipboard.writeText(text);
			setKitCopied(true);
			snack.success('Copied kit summary for AI.');
			window.setTimeout(() => setKitCopied(false), 1800);
		} catch {
			snack.error('Could not copy.');
		}
	}

	const grouped = itemsByCategory(wardrobe);
	const empty = !wardrobeHasItems(wardrobe);

	return (
		<Panel form={authed} className="mb-5">
			<div className="flex flex-wrap items-center gap-2">
				<PanelTitle className="m-0 mb-0 pb-0 border-b-0 flex-1 min-w-[8rem]">Clothing</PanelTitle>
				{authed && (
					<div className="flex flex-wrap gap-2 justify-end">
						<IconLabelButton
							label="Add clothing"
							disabled={busy}
							icon={<Icon name="plus" size={16} />}
							onClick={() => setAdding(true)}
						/>
						<IconLabelButton
							label="Copy kit for AI"
							disabled={busy}
							icon={<Icon name={kitCopied ? 'check' : 'copy'} size={16} />}
							onClick={() => void copyKitForAi()}
						/>
						<IconLabelButton
							label="Import with AI"
							disabled={busy}
							icon={<Icon name="sparkle" size={16} />}
							onClick={() => setAsking(true)}
						/>
					</div>
				)}
			</div>
			<p className={cn('text-muted', 'mt-0 mb-0 text-[0.9rem]')}>
				{empty && !authed
					? 'No clothing yet.'
					: 'What you own, not what you wore. The coach brief uses it with the week’s forecast to suggest kit per session.'}
			</p>

			{CLOTHING_CATEGORIES.filter((c) => grouped[c].length).map((c) => (
				<div key={c} className="mt-5">
					<p
						className={cn(
							'text-muted',
							'm-0 mb-1 text-[0.8rem] font-display uppercase tracking-[0.08em]'
						)}
					>
						{CLOTHING_CATEGORY_META[c].title}
					</p>
					{grouped[c].map((item) =>
						editing === item.id ? (
							<div key={item.id} className="py-3 border-b border-line">
								<ClothingForm
									className="mt-0"
									item={item}
									category={item.category}
									busy={busy}
									submitLabel="Save"
									onCancel={() => setEditing(null)}
									onSubmit={async (next) => {
										const ok = await persist(upsertClothing(wardrobe, next), `Saved ${next.name}`);
										if (ok) setEditing(null);
										return ok;
									}}
								/>
							</div>
						) : (
							<ClothingRow
								key={item.id}
								item={item}
								authed={authed}
								busy={busy}
								onCount={(count) =>
									void persist(
										upsertClothing(wardrobe, { ...item, count }),
										`${item.name} ×${count}`
									)
								}
								onEdit={() => setEditing(item.id)}
								onRemove={() => setRemove(item)}
							/>
						)
					)}
				</div>
			))}

			{authed && (
				<WardrobeNotesForm
					notes={wardrobe.notes}
					busy={busy}
					onSave={(notes) => persist({ ...wardrobe, notes }, 'Saved clothing notes')}
				/>
			)}

			{!authed && wardrobe.notes ? (
				<p className={cn('text-muted', 'mt-3 mb-0')}>{wardrobe.notes}</p>
			) : null}

			<WardrobeAddDialog
				open={adding}
				busy={busy}
				onClose={() => setAdding(false)}
				onAdd={(item) => persist(upsertClothing(wardrobe, item), `Added ${item.name}`)}
			/>

			<WardrobeAiDialog
				open={asking}
				wardrobe={wardrobe}
				busy={busy}
				onClose={() => setAsking(false)}
				onSave={persist}
			/>

			<ConfirmDialog
				open={remove != null}
				title="Remove this item?"
				description={remove ? `${remove.name} leaves your clothing list.` : undefined}
				confirmLabel="Remove"
				onClose={() => setRemove(null)}
				onConfirm={async () => {
					if (!remove) return;
					const ok = await persist(removeClothing(wardrobe, remove.id), `Removed ${remove.name}`);
					if (!ok) throw new Error('Save failed');
					setRemove(null);
				}}
			/>
		</Panel>
	);
}
