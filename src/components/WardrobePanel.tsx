import { saveWardrobe } from '$lib/server/functions';
import { cn } from '$lib/ui';
import {
	CLOTHING_CATEGORIES,
	CLOTHING_CATEGORY_META,
	CLOTHING_CATEGORY_OPTIONS,
	CLOTHING_FLAG_META,
	CLOTHING_FLAGS,
	clampClothingCount,
	clothingDetailLabel,
	itemsByCategory,
	MAX_CLOTHING_COUNT,
	newClothingId,
	removeClothing,
	upsertClothing,
	wardrobeHasItems,
	type ClothingCategory,
	type ClothingFlag,
	type ClothingItem,
	type Wardrobe
} from '$lib/wardrobe';
import { clothingFormSchema, type ClothingFormValues } from '$lib/wardrobe-schema';
import { useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { ConfirmDialog } from './Dialog';
import { Icon } from './Icon';
import { WardrobeAiDialog } from './WardrobeAiDialog';
import { errorMessage, useSnackbar } from './Snackbar';
import { Actions, buttonClass, Form, formClass, formSectionTitleClass, panelClass, useAppForm } from './ui';
import { ui } from './ui/tokens';

function valuesFromItem(item: ClothingItem | null, category: ClothingCategory): ClothingFormValues {
	return {
		category: item?.category ?? category,
		name: item?.name ?? '',
		count: item?.count ?? 1,
		min_c: item?.min_c ?? null,
		max_c: item?.max_c ?? null,
		flags: item?.flags ?? [],
		notes: item?.notes ?? ''
	};
}

function ClothingForm({
	item,
	category,
	busy,
	submitLabel,
	onSubmit,
	onCancel
}: {
	item: ClothingItem | null;
	category: ClothingCategory;
	busy: boolean;
	submitLabel: string;
	onSubmit: (item: ClothingItem) => Promise<boolean>;
	onCancel?: () => void;
}) {
	const form = useAppForm({
		defaultValues: valuesFromItem(item, category),
		validators: { onSubmit: clothingFormSchema },
		onSubmit: async ({ value }) => {
			const ok = await onSubmit({
				id: item?.id ?? newClothingId(),
				category: value.category,
				name: value.name.trim(),
				count: clampClothingCount(value.count),
				min_c: value.min_c,
				max_c: value.max_c,
				flags: value.flags,
				notes: value.notes.trim()
			});
			if (ok && !item) form.reset(valuesFromItem(null, value.category));
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
			<div className="grid grid-cols-1 sm:grid-cols-[10rem_1fr_5rem] gap-3">
				<form.AppField
					name="category"
					children={(field) => <field.SelectField label="Category" options={CLOTHING_CATEGORY_OPTIONS} />}
				/>
				<form.Subscribe selector={(s) => s.values.category}>
					{(cat) => (
						<form.AppField
							name="name"
							children={(field) => (
								<field.TextField
									label="Name"
									placeholder={CLOTHING_CATEGORY_META[cat].placeholder}
									disabled={busy}
								/>
							)}
						/>
					)}
				</form.Subscribe>
				<form.AppField
					name="count"
					children={(field) => (
						<field.NumberField
							label="How many"
							inputMode="numeric"
							min={1}
							max={MAX_CLOTHING_COUNT}
							step={1}
							disabled={busy}
						/>
					)}
				/>
			</div>
			<div className="grid grid-cols-2 gap-3 mt-3 sm:max-w-80">
				<form.AppField
					name="min_c"
					children={(field) => (
						<field.NumberField label="From °C" min={-40} max={50} step={1} placeholder="e.g. 8" disabled={busy} />
					)}
				/>
				<form.AppField
					name="max_c"
					children={(field) => (
						<field.NumberField label="Up to °C" min={-40} max={50} step={1} placeholder="e.g. 18" disabled={busy} />
					)}
				/>
			</div>
			<form.Field
				name="flags"
				children={(field) => (
					<div className={cn(ui.choiceChips, 'mt-3')} role="group" aria-label="Good for">
						{CLOTHING_FLAGS.map((flag: ClothingFlag) => {
							const on = field.state.value.includes(flag);
							return (
								<button
									key={flag}
									type="button"
									className={ui.choiceChip}
									aria-pressed={on}
									disabled={busy}
									onClick={() =>
										field.handleChange(
											on ? field.state.value.filter((f) => f !== flag) : [...field.state.value, flag]
										)
									}
								>
									{CLOTHING_FLAG_META[flag].label}
								</button>
							);
						})}
					</div>
				)}
			/>
			<form.AppField
				name="notes"
				children={(field) => (
					<field.TextField
						label="Note on this item"
						placeholder="e.g. rides up after 15 km"
						disabled={busy}
						className="mt-3"
					/>
				)}
			/>
			<Actions>
				<form.AppForm>
					<form.SubmitButton>{submitLabel}</form.SubmitButton>
				</form.AppForm>
				{onCancel && (
					<button type="button" className={buttonClass({ variant: 'ghost' })} disabled={busy} onClick={onCancel}>
						Cancel
					</button>
				)}
			</Actions>
		</Form>
	);
}

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
						disabled={busy || item.count >= MAX_CLOTHING_COUNT}
						aria-label={`One more ${item.name}`}
						onClick={() => onCount(item.count + 1)}
					>
						+
					</button>
					<button type="button" className={buttonClass({ variant: 'ghost', size: 'sm' })} disabled={busy} onClick={onEdit}>
						Edit
					</button>
					<button type="button" className={buttonClass({ variant: 'danger', size: 'sm' })} disabled={busy} onClick={onRemove}>
						Remove
					</button>
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

export function WardrobePanel({ initial, authed }: { initial: Wardrobe; authed: boolean }) {
	const router = useRouter();
	const snack = useSnackbar();
	const [wardrobe, setWardrobe] = useState(initial);
	const [busy, setBusy] = useState(false);
	const [editing, setEditing] = useState<string | null>(null);
	const [remove, setRemove] = useState<ClothingItem | null>(null);
	const [asking, setAsking] = useState(false);

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

	const grouped = itemsByCategory(wardrobe);
	const empty = !wardrobeHasItems(wardrobe);

	return (
		<div className={panelClass(authed && formClass, 'mb-5')}>
			<div className="flex items-center gap-2">
				<h3 className={cn(formSectionTitleClass, 'm-0 mb-0 pb-0 border-b-0 flex-1')}>Clothing</h3>
				{authed && (
					<button
						type="button"
						className={buttonClass({ variant: 'ghost', size: 'sm' })}
						disabled={busy}
						onClick={() => setAsking(true)}
					>
						<Icon name="sparkle" size={16} />
						Ask AI
					</button>
				)}
			</div>
			<p className={cn('text-muted', 'mt-0 mb-0 text-[0.9rem]')}>
				{empty && !authed
					? 'No clothing yet.'
					: 'What you own, not what you wore. The coach brief uses it with the week’s forecast to suggest kit per session.'}
			</p>

			{CLOTHING_CATEGORIES.filter((c) => grouped[c].length).map((c) => (
				<div key={c} className="mt-5">
					<p className={cn('text-muted', 'm-0 mb-1 text-[0.8rem] font-display uppercase tracking-[0.08em]')}>
						{CLOTHING_CATEGORY_META[c].title}
					</p>
					{grouped[c].map((item) =>
						editing === item.id ? (
							<div key={item.id} className="py-3 border-b border-line">
								<ClothingForm
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
									void persist(upsertClothing(wardrobe, { ...item, count }), `${item.name} ×${count}`)
								}
								onEdit={() => setEditing(item.id)}
								onRemove={() => setRemove(item)}
							/>
						)
					)}
				</div>
			))}

			{authed && (
				<>
					<p className={cn('text-muted', 'mt-6 mb-0 text-[0.8rem] font-display uppercase tracking-[0.08em]')}>
						Add clothing
					</p>
					<ClothingForm
						item={null}
						category="top"
						busy={busy}
						submitLabel="Add"
						onSubmit={(item) => persist(upsertClothing(wardrobe, item), `Added ${item.name}`)}
					/>
					<WardrobeNotesForm
						notes={wardrobe.notes}
						busy={busy}
						onSave={(notes) => persist({ ...wardrobe, notes }, 'Saved clothing notes')}
					/>
				</>
			)}

			{!authed && wardrobe.notes ? <p className={cn('text-muted', 'mt-3 mb-0')}>{wardrobe.notes}</p> : null}

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
		</div>
	);
}
