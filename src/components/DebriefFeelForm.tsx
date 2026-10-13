import { activityLabel, normalizeActivityType, showsFeel, showsField } from '$lib/activity';
import { parseOptionalNumber } from '$lib/activity-form';
import { HABIT_PLACEHOLDERS, type HabitPair } from '$lib/activity-habits';
import { useBodyAreas } from '$lib/auth';
import { bodyScoreRows, rowsToBodyScores, type BodyArea, type BodyScore } from '$lib/body-scores';
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
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { z } from 'zod';
import { DebriefActivityTitle } from './DebriefActivityTitle';
import { DeleteButton } from './DeleteButton';
import { ManageBodyNotesLink, NoBodyNotesHint } from './BodyNoteParts';
import { FeelChips, WantedFasterChips } from './FeelChips';
import { GearField } from './GearField';
import {
	Field,
	FormGrid,
	FormSection,
	Panel,
	PanelTitle,
	Textarea,
	errorMessage,
	useAppForm,
	useSnackbar
} from './ui';

const SESSIONS = ['easy', 'quality', 'tempo', 'steady', 'long', 'shakeout', 'race', 'other'];
const REFRESH_DEBOUNCE_MS = 1200;

const debriefFeelSchema = z.object({
	session: z.string(),
	cadence: z.string(),
	gear: z.string(),
	effort: z.number().nullable(),
	body_scores: z.array(
		z.object({ note_id: z.string().nullable(), area: z.string(), score: z.number().nullable() })
	),
	legs: z.number().nullable(),
	energy: z.number().nullable(),
	wanted_faster: z.enum(['Y', 'N', '']),
	surface: z.string()
});

type FeelFormValues = z.infer<typeof debriefFeelSchema>;

export type DebriefFeelRun = {
	slug: string;
	date: string;
	day?: string | null;
	start_time?: string | null;
	distance_km?: number | null;
	activity_type?: string;
	session?: string;
	cadence?: number | null;
	gear?: string;
	effort?: number | null;
	body_scores?: BodyScore[];
	legs?: number | null;
	energy?: number | null;
	wanted_faster?: boolean | null;
	surface?: string;
	notes?: string;
	before_notes?: string;
	after_notes?: string;
	hasFeel?: boolean;
};

function feelValuesFromRun(run: DebriefFeelRun, bodyAreas: BodyArea[]): FeelFormValues {
	const wantedStart: 'Y' | 'N' | '' =
		run.wanted_faster === true ? 'Y' : run.wanted_faster === false ? 'N' : '';
	return {
		session: run.session || 'other',
		cadence: run.cadence != null ? String(run.cadence) : '',
		gear: run.gear ?? '',
		effort: run.effort ?? null,
		body_scores: bodyScoreRows(run.body_scores ?? [], bodyAreas),
		legs: run.legs ?? null,
		energy: run.energy ?? null,
		wanted_faster: wantedStart,
		surface: run.surface ?? ''
	};
}

function buildFeelSavePayload({
	slug,
	activityType,
	writeup,
	habitDraft,
	value,
	detailsOpen,
	scoresOpen
}: {
	slug: string;
	activityType: ReturnType<typeof normalizeActivityType>;
	writeup: string;
	habitDraft: HabitPair;
	value: FeelFormValues;
	detailsOpen: boolean;
	scoresOpen: boolean;
}) {
	const writeupNotes = writeup.trim();
	return {
		slug,
		before_notes: habitDraft.before,
		after_notes: habitDraft.after,
		...(writeupNotes ? { notes: writeupNotes } : {}),
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
					body_scores: rowsToBodyScores(value.body_scores),
					legs: value.legs,
					energy: value.energy,
					wanted_faster:
						value.wanted_faster === 'Y' ? true : value.wanted_faster === 'N' ? false : null,
					...(showsField(activityType, 'surface') ? { surface: value.surface } : {})
				}
			: {})
	};
}

function DebriefFeelAutosave({
	run,
	activityType,
	writeup,
	habitDraft,
	formValues,
	detailsOpen,
	scoresOpen,
	onSaved,
	flushRef
}: {
	run: DebriefFeelRun;
	activityType: ReturnType<typeof normalizeActivityType>;
	writeup: string;
	habitDraft: HabitPair;
	formValues: FeelFormValues;
	detailsOpen: boolean;
	scoresOpen: boolean;
	onSaved: () => void | Promise<void>;
	flushRef: MutableRefObject<(() => void) | null>;
}) {
	const snack = useSnackbar();
	const onSavedRef = useRef(onSaved);
	onSavedRef.current = onSaved;
	const [syncState, setSyncState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
	const hydrated = useRef(false);
	const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const lastSaved = useRef('');
	const saving = useRef(false);

	const payload = buildFeelSavePayload({
		slug: run.slug,
		activityType,
		writeup,
		habitDraft,
		value: formValues,
		detailsOpen,
		scoresOpen
	});
	const payloadRef = useRef(payload);
	payloadRef.current = payload;

	useEffect(() => {
		if (!hydrated.current) {
			hydrated.current = true;
			lastSaved.current = JSON.stringify(payload);
		}
	}, [payload]);

	useEffect(() => {
		return () => {
			if (refreshTimer.current) clearTimeout(refreshTimer.current);
		};
	}, []);

	const flushSave = useCallback(() => {
		if (saving.current) return;
		const key = JSON.stringify(payloadRef.current);
		if (key === lastSaved.current) return;
		saving.current = true;
		void (async () => {
			setSyncState('saving');
			try {
				await saveActivityFeel({ data: payloadRef.current });
				lastSaved.current = key;
				setSyncState('saved');
				if (refreshTimer.current) clearTimeout(refreshTimer.current);
				refreshTimer.current = setTimeout(() => {
					void onSavedRef.current();
				}, REFRESH_DEBOUNCE_MS);
			} catch (err) {
				setSyncState('error');
				snack.error(errorMessage(err, 'Could not save.'));
			} finally {
				saving.current = false;
			}
		})();
	}, [snack]);

	useEffect(() => {
		flushRef.current = flushSave;
		return () => {
			flushRef.current = null;
		};
	}, [flushRef, flushSave]);

	const syncLabel =
		syncState === 'saving'
			? 'Saving…'
			: syncState === 'saved'
				? 'Saved'
				: syncState === 'error'
					? 'Not saved'
					: null;

	if (!syncLabel) return null;
	return (
		<p className={cn('text-muted', 'm-0 text-[0.78rem] shrink-0')} aria-live="polite">
			{syncLabel}
		</p>
	);
}

export function DebriefFeelForm({
	run,
	writeup,
	habitDraft,
	gear,
	gearWear,
	onWriteupChange,
	onHabitChange,
	onSaved
}: {
	run: DebriefFeelRun;
	writeup: string;
	habitDraft: HabitPair;
	gear: GearContext;
	gearWear: Record<GearKind, Record<string, GearWear>>;
	onWriteupChange: (text: string) => void;
	onHabitChange: (field: keyof HabitPair, text: string) => void;
	onSaved: () => void | Promise<void>;
}) {
	const bodyAreas = useBodyAreas();
	const [detailsOpen, setDetailsOpen] = useState(false);
	const [scoresOpen, setScoresOpen] = useState(false);
	const activityType = normalizeActivityType(run.activity_type ?? 'run');
	const sport = activityLabel(activityType).toLowerCase();
	const gearKind = gearKindForActivity(activityType);
	const gearKindMeta = gearMetaForActivity(activityType);
	const hasScores =
		run.effort != null ||
		(run.body_scores?.length ?? 0) > 0 ||
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
		defaultValues: feelValuesFromRun(run, bodyAreas),
		validators: { onChange: debriefFeelSchema }
	});
	const panelRef = useRef<HTMLDivElement>(null);
	const flushSaveRef = useRef<(() => void) | null>(null);

	useEffect(() => {
		form.reset(feelValuesFromRun(run, bodyAreas));
	}, [run.slug]);

	useEffect(() => {
		const panel = panelRef.current;
		if (!panel) return;
		const el = panel;
		function onPanelFocusOut(e: FocusEvent) {
			const next = e.relatedTarget;
			if (next instanceof Node && el.contains(next)) return;
			flushSaveRef.current?.();
		}
		el.addEventListener('focusout', onPanelFocusOut);
		return () => el.removeEventListener('focusout', onPanelFocusOut);
	}, []);

	return (
		<div ref={panelRef}>
			<Panel form className="mt-3">
				<div className="flex flex-wrap items-end justify-between gap-2 gap-y-1">
					<PanelTitle className="flex-1 min-w-0 border-0 pb-0 mb-0">
						<DebriefActivityTitle run={run} link />
					</PanelTitle>
					<form.Subscribe selector={(s) => s.values}>
						{(formValues) => (
							<DebriefFeelAutosave
								run={run}
								activityType={activityType}
								writeup={writeup}
								habitDraft={habitDraft}
								formValues={formValues}
								detailsOpen={detailsOpen}
								scoresOpen={scoresOpen}
								onSaved={onSaved}
								flushRef={flushSaveRef}
							/>
						)}
					</form.Subscribe>
				</div>
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
						{showsFeel(activityType, 'body') && (
							<FormSection title="Body" action={<ManageBodyNotesLink />}>
								<form.Subscribe selector={(s) => s.values.body_scores}>
									{(rows) =>
										rows.length ? (
											<FormGrid>
												{rows.map((row, i) => (
													<form.AppField
														key={row.note_id ?? row.area}
														name={`body_scores[${i}].score`}
														children={(field) => (
															<FeelChips
																label={`${row.area} (0–10)`}
																min={0}
																max={10}
																low="none"
																high="severe"
																value={field.state.value}
																onChange={field.handleChange}
															/>
														)}
													/>
												))}
											</FormGrid>
										) : (
											<NoBodyNotesHint />
										)
									}
								</form.Subscribe>
							</FormSection>
						)}
					</>
				)}
			</Panel>
		</div>
	);
}
