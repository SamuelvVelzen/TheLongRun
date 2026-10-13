import { ACTIVITY_TYPES, activityLabel } from '$lib/activity';
import { goalFormSchema, goalToFormValues, toGoalInput } from '$lib/goal-form';
import {
	emptyGoalDraft,
	goalDraftFromReply,
	planStartHint,
	shiftPlanStartWithRaceDate
} from '$lib/goals';
import { calendarFromGoal, mondayIso } from '$lib/plan';
import { getGoalBrief, saveActiveGoal } from '$lib/server/functions';
import type { Goal } from '$lib/types';
import { cn } from '$lib/ui';
import { useRef, useState } from 'react';
import { AiPromptFlow } from './AiPromptFlow';
import { GoalCopyAiDialog } from './GoalCopyAiDialog';
import { Icon, sportChipLabel } from './Icon';
import {
	Actions,
	Button,
	Field,
	Form,
	FormGrid,
	FormSection,
	IconLabelButton,
	SegmentedToggle,
	Textarea,
	errorMessage,
	useAppForm,
	useSnackbar
} from './ui';

function hasRaceCopy(primary: string[] | string, notes: string): boolean {
	const lines = Array.isArray(primary)
		? primary
		: primary.split('\n').map((s) => s.trim()).filter(Boolean);
	return lines.some((p) => p.trim()) || notes.trim() !== '';
}

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
	const [copyTab, setCopyTab] = useState<'copy' | 'generate'>(() =>
		hasRaceCopy(draft.primary, draft.notes) ? 'copy' : 'generate'
	);
	const [extra, setExtra] = useState('');
	const [briefText, setBriefText] = useState('');
	const [replyJson, setReplyJson] = useState('');
	const [briefBusy, setBriefBusy] = useState(false);
	const [copyAi, setCopyAi] = useState(false);
	const form = useAppForm({
		defaultValues,
		validators: { onSubmit: goalFormSchema },
		onSubmit: async ({ value }) => {
			const payload = fixedKind === 'intention' ? { ...value, kind: 'intention' as const } : { ...value, kind: 'race' as const };
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

	async function generateBrief() {
		const value = form.state.values;
		setBriefBusy(true);
		try {
			const next = await getGoalBrief({
				data: {
					name: value.name,
					date: fixedKind === 'race' ? value.date : '',
					horizon: value.horizon,
					distance_km: value.distance_km,
					sport: value.sport,
					time_goal: value.time_goal,
					plan_start: value.plan_start,
					url: value.url,
					itinerary_url: value.itinerary_url,
					primary: value.primary,
					notes: value.notes,
					extra
				}
			});
			setBriefText(next);
		} catch (e) {
			snack.error(errorMessage(e, 'Could not build the prompt.'));
		} finally {
			setBriefBusy(false);
		}
	}

	function applyReply() {
		try {
			const patch = goalDraftFromReply(replyJson);
			const currentDate = form.getFieldValue('date');
			if (patch.name !== undefined) form.setFieldValue('name', patch.name);
			if (patch.date !== undefined) {
				if (fixedKind === 'intention') {
					form.setFieldValue('horizon', patch.date.slice(0, 7));
				} else {
					if (patch.plan_start === undefined) {
						form.setFieldValue(
							'plan_start',
							shiftPlanStartWithRaceDate(form.getFieldValue('plan_start'), currentDate, patch.date)
						);
					}
					form.setFieldValue('date', patch.date);
					form.setFieldValue('horizon', patch.date.slice(0, 7));
					lastDate.current = patch.date;
				}
			}
			if (patch.horizon !== undefined && patch.date === undefined) {
				form.setFieldValue('horizon', patch.horizon);
			}
			if (patch.distance_km !== undefined) form.setFieldValue('distance_km', patch.distance_km);
			if (patch.sport !== undefined) form.setFieldValue('sport', patch.sport);
			if (patch.time_goal !== undefined) form.setFieldValue('time_goal', patch.time_goal);
			if (patch.plan_start !== undefined && fixedKind === 'race') {
				form.setFieldValue('plan_start', patch.plan_start);
			}
			if (patch.url !== undefined) form.setFieldValue('url', patch.url);
			if (patch.itinerary_url !== undefined) form.setFieldValue('itinerary_url', patch.itinerary_url);
			if (patch.primary !== undefined) form.setFieldValue('primary', patch.primary);
			if (patch.notes !== undefined) form.setFieldValue('notes', patch.notes);
			setReplyJson('');
			if (patch.primary !== undefined || patch.notes !== undefined) setCopyTab('copy');
			snack.success('Filled from the reply — review and save.');
		} catch (e) {
			snack.error(errorMessage(e, 'Could not apply that JSON.'));
		}
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
				<div className="flex flex-wrap items-center gap-2">
					<SegmentedToggle
						fill
						className="min-w-0 flex-1"
						aria-label="Priorities and notes"
						value={copyTab}
						onChange={setCopyTab}
						options={[
							{ value: 'copy', label: 'Priorities & notes' },
							{
								value: 'generate',
								label: (
									<>
										<Icon name="sparkle" size={14} />
										Generate
									</>
								)
							}
						]}
					/>
					{copyTab === 'copy' && (
						<IconLabelButton
							label="Import with AI"
							icon={<Icon name="sparkle" size={16} />}
							onClick={() => setCopyAi(true)}
						/>
					)}
				</div>
				{copyTab === 'copy' && (
					<>
						<form.AppField
							name="primary"
							children={(field) => (
								<field.TextAreaField label="Priorities (one per line)" rows={4} />
							)}
						/>
						<form.AppField
							name="notes"
							children={(field) => <field.TextAreaField label="Notes" rows={4} />}
						/>
					</>
				)}
				{copyTab === 'generate' && (
					<>
						<p className={cn('text-muted', 'm-0')}>
							Same as Coach: build a prompt from this goal plus your last 30 days of activities, copy
							it to an AI, then paste the JSON back to fill the form.
							{kind === 'intention' ? ' For a look-ahead the prompt will not invent a race day.' : ''}
						</p>
						<Field label="Anything extra for the prompt? (optional)">
							<Textarea
								rows={3}
								value={extra}
								onChange={(e) => setExtra(e.target.value)}
								placeholder="e.g. hilly course, travel the day before, want a conservative first 5k"
							/>
						</Field>
						<Actions className="justify-start!">
							<Button variant="primary" disabled={briefBusy} onClick={() => void generateBrief()}>
								<Icon name="sparkle" size={16} />
								{briefBusy ? 'Building…' : briefText ? 'Regenerate prompt' : 'Generate prompt'}
							</Button>
						</Actions>
						{briefText ? (
							<AiPromptFlow
								prompt={briefText}
								promptEditable
								onPromptChange={setBriefText}
								promptRows={12}
							/>
						) : null}
						<Field label="Paste the JSON your AI returned">
							<Textarea
								variant="editor"
								rows={8}
								value={replyJson}
								onChange={(e) => setReplyJson(e.target.value)}
								placeholder='{ "name": "…", "primary": ["…"], "notes": "…" }'
							/>
						</Field>
						<Actions className="justify-start!">
							<IconLabelButton
								label="Fill form"
								size="default"
								disabled={!replyJson.trim()}
								icon={<Icon name="plus" size={16} />}
								onClick={applyReply}
							/>
						</Actions>
					</>
				)}
			</FormSection>
			<form.Subscribe selector={(s) => s.values}>
				{(values) => (
					<GoalCopyAiDialog
						open={copyAi}
						draft={{
							name: values.name,
							date: fixedKind === 'race' ? values.date : '',
							horizon: values.horizon,
							distance_km: values.distance_km,
							sport: values.sport,
							time_goal: values.time_goal,
							plan_start: fixedKind === 'race' ? values.plan_start : '',
							url: values.url,
							itinerary_url: values.itinerary_url,
							primary: values.primary,
							notes: values.notes,
							extra: ''
						}}
						onClose={() => setCopyAi(false)}
						onApply={(patch) => {
							if (patch.primary !== undefined) form.setFieldValue('primary', patch.primary);
							if (patch.notes !== undefined) form.setFieldValue('notes', patch.notes);
							snack.success('Applied from AI — review and save the goal.');
						}}
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
