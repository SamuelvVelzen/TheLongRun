import { ACTIVITY_TYPES, activityLabel } from '$lib/activity';
import type { GoalCopyPatch } from '$lib/goal-copy-schema';
import { goalFormSchema, goalToFormValues, toGoalInput } from '$lib/goal-form';
import { emptyGoalDraft, planStartHint, shiftPlanStartWithRaceDate } from '$lib/goals';
import { calendarFromGoal, mondayIso } from '$lib/plan';
import { saveActiveGoal } from '$lib/server/functions';
import type { Goal } from '$lib/types';
import { useRef, useState } from 'react';
import { GoalCopyAiDialog } from './GoalCopyAiDialog';
import { Icon, sportChipLabel } from './Icon';
import {
	Actions,
	Button,
	Form,
	FormGrid,
	FormSection,
	IconLabelButton,
	errorMessage,
	useAppForm,
	useSnackbar
} from './ui';

export function GoalForm({
	initial,
	fixedKind,
	submitLabel,
	onCancel,
	onSaved
}: {
	initial: Goal | null;
	fixedKind: 'race' | 'intention';
	submitLabel: string;
	onCancel: () => void;
	onSaved: () => void | Promise<void>;
}) {
	const snack = useSnackbar();
	const draft = initial ?? emptyGoalDraft();
	const defaultValues = goalToFormValues(
		!initial && fixedKind === 'intention'
			? { ...draft, date: '', horizon: '', plan_start: '' }
			: draft,
		fixedKind
	);
	const lastDate = useRef(defaultValues.date);
	const [copyAi, setCopyAi] = useState(false);
	const form = useAppForm({
		defaultValues,
		validators: { onSubmit: goalFormSchema },
		onSubmit: async ({ value }) => {
			const payload =
				fixedKind === 'intention'
					? { ...value, kind: 'intention' as const }
					: { ...value, kind: 'race' as const };
			try {
				const res = await saveActiveGoal({ data: toGoalInput(payload, initial?.id) });
				if (initial?.status === 'done') {
					snack.success('Race details saved — medal time still comes from the linked activity.');
				} else if (res.isIntention) {
					snack.success('Saved — look-ahead only. Coach will not treat this as race day.');
				} else if (res.isActive) {
					let weeks = 1;
					try {
						weeks = calendarFromGoal({
							plan_start: mondayIso(payload.plan_start),
							date: payload.date
						}).weekCount;
					} catch {
						weeks = 1;
					}
					snack.success(`Saved — ${weeks} week plan through race day.`);
				} else {
					snack.success(`Saved — later on the calendar. Training stays on ${res.activeName}.`);
				}
				await onSaved();
			} catch (err) {
				snack.error(errorMessage(err, 'Could not save the goal.'));
			}
		}
	});

	function applyCopy(patch: GoalCopyPatch) {
		const currentDate = form.getFieldValue('date');
		if (patch.name !== undefined) form.setFieldValue('name', patch.name);
		if (patch.date !== undefined && fixedKind === 'race') {
			if (patch.plan_start === undefined) {
				form.setFieldValue(
					'plan_start',
					shiftPlanStartWithRaceDate(form.getFieldValue('plan_start'), currentDate, patch.date)
				);
			}
			form.setFieldValue('date', patch.date);
			form.setFieldValue('horizon', patch.date.slice(0, 7));
			lastDate.current = patch.date;
		} else if (patch.date !== undefined) {
			form.setFieldValue('horizon', patch.date.slice(0, 7));
		}
		if (patch.horizon !== undefined && patch.date === undefined)
			form.setFieldValue('horizon', patch.horizon);
		if (patch.distance_km !== undefined) form.setFieldValue('distance_km', patch.distance_km);
		if (patch.sport !== undefined) form.setFieldValue('sport', patch.sport);
		if (patch.time_goal !== undefined) form.setFieldValue('time_goal', patch.time_goal);
		if (patch.plan_start !== undefined && fixedKind === 'race')
			form.setFieldValue('plan_start', patch.plan_start);
		if (patch.url !== undefined) form.setFieldValue('url', patch.url);
		if (patch.itinerary_url !== undefined) form.setFieldValue('itinerary_url', patch.itinerary_url);
		if (patch.primary !== undefined) form.setFieldValue('primary', patch.primary);
		if (patch.notes !== undefined) form.setFieldValue('notes', patch.notes);
		snack.success('Applied from AI — review and save the goal.');
	}

	const kind = fixedKind;

	return (
		<Form
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				void form.handleSubmit();
			}}
		>
			<form.AppField
				name="name"
				children={(field) => (
					<field.TextField
						label={kind === 'intention' ? 'Name' : 'Race name'}
						required
						placeholder={kind === 'intention' ? 'Half marathon' : 'Amersfoort 10K'}
					/>
				)}
			/>
			{kind === 'intention' ? (
				<FormGrid>
					<form.AppField
						name="horizon"
						children={(field) => (
							<field.TextField
								label="Month"
								required
								type="month"
								hint="No race picked yet — planning uses this window, not a race day."
							/>
						)}
					/>
					<form.AppField
						name="distance_km"
						children={(field) => (
							<field.TextField label="Distance (km)" required type="number" min={0.1} step="0.1" />
						)}
					/>
				</FormGrid>
			) : (
				<FormGrid>
					<form.AppField
						name="date"
						listeners={{
							onChange: ({ value }) => {
								if (!value) return;
								const prev = lastDate.current;
								lastDate.current = value;
								form.setFieldValue('horizon', value.slice(0, 7));
								if (prev && prev !== value) {
									form.setFieldValue(
										'plan_start',
										shiftPlanStartWithRaceDate(form.getFieldValue('plan_start'), prev, value)
									);
								} else if (!form.getFieldValue('plan_start')) {
									form.setFieldValue('plan_start', mondayIso(new Date()));
								}
							}
						}}
						children={(field) => <field.TextField label="Race date" required type="date" />}
					/>
					<form.AppField
						name="distance_km"
						children={(field) => (
							<field.TextField label="Distance (km)" required type="number" min={0.1} step="0.1" />
						)}
					/>
				</FormGrid>
			)}
			<form.AppField
				name="sport"
				children={(field) => (
					<field.ChipField
						label="Sport"
						options={ACTIVITY_TYPES.map((t) => ({
							value: t,
							label: sportChipLabel(t, activityLabel(t))
						}))}
					/>
				)}
			/>
			<FormGrid>
				<form.AppField
					name="time_goal"
					children={(field) => <field.TextField label="Time goal" placeholder="45:00" />}
				/>
				{kind === 'race' ? (
					<form.AppField
						name="bib_number"
						children={(field) => (
							<field.TextField label="Bib number" placeholder="e.g. 4821" inputMode="numeric" />
						)}
					/>
				) : (
					<div />
				)}
			</FormGrid>
			{kind === 'race' ? (
				<>
					<FormGrid>
						<form.AppField
							name="wave"
							children={(field) => <field.TextField label="Wave" placeholder="e.g. 2" />}
						/>
						<form.AppField
							name="start_time"
							children={(field) => <field.TextField label="Start time" type="time" />}
						/>
					</FormGrid>
					<form.Subscribe selector={(s) => [s.values.plan_start, s.values.date] as const}>
						{([planStart, date]) => (
							<form.AppField
								name="plan_start"
								listeners={{
									onBlur: ({ value }) => {
										const monday = mondayIso(value);
										if (monday !== value) form.setFieldValue('plan_start', monday);
									}
								}}
								children={(field) => (
									<field.TextField
										label="Plan starts (Monday)"
										required
										type="date"
										hint={planStartHint(planStart, date)}
									/>
								)}
							/>
						)}
					</form.Subscribe>
				</>
			) : null}
			<FormGrid>
				<form.AppField
					name="url"
					children={(field) => (
						<field.TextField
							label="Race URL"
							placeholder="https://example.com/race"
							inputMode="url"
							autoComplete="url"
						/>
					)}
				/>
				<form.AppField
					name="itinerary_url"
					children={(field) => (
						<field.TextField
							label="Itinerary URL"
							placeholder="https://maps.app.goo.gl/…"
							inputMode="url"
							autoComplete="url"
						/>
					)}
				/>
			</FormGrid>
			<FormSection className="border-t border-line pt-4 grid gap-4">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h3 className="m-0 text-[0.95rem]">Priorities &amp; notes</h3>
					<IconLabelButton
						label="Import with AI"
						icon={<Icon name="sparkle" size={16} />}
						onClick={() => setCopyAi(true)}
					/>
				</div>
				<form.AppField
					name="primary"
					children={(field) => <field.TextAreaField label="Priorities (one per line)" rows={4} />}
				/>
				<form.AppField
					name="notes"
					children={(field) => <field.TextAreaField label="Notes" rows={4} />}
				/>
			</FormSection>
			<form.Subscribe selector={(s) => s.values}>
				{(values) => (
					<GoalCopyAiDialog
						open={copyAi}
						kind={fixedKind}
						draft={{
							name: values.name,
							date: values.date,
							horizon: values.horizon,
							distance_km: values.distance_km,
							sport: values.sport,
							time_goal: values.time_goal,
							plan_start: values.plan_start,
							url: values.url,
							itinerary_url: values.itinerary_url,
							primary: values.primary,
							notes: values.notes
						}}
						onClose={() => setCopyAi(false)}
						onApply={applyCopy}
					/>
				)}
			</form.Subscribe>
			<Actions>
				<form.AppForm>
					<form.SubmitButton busyLabel="Saving…">
						<Icon name="check" size={16} />
						{submitLabel}
					</form.SubmitButton>
				</form.AppForm>
				<form.Subscribe selector={(s) => s.isSubmitting}>
					{(busy) => (
						<Button variant="ghost" onClick={onCancel} disabled={busy}>
							Cancel
						</Button>
					)}
				</form.Subscribe>
			</Actions>
		</Form>
	);
}
