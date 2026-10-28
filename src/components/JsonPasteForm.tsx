import { formatAiJsonText } from '$lib/ai-json';
import { z } from 'zod';
import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { Actions, Button, Form, errorMessage, useAppForm, useSnackbar } from './ui';

const jsonPasteSchema = z.object({
	json: z.string().trim().min(1, 'Paste the AI response first.')
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
					<field.TextAreaField
						label="AI response"
						labelAction={
							<Button
								type="button"
								variant="ghost"
								size="sm"
								disabled={!field.state.value.trim()}
								onClick={() => {
									try {
										field.handleChange(formatAiJsonText(field.state.value));
									} catch (e) {
										snack.error(errorMessage(e, 'Could not format that response.'));
									}
								}}
							>
								Prettify
							</Button>
						}
						variant="editor"
						rows={rows}
						placeholder={placeholder}
					/>
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
