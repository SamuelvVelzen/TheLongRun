import { medalDetailsSchema, type MedalDetailsValues } from '$lib/goal-form';
import { saveMedalDetails } from '$lib/server/functions';
import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { errorMessage, useSnackbar } from './Snackbar';
import { Actions, Form, FormGrid, useAppForm } from './ui';

export function MedalDetailsForm({
	goalId,
	defaultValues,
	onSaved,
	submitLabel = 'Save details',
	notesLabel = 'Your notes',
	notesPlaceholder = 'How it felt, who you ran with, what you’d do differently…',
	bibPlaceholder = 'e.g. 4821',
	resultPlaceholder = 'https://results.example.com/…',
	showSubmit = 'dirty',
	successMessage = 'Medal details saved.',
	extraActions
}: {
	goalId: string;
	defaultValues: MedalDetailsValues;
	onSaved?: () => void | Promise<void>;
	submitLabel?: string;
	notesLabel?: string;
	notesPlaceholder?: string;
	bibPlaceholder?: string;
	resultPlaceholder?: string;
	showSubmit?: 'dirty' | 'always';
	successMessage?: string;
	extraActions?: ReactNode;
}) {
	const snack = useSnackbar();
	const form = useAppForm({
		defaultValues,
		validators: { onSubmit: medalDetailsSchema },
		onSubmit: async ({ value }) => {
			try {
				await saveMedalDetails({
					data: {
						goalId,
						bib_number: value.bib_number,
						result_url: value.result_url,
						medal_notes: value.medal_notes
					}
				});
				snack.success(successMessage);
				form.reset(value);
				await onSaved?.();
			} catch (e) {
				snack.error(errorMessage(e, 'Could not save medal details.'));
			}
		}
	});

	const submit = (
		<Actions className="justify-start!">
			<form.AppForm>
				<form.SubmitButton busyLabel="Saving…">
					<Icon name="check" size={16} />
					{submitLabel}
				</form.SubmitButton>
			</form.AppForm>
			{extraActions}
		</Actions>
	);

	return (
		<Form
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				void form.handleSubmit();
			}}
		>
			<FormGrid>
				<form.AppField
					name="bib_number"
					children={(field) => (
						<field.TextField label="Bib number" placeholder={bibPlaceholder} inputMode="numeric" />
					)}
				/>
				<form.AppField
					name="result_url"
					children={(field) => (
						<field.TextField
							label="Results URL"
							placeholder={resultPlaceholder}
							inputMode="url"
							autoComplete="url"
						/>
					)}
				/>
			</FormGrid>
			<form.AppField
				name="medal_notes"
				children={(field) => (
					<field.TextAreaField label={notesLabel} rows={4} placeholder={notesPlaceholder} />
				)}
			/>
			{showSubmit === 'always' ? (
				submit
			) : (
				<form.Subscribe selector={(s) => s.values}>
					{(values) => {
						const dirty =
							values.bib_number !== defaultValues.bib_number ||
							values.result_url !== defaultValues.result_url ||
							values.medal_notes !== defaultValues.medal_notes;
						return dirty ? submit : extraActions ? <Actions className="justify-start!">{extraActions}</Actions> : null;
					}}
				</form.Subscribe>
			)}
		</Form>
	);
}
