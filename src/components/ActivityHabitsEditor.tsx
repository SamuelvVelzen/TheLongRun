import { activityLabel, type ActivityType } from '$lib/activity';
import {
    compactHabitText,
    HABIT_PLACEHOLDERS,
    type HabitPair
} from '$lib/activity-habits';
import { cn } from '$lib/ui';
import { useEffect } from 'react';
import { Icon } from './Icon';
import { errorMessage, useSnackbar } from './Snackbar';
import { Actions, Form, FormGrid, useAppForm } from './ui';

export function SportHabitsForm({
	type,
	pair,
	authed,
	onSave
}: {
	type: ActivityType;
	pair: HabitPair;
	authed: boolean;
	onSave: (pair: HabitPair) => Promise<void>;
}) {
	const snack = useSnackbar();
	const form = useAppForm({
		defaultValues: pair,
		onSubmit: async ({ value }) => {
			try {
				await onSave({
					before: compactHabitText(value.before),
					after: compactHabitText(value.after)
				});
				snack.success(`Saved ${activityLabel(type).toLowerCase()} habits`);
			} catch (err) {
				snack.error(errorMessage(err, 'Save failed'));
			}
		}
	});

	useEffect(() => {
		form.reset(pair);
	}, [pair]);

	const caption = (
		<p className={cn('text-muted', 'm-0 mb-2 text-[0.8rem] font-display uppercase tracking-[0.08em]')}>
			Habits
		</p>
	);

	if (!authed) {
		if (!pair.before && !pair.after) {
			return (
				<div className="mt-3">
					{caption}
					<p className={cn('text-muted', 'mt-0 mb-0 text-[0.9rem]')}>
						No usual before/after notes for this sport.
					</p>
				</div>
			);
		}
		return (
			<div className="mt-3">
				{caption}
				<div className="grid gap-3 min-[721px]:grid-cols-2">
					{pair.before ? (
						<div>
							<p className={cn('text-muted', 'm-0 mb-1 text-[0.82rem]')}>Before</p>
							<p className="m-0 whitespace-pre-wrap">{pair.before}</p>
						</div>
					) : null}
					{pair.after ? (
						<div>
							<p className={cn('text-muted', 'm-0 mb-1 text-[0.82rem]')}>After</p>
							<p className="m-0 whitespace-pre-wrap">{pair.after}</p>
						</div>
					) : null}
				</div>
			</div>
		);
	}

	return (
		<Form
			className="mt-3"
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				void form.handleSubmit();
			}}
		>
			{caption}
			<FormGrid>
				<form.AppField
					name="before"
					children={(field) => (
						<field.TextAreaField
							label="Before"
							rows={3}
							placeholder={HABIT_PLACEHOLDERS[type].before}
						/>
					)}
				/>
				<form.AppField
					name="after"
					children={(field) => (
						<field.TextAreaField
							label="After"
							rows={3}
							placeholder={HABIT_PLACEHOLDERS[type].after}
						/>
					)}
				/>
			</FormGrid>
			<form.Subscribe selector={(s) => s.values}>
				{(values) =>
					compactHabitText(values.before) !== pair.before ||
					compactHabitText(values.after) !== pair.after ? (
						<Actions>
							<form.AppForm>
								<form.SubmitButton busyLabel="Saving…">
									<Icon name="check" size={16} />
									Save habits
								</form.SubmitButton>
							</form.AppForm>
						</Actions>
					) : null
				}
			</form.Subscribe>
		</Form>
	);
}
