import {
    ACTIVITY_TYPES,
    activityLabel
} from '$lib/activity';
import {
    HABIT_PLACEHOLDERS,
    normalizeActivityHabits,
    type ActivityHabits
} from '$lib/activity-habits';
import { saveActivityHabits } from '$lib/server/functions';
import { cn } from '$lib/ui';
import { useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Icon, sportChipLabel } from './Icon';
import { errorMessage, useSnackbar } from './Snackbar';
import {
    Actions,
    Form,
    formSectionTitleClass,
    panelClass,
    useAppForm
} from './ui';

export function ActivityHabitsEditor({
	initial,
	authed
}: {
	initial: ActivityHabits;
	authed: boolean;
}) {
	const router = useRouter();
	const snack = useSnackbar();
	const [habits, setHabits] = useState(initial);

	useEffect(() => {
		setHabits(initial);
	}, [initial]);

	const form = useAppForm({
		defaultValues: habits,
		onSubmit: async ({ value }) => {
			try {
				const saved = await saveActivityHabits({ data: value });
				setHabits(saved);
				form.reset(saved);
				snack.success('Saved activity habits');
				await router.invalidate();
			} catch (err) {
				snack.error(errorMessage(err, 'Save failed'));
			}
		}
	});

	useEffect(() => {
		form.reset(habits);
	}, [habits]);

	return (
		<div className={panelClass('mb-5')}>
			<div>
				<h2>Activity habits</h2>
				<p className={cn('text-muted', 'mt-1 mb-0 text-[0.9rem]')}>
					Generic before/after notes for every sport — warmup walks, stretches. Change them on a
					single activity when that day was different. Coach-plan session notes stay specific to
					that day.
				</p>
			</div>

			<Form
				className="mt-4"
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					void form.handleSubmit();
				}}
			>
				{ACTIVITY_TYPES.map((type) => (
					<div key={type} className="mt-5 first:mt-0">
						<h3 className={formSectionTitleClass}>{sportChipLabel(type, activityLabel(type))}</h3>
						<div className="grid gap-3 min-[721px]:grid-cols-2">
							<form.AppField
								name={`${type}.before`}
								children={(field) => (
									<field.TextAreaField
										label="Before"
										rows={3}
										disabled={!authed}
										placeholder={HABIT_PLACEHOLDERS[type].before}
									/>
								)}
							/>
							<form.AppField
								name={`${type}.after`}
								children={(field) => (
									<field.TextAreaField
										label="After"
										rows={3}
										disabled={!authed}
										placeholder={HABIT_PLACEHOLDERS[type].after}
									/>
								)}
							/>
						</div>
					</div>
				))}
				{authed && (
					<form.Subscribe selector={(s) => s.values}>
						{(values) => {
							const a = normalizeActivityHabits(values);
							const b = normalizeActivityHabits(habits);
							const dirty = ACTIVITY_TYPES.some(
								(t) => a[t].before !== b[t].before || a[t].after !== b[t].after
							);
							return dirty ? (
								<Actions>
									<form.AppForm>
										<form.SubmitButton busyLabel="Saving…">
											<Icon name="check" size={16} />
											Save habits
										</form.SubmitButton>
									</form.AppForm>
								</Actions>
							) : null;
						}}
					</form.Subscribe>
				)}
			</Form>
		</div>
	);
}
