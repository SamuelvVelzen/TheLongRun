import { activityLabel, normalizeActivityType, showsFeel, showsField } from '$lib/activity';
import { parseOptionalNumber } from '$lib/activity-form';
import { HABIT_PLACEHOLDERS, type HabitPair } from '$lib/activity-habits';
import {
    gearKindForActivity,
    gearMetaForActivity,
    gearPickerOptions,
    type GearContext,
    type GearKind,
    type GearWear
} from '$lib/gear';
import { saveActivityFeel } from '$lib/server/functions';
import { cn } from '$lib/ui';
import { useState, type ReactNode } from 'react';
import { z } from 'zod';
import { DeleteButton } from './DeleteButton';
import { FeelChips, WantedFasterChips } from './FeelChips';
import { GearField } from './GearField';
import { Icon } from './Icon';
import { errorMessage, useSnackbar } from './Snackbar';
import { Actions, Field, Form, FormGrid, panelClass, Textarea, useAppForm } from './ui';

const SESSIONS = ['easy', 'quality', 'tempo', 'steady', 'long', 'shakeout', 'race', 'other'];

const debriefFeelSchema = z.object({
	session: z.string(),
	cadence: z.string(),
	gear: z.string(),
	effort: z.number().nullable(),
	shins: z.number().nullable(),
	legs: z.number().nullable(),
	energy: z.number().nullable(),
	wanted_faster: z.enum(['Y', 'N', '']),
	surface: z.string()
});

export type DebriefFeelRun = {
	slug: string;
	date: string;
	day?: string | null;
	distance_km?: number | null;
	activity_type?: string;
	session?: string;
	cadence?: number | null;
	gear?: string;
	effort?: number | null;
	shins?: number | null;
	legs?: number | null;
	energy?: number | null;
	wanted_faster?: boolean | null;
	surface?: string;
	notes?: string;
	before_notes?: string;
	after_notes?: string;
	hasFeel?: boolean;
};

export function DebriefFeelForm({
	run,
	heading,
	writeup,
	habitDraft,
	gear,
	gearWear,
	onWriteupChange,
	onHabitChange,
	onSaved
}: {
	run: DebriefFeelRun;
	heading?: ReactNode;
	writeup: string;
	habitDraft: HabitPair;
	gear: GearContext;
	gearWear: Record<GearKind, Record<string, GearWear>>;
	onWriteupChange: (text: string) => void;
	onHabitChange: (field: keyof HabitPair, text: string) => void;
	onSaved: () => void | Promise<void>;
}) {
	const snack = useSnackbar();
	const [detailsOpen, setDetailsOpen] = useState(false);
	const [scoresOpen, setScoresOpen] = useState(false);
	const activityType = normalizeActivityType(run.activity_type ?? 'run');
	const sport = activityLabel(activityType).toLowerCase();
	const gearKind = gearKindForActivity(activityType);
	const gearKindMeta = gearMetaForActivity(activityType);
	const wantedStart: 'Y' | 'N' | '' =
		run.wanted_faster === true ? 'Y' : run.wanted_faster === false ? 'N' : '';
	const hasScores =
		run.effort != null ||
		run.shins != null ||
		run.legs != null ||
		run.energy != null ||
		run.wanted_faster != null ||
		(run.surface ?? '').trim() !== '';
	const needsDetails =
		(activityType === 'run' && (!run.session || run.session === 'other' || run.cadence == null)) ||
		(showsField(activityType, 'gear') && !(run.gear ?? '').trim());
	const hasDetails =
		(activityType === 'run' && Boolean(run.session) && run.cadence != null) ||
		(showsField(activityType, 'gear') && Boolean((run.gear ?? '').trim()));

	const form = useAppForm({
		defaultValues: {
			session: run.session || 'other',
			cadence: run.cadence != null ? String(run.cadence) : '',
			gear: run.gear ?? '',
			effort: run.effort ?? null,
			shins: run.shins ?? null,
			legs: run.legs ?? null,
			energy: run.energy ?? null,
			wanted_faster: wantedStart,
			surface: run.surface ?? ''
		},
		validators: { onSubmit: debriefFeelSchema },
		onSubmit: async ({ value }) => {
			try {
				await saveActivityFeel({
					data: {
						slug: run.slug,
						before_notes: habitDraft.before,
						after_notes: habitDraft.after,
						...(detailsOpen && activityType === 'run'
							? {
									session: value.session,
									cadence: parseOptionalNumber(value.cadence)
								}
							: {}),
						...(detailsOpen && showsField(activityType, 'gear') ? { gear: value.gear } : {}),
						...(scoresOpen
							? {
									effort: value.effort,
									shins: value.shins,
									legs: value.legs,
									energy: value.energy,
									wanted_faster:
										value.wanted_faster === 'Y'
											? true
											: value.wanted_faster === 'N'
												? false
												: null,
									...(showsField(activityType, 'surface') ? { surface: value.surface } : {})
								}
							: {})
					}
				});
				snack.success('Saved.');
				await onSaved();
			} catch (err) {
				snack.error(errorMessage(err, 'Could not save.'));
			}
		}
	});

	return (
		<Form
			className={panelClass('mt-3')}
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				void form.handleSubmit();
			}}
		>
			{heading ? <h3 className="m-0">{heading}</h3> : null}
			<Field
				label={
					<span className="flex items-center justify-between gap-2">
						What happened
						<DeleteButton
							label="Clear write-up"
							compact
							disabled={!writeup}
							onClick={() => onWriteupChange('')}
						/>
					</span>
				}
			>
				<span className={cn('text-muted', 'font-normal')}>
					Write it like you would in chat — as long as you want. Wind, surfaces, after-session
					checks, questions for this week. GPS numbers are already in the prompt. The AI will read
					scores from this when you mention them, then summarise it into the activity notes.
				</span>
				<Textarea
					variant="debrief"
					placeholder={`Today’s ${activityType === 'strength' ? 'session' : sport} was… After: … Should I…?`}
					value={writeup}
					onChange={(e) => onWriteupChange(e.target.value)}
					rows={12}
				/>
			</Field>

			<FormGrid>
				<Field label="Before">
					<Textarea
						rows={2}
						placeholder={HABIT_PLACEHOLDERS[activityType].before}
						value={habitDraft.before}
						onChange={(e) => onHabitChange('before', e.target.value)}
					/>
				</Field>
				<Field label="After">
					<Textarea
						rows={2}
						placeholder={HABIT_PLACEHOLDERS[activityType].after}
						value={habitDraft.after}
						onChange={(e) => onHabitChange('after', e.target.value)}
					/>
				</Field>
			</FormGrid>

			{(activityType === 'run' || showsField(activityType, 'gear')) && (
				<>
					<button
						type="button"
						className="appearance-none self-start bg-transparent border-0 p-0 min-h-11 text-accent-fg font-semibold cursor-pointer text-left"
						aria-expanded={detailsOpen}
						onClick={() => setDetailsOpen((open) => !open)}
					>
						{detailsOpen
							? 'Hide details'
							: needsDetails
								? 'Add session, cadence, gear'
								: hasDetails
									? 'Change session, cadence, gear'
									: 'Add session, cadence, gear'}
					</button>
					{detailsOpen && (
						<FormGrid>
							{activityType === 'run' && (
								<form.AppField
									name="session"
									children={(field) => (
										<field.SelectField
											label="Session"
											options={SESSIONS.map((s) => ({ value: s, label: s }))}
										/>
									)}
								/>
							)}
							{activityType === 'run' && (
								<form.AppField
									name="cadence"
									children={(field) => (
										<field.TextField label="Cadence" inputMode="numeric" placeholder="176" />
									)}
								/>
							)}
							{showsField(activityType, 'gear') && gearKind && gearKindMeta && (
								<form.AppField
									name="gear"
									children={(field) => (
										<GearField
											key={gearKind}
											options={gearPickerOptions(gear[gearKind], run.gear ? [run.gear] : [])}
											wear={gearWear[gearKind]}
											value={field.state.value}
											onChange={field.handleChange}
											label={gearKindMeta.label}
											placeholder={gearKindMeta.customPlaceholder}
											activeHint={gearKindMeta.activeLabel.toLowerCase()}
										/>
									)}
								/>
							)}
						</FormGrid>
					)}
				</>
			)}

			<button
				type="button"
				className="appearance-none self-start bg-transparent border-0 p-0 min-h-11 text-accent-fg font-semibold cursor-pointer text-left"
				aria-expanded={scoresOpen}
				onClick={() => setScoresOpen((open) => !open)}
			>
				{scoresOpen ? 'Hide scores' : hasScores ? 'Change scores' : 'Set scores myself'}
			</button>
			{scoresOpen && (
				<>
					<FormGrid>
						{showsFeel(activityType, 'effort') && (
							<form.AppField
								name="effort"
								children={(field) => (
									<FeelChips
										label="Effort (1–10)"
										min={1}
										max={10}
										low="easy"
										high="max"
										value={field.state.value}
										onChange={field.handleChange}
									/>
								)}
							/>
						)}
						{showsFeel(activityType, 'shins') && (
							<form.AppField
								name="shins"
								children={(field) => (
									<FeelChips
										label="Shins (0–10)"
										min={0}
										max={10}
										low="none"
										high="severe"
										value={field.state.value}
										onChange={field.handleChange}
									/>
								)}
							/>
						)}
						{showsFeel(activityType, 'legs') && (
							<form.AppField
								name="legs"
								children={(field) => (
									<FeelChips
										label="Legs (0–10)"
										min={0}
										max={10}
										low="fresh"
										high="heavy"
										value={field.state.value}
										onChange={field.handleChange}
									/>
								)}
							/>
						)}
						{showsFeel(activityType, 'energy') && (
							<form.AppField
								name="energy"
								children={(field) => (
									<FeelChips
										label="Energy (1–10)"
										min={1}
										max={10}
										low="empty"
										high="full"
										value={field.state.value}
										onChange={field.handleChange}
									/>
								)}
							/>
						)}
						{showsFeel(activityType, 'wanted_faster') && (
							<form.AppField
								name="wanted_faster"
								children={(field) => (
									<WantedFasterChips
										value={field.state.value}
										onChange={(next) => {
											if (next === 'Y' || next === 'N' || next === '') {
												field.handleChange(next);
											}
										}}
									/>
								)}
							/>
						)}
					</FormGrid>
					{showsField(activityType, 'surface') && (
						<form.AppField
							name="surface"
							children={(field) => (
								<field.TextField label="Surface" placeholder="asphalt / mixed / trail" />
							)}
						/>
					)}
				</>
			)}

			<Actions>
				<form.AppForm>
					<form.SubmitButton busyLabel="Saving…">
						<Icon name="check" size={16} />
						Save
					</form.SubmitButton>
				</form.AppForm>
			</Actions>
		</Form>
	);
}
