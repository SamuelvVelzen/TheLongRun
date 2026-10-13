import { cn } from '$lib/ui';
import {
	CLOTHING_CATEGORY_META,
	CLOTHING_CATEGORY_OPTIONS,
	CLOTHING_FLAG_META,
	CLOTHING_FLAGS,
	clampClothingCount,
	MAX_CLOTHING_COUNT,
	newClothingId,
	type ClothingCategory,
	type ClothingFlag,
	type ClothingItem
} from '$lib/wardrobe';
import { clothingFormSchema, type ClothingFormValues } from '$lib/wardrobe-schema';
import { Actions, Form, useAppForm } from './ui';
import { buttonClass } from './ui/Button';
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

export function ClothingForm({
	item,
	category,
	busy,
	submitLabel,
	className,
	onSubmit,
	onCancel
}: {
	item: ClothingItem | null;
	category: ClothingCategory;
	busy: boolean;
	submitLabel: string;
	className?: string;
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
			className={className}
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				void form.handleSubmit();
			}}
		>
			<div className="grid grid-cols-1 sm:grid-cols-[10rem_1fr_5rem] gap-3">
				<form.AppField
					name="category"
					children={(field) => (
						<field.SelectField label="Category" options={CLOTHING_CATEGORY_OPTIONS} />
					)}
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
						<field.NumberField
							label="From °C"
							min={-40}
							max={50}
							step={1}
							placeholder="e.g. 8"
							disabled={busy}
						/>
					)}
				/>
				<form.AppField
					name="max_c"
					children={(field) => (
						<field.NumberField
							label="Up to °C"
							min={-40}
							max={50}
							step={1}
							placeholder="e.g. 18"
							disabled={busy}
						/>
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
											on
												? field.state.value.filter((f) => f !== flag)
												: [...field.state.value, flag]
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
					<button
						type="button"
						className={buttonClass({ variant: 'ghost' })}
						disabled={busy}
						onClick={onCancel}
					>
						Cancel
					</button>
				)}
			</Actions>
		</Form>
	);
}
