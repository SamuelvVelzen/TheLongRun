import {
	compactFuelText,
	FUEL_OUTCOME_OPTIONS,
	FUEL_PHASE_OPTIONS,
	FUEL_PLACEHOLDERS,
	MAX_FUEL_ITEM,
	MAX_FUEL_TIMING,
	type FuelPhase
} from '$lib/fuel';
import { fuelFormSchema, type FuelFormValues } from '$lib/fuel-schema';
import { cn } from '$lib/ui';
import { Icon } from './Icon';
import { Actions, Button, Form, FormGrid, useAppForm } from './ui';

export function emptyFuelForm(phase: FuelPhase): FuelFormValues {
	return { phase, item: '', timing: '', outcome: 'good', notes: '' };
}

export function FuelEntryForm({
	initial,
	submitLabel,
	busy,
	className,
	onSave,
	onCancel
}: {
	initial: FuelFormValues;
	submitLabel: string;
	busy?: boolean;
	className?: string;
	onSave: (values: FuelFormValues) => Promise<boolean>;
	onCancel: () => void;
}) {
	const form = useAppForm({
		defaultValues: initial,
		validators: { onSubmit: fuelFormSchema },
		onSubmit: async ({ value }) => {
			const ok = await onSave({
				...value,
				item: compactFuelText(value.item, MAX_FUEL_ITEM),
				timing: compactFuelText(value.timing, MAX_FUEL_TIMING),
				notes: value.notes.trim()
			});
			if (ok) form.reset(emptyFuelForm(value.phase));
		}
	});

	return (
		<Form
			className={cn('mt-3', className)}
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
								<field.TextField
									label="Food or drink"
									required
									disabled={busy}
									placeholder={FUEL_PLACEHOLDERS[phase].item}
								/>
							)}
						/>
						<form.AppField
							name="timing"
							children={(field) => (
								<field.TextField
									label="Timing"
									required
									disabled={busy}
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
							<field.TextAreaField
								label="Notes"
								rows={2}
								disabled={busy}
								placeholder={FUEL_PLACEHOLDERS[phase].notes}
							/>
						)}
					/>
				)}
			</form.Subscribe>
			<Actions>
				<Button variant="ghost" disabled={busy} onClick={onCancel}>
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
