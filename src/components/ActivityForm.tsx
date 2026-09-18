import {
	ACTIVITY_TYPES,
	activityLabel,
	normalizeActivityType,
	paceFieldLabel,
	showsFeel,
	showsField,
	type ActivityType
} from '$lib/activity';
import {
	ACTIVITY_SESSIONS,
	activityFormSchema,
	type ActivityFormValues
} from '$lib/activity-form';
import { dayFromIsoDate } from '$lib/format';
import {
	gearKindForActivity,
	gearMetaForActivity,
	gearPickerOptions,
	type GearContext,
	type GearKind,
	type GearWear
} from '$lib/gear';
import { weekNumberForDate, type PlanCalendar } from '$lib/plan';
import { cn } from '$lib/ui';
import type { ReactNode } from 'react';
import { FeelChips, WantedFasterChips } from './FeelChips';
import { GearField } from './GearField';
import { sportChipLabel } from './Icon';
import { StrengthEditor } from './StrengthEditor';
import {
	Actions,
	Field,
	Form,
	FormGrid,
	FormSection,
	Panel,
	useAppForm
} from './ui';
import { WeatherField } from './WeatherField';

export function ActivityForm({
	defaultValues,
	fromPlan,
	calendar,
	gear,
	gearWear,
	extraGear,
	submitLabel,
	cancel,
	onSubmit
}: {
	defaultValues: ActivityFormValues;
	fromPlan?: boolean;
	calendar: PlanCalendar;
	gear: GearContext;
	gearWear?: Record<GearKind, Record<string, GearWear>>;
	extraGear?: string[];
	submitLabel: string;
	cancel: ReactNode;
	onSubmit: (values: ActivityFormValues) => void | Promise<void>;
}) {
	const form = useAppForm({
		defaultValues,
		validators: { onSubmit: activityFormSchema },
		onSubmit: async ({ value }) => {
			await onSubmit(value);
		}
	});

	return (
		<Form
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				void form.handleSubmit();
			}}
		>
			{fromPlan && (
				<p className={cn('text-muted', 'm-0 text-[0.9rem]')}>
					Prefilling this gym session from the plan — change anything that was different.
				</p>
			)}
			<Panel>
				<FormSection title="Activity">
					<FormGrid>
						<form.Subscribe selector={(s) => s.values.date}>
							{(date) => {
								const derivedDay = dayFromIsoDate(date);
								const derivedWeek = weekNumberForDate(date, calendar);
								return (
									<form.AppField
										name="date"
										children={(field) => (
											<field.TextField
												label="Date"
												required
												type="date"
												hint={
													<>
														{derivedDay}
														{derivedWeek != null && ` · week ${derivedWeek}`}
													</>
												}
											/>
										)}
									/>
								);
							}}
						</form.Subscribe>
						<form.AppField
							name="activity_type"
							listeners={{
								onChange: ({ value }) => {
									const next = value as ActivityType;
									const kind = gearKindForActivity(next);
									if (kind) form.setFieldValue('gear', gear[kind].active ?? '');
									if (next !== 'run') form.setFieldValue('session', 'other');
								}
							}}
							children={(field) => (
								<field.ChipField
									label="Type"
									required
									className="min-[721px]:col-span-2"
									options={ACTIVITY_TYPES.map((t) => ({
										value: t,
										label: sportChipLabel(t, activityLabel(t))
									}))}
								/>
							)}
						/>
						<form.Subscribe selector={(s) => s.values.activity_type}>
							{(activityType) =>
								activityType === 'run' ? (
									<form.AppField
										name="session"
										children={(field) => (
											<field.SelectField
												label="Session"
												options={ACTIVITY_SESSIONS.map((s) => ({ value: s, label: s }))}
											/>
										)}
									/>
								) : null
							}
						</form.Subscribe>
					</FormGrid>
				</FormSection>

				<form.Subscribe selector={(s) => s.values.activity_type}>
					{(activityType) => (
						<>
							<FormSection title="Numbers">
								<FormGrid>
									{showsField(activityType, 'distance') && (
										<form.AppField
											name="distance_km"
											children={(field) => (
												<field.TextField
													label="Distance (km)"
													inputMode="decimal"
													placeholder="7.04"
												/>
											)}
										/>
									)}
									<form.AppField
										name="time"
										children={(field) => (
											<field.TextField label="Duration" placeholder="45:12 or 1:15:01" />
										)}
									/>
									<form.AppField
										name="start_time"
										children={(field) => (
											<field.TextField label="Start time" required type="time" />
										)}
									/>
									{showsField(activityType, 'pace') && (
										<form.AppField
											name="avg_pace"
											children={(field) => (
												<field.TextField
													label={paceFieldLabel(activityType)}
													inputMode="decimal"
													placeholder="6:29"
												/>
											)}
										/>
									)}
									{showsField(activityType, 'hr') && (
										<>
											<form.AppField
												name="avg_hr"
												children={(field) => (
													<field.TextField label="Avg HR" inputMode="numeric" placeholder="147" />
												)}
											/>
											<form.AppField
												name="max_hr"
												children={(field) => (
													<field.TextField label="Max HR" inputMode="numeric" placeholder="172" />
												)}
											/>
										</>
									)}
									{showsField(activityType, 'elevation') && (
										<form.AppField
											name="elev_gain"
											children={(field) => (
												<field.TextField
													label="Elev gain (m)"
													inputMode="decimal"
													placeholder="48"
												/>
											)}
										/>
									)}
									{showsField(activityType, 'cadence') && (
										<form.AppField
											name="cadence"
											children={(field) => (
												<field.TextField label="Cadence" inputMode="numeric" placeholder="176" />
											)}
										/>
									)}
								</FormGrid>
							</FormSection>

							<FormSection title="How it felt">
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
							</FormSection>

							<FormSection title="Details">
								<form.Subscribe
									selector={(s) => [s.values.date, s.values.start_time, s.values.time] as const}
								>
									{([date, startTime, duration]) => (
										<>
											{(showsField(activityType, 'weather') ||
												showsField(activityType, 'surface') ||
												showsField(activityType, 'gear')) && (
												<FormGrid>
													{showsField(activityType, 'weather') && (
														<form.AppField
															name="weather"
															children={(field) => (
																<WeatherField
																	value={field.state.value}
																	onChange={field.handleChange}
																	date={date}
																	time={startTime}
																	duration={duration}
																/>
															)}
														/>
													)}
													{showsField(activityType, 'surface') && (
														<form.AppField
															name="surface"
															children={(field) => (
																<field.TextField
																	label="Surface"
																	placeholder="asphalt / mixed / trail"
																/>
															)}
														/>
													)}
													{showsField(activityType, 'gear') &&
														(() => {
															const gearKind = gearKindForActivity(activityType);
															const gearKindMeta = gearMetaForActivity(activityType);
															if (!gearKind || !gearKindMeta) return null;
															return (
																<form.AppField
																	name="gear"
																	children={(field) => (
																		<GearField
																			key={gearKind}
																			options={gearPickerOptions(gear[gearKind], extraGear)}
																			wear={gearWear?.[gearKind]}
																			value={field.state.value}
																			onChange={field.handleChange}
																			label={gearKindMeta.label}
																			placeholder={gearKindMeta.customPlaceholder}
																			activeHint={gearKindMeta.activeLabel.toLowerCase()}
																		/>
																	)}
																/>
															);
														})()}
												</FormGrid>
											)}
										</>
									)}
								</form.Subscribe>
								{normalizeActivityType(activityType) === 'strength' ? (
									<form.AppField
										name="notes"
										children={(field) => (
											<Field label="Sets" as="div" className="mt-[0.85rem]">
												<StrengthEditor
													key={defaultValues.notes}
													initial={field.state.value}
													onChange={field.handleChange}
												/>
											</Field>
										)}
									/>
								) : (
									<form.AppField
										name="notes"
										children={(field) => (
											<field.TextAreaField
												label="Notes"
												className="mt-[0.85rem]"
												placeholder="How it felt, route, heat, fatigue…"
											/>
										)}
									/>
								)}
							</FormSection>
						</>
					)}
				</form.Subscribe>
			</Panel>

			<Actions sticky>
				{cancel}
				<form.AppForm>
					<form.SubmitButton stickyPrimary busyLabel="Saving…">
						{submitLabel}
					</form.SubmitButton>
				</form.AppForm>
			</Actions>
		</Form>
	);
}
