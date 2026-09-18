import { z } from 'zod';
import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { errorMessage, useSnackbar } from './Snackbar';
import { Actions, Form, useAppForm } from './ui';

const jsonPasteSchema = z.object({
	json: z.string().trim().min(1, 'Paste the JSON first.')
});

export function JsonPasteForm({
	title,
	description,
	placeholder,
	rows = 8,
	submitLabel,
	submitIcon = 'plus',
	errorLabel = 'Could not save.',
	className,
	onSubmit
}: {
	title?: ReactNode;
	description?: ReactNode;
	placeholder?: string;
	rows?: number;
	submitLabel: string;
	submitIcon?: IconName;
	errorLabel?: string;
	className?: string;
	onSubmit: (json: string) => void | Promise<void>;
}) {
	const snack = useSnackbar();
	const form = useAppForm({
		defaultValues: { json: '' },
		validators: { onSubmit: jsonPasteSchema },
		onSubmit: async ({ value }) => {
			try {
				await onSubmit(value.json);
				form.reset();
			} catch (e) {
				snack.error(errorMessage(e, errorLabel));
			}
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
			{title != null ? <h3>{title}</h3> : null}
			{description != null ? description : null}
			<form.AppField
				name="json"
				children={(field) => (
					<field.TextAreaField variant="editor" rows={rows} placeholder={placeholder} />
				)}
			/>
			<Actions>
				<form.AppForm>
					<form.SubmitButton busyLabel="Saving…">
						<Icon name={submitIcon} size={16} />
						{submitLabel}
					</form.SubmitButton>
				</form.AppForm>
			</Actions>
		</Form>
	);
}
