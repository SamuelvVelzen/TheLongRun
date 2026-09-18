import { ACTIVITY_TYPES, activityLabel, normalizeActivityType, paceFieldLabel, showsFeel, showsField, type ActivityType } from '$lib/activity';
import { dayFromIsoDate } from '$lib/format';
import { weekNumberForDate, type PlanCalendar } from '$lib/plan';
import { createRun, type CreateRunInput } from '$lib/server/functions';
import { gearKindForActivity, gearMetaForActivity, gearPickerOptions, type GearContext, type GearKind, type GearWear } from '$lib/gear';
import { fillStrengthNotesFromTops, type RecentLiftTop } from '$lib/strength';
import type { PlanWeek } from '$lib/types';
import { cn, ui } from '$lib/ui';
import { Link, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { ChoiceChips } from './ChoiceChips';
import { FeelChips, WantedFasterChips } from './FeelChips';
import { Icon, sportChipLabel } from './Icon';
import { GearField } from './GearField';
import { Select } from './Select';
import { errorMessage, useSnackbar } from './Snackbar';
import { StrengthEditor } from './StrengthEditor';
import { WeatherField } from './WeatherField';
import { Actions, Button, buttonClass, Field, Form, FormGrid, FormSection, Input, Panel, Textarea } from './ui';

const SESSIONS = ['easy', 'quality', 'tempo', 'steady', 'long', 'shakeout', 'race', 'other'];

export type LogFormPrefill = {
	activityType?: ActivityType;
	date?: string;
	time?: string;
	notes?: string;
};

export function LogForm({
	week,
	gear,
	gearWear,
	calendar,
	prefill,
	strengthTops = []
}: {
	week: PlanWeek | null;
	gear: GearContext;
	gearWear?: Record<GearKind, Record<string, GearWear>>;
	calendar: PlanCalendar;
	prefill?: LogFormPrefill;
	strengthTops?: RecentLiftTop[];
}) {
	const router = useRouter();
	const snack = useSnackbar();
	const todayIso = new Date().toISOString().slice(0, 10);
	const fromPlan = prefill?.activityType === 'strength';
	const [dateValue, setDateValue] = useState(prefill?.date || todayIso);
	const [startTimeValue, setStartTimeValue] = useState('');
	const [durationValue, setDurationValue] = useState(prefill?.time || '');
	const [weather, setWeather] = useState('');
	const [activityType, setActivityType] = useState<ActivityType>(prefill?.activityType ?? 'run');
	const [strengthNotes, setStrengthNotes] = useState(() =>
		fromPlan ? fillStrengthNotesFromTops(prefill?.notes ?? '', strengthTops) : ''
	);

	const derivedDay = dayFromIsoDate(dateValue || todayIso);
	const derivedWeek = weekNumberForDate(dateValue || todayIso, calendar);
	const gearKind = gearKindForActivity(activityType);
	const gearKindMeta = gearMetaForActivity(activityType);

	const planSession =
		week?.sessions.find(
			(s) =>
				s.day.toLowerCase() === derivedDay.toLowerCase() &&
				normalizeActivityType(s.activity_type ?? 'run') ===
					normalizeActivityType(activityType)
		) ?? week?.sessions.find((s) => s.day.toLowerCase() === derivedDay.toLowerCase());
	const defaultSession = planSession?.label.toLowerCase().includes('long')
		? 'long'
		: planSession?.label.toLowerCase().includes('easy')
			? 'easy'
			: planSession
				? 'quality'
				: 'easy';

	async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		const fd = new FormData(e.currentTarget);
		const num = (k: string) => {
			const v = String(fd.get(k) ?? '').trim();
			if (!v) return null;
			const n = Number(v);
			return Number.isFinite(n) ? n : null;
		};
		const wanted = String(fd.get('wanted_faster') ?? '');
		const input: CreateRunInput = {
			date: dateValue,
			activity_type: activityType,
			session: activityType === 'run' ? String(fd.get('session') ?? 'easy') : 'other',
			effort: num('effort'),
			shins: num('shins'),
			legs: num('legs'),
			energy: num('energy'),
			weather,
			surface: String(fd.get('surface') ?? ''),
			wanted_faster: wanted === 'Y' ? true : wanted === 'N' ? false : null,
			distance_km: num('distance_km'),
			start_time: startTimeValue,
			time: durationValue,
			avg_pace: String(fd.get('avg_pace') ?? ''),
			avg_hr: num('avg_hr'),
			max_hr: num('max_hr'),
			elev_gain: num('elev_gain'),
			cadence: num('cadence'),
			gear: String(fd.get('gear') ?? ''),
			notes: activityType === 'strength' ? strengthNotes : String(fd.get('notes') ?? '')
		};
		try {
			const res = await createRun({ data: input });
			await router.invalidate();
			if (input.session === 'race') {
				router.navigate({
					to: '/coach',
					search: { tab: 'debrief', slug: res.slug },
					replace: true,
					resetScroll: false
				});
			} else {
				router.navigate({ to: '/runs/$slug', params: { slug: res.slug } });
			}
		} catch (err) {
			snack.error(errorMessage(err, 'Save failed'));
		}
	}

	return (
		<Form method="POST" onSubmit={onSubmit}>
			{fromPlan && (
				<p className={cn(ui.muted, 'm-0 text-[0.9rem]')}>
					Prefilling this gym session from the plan — change anything that was different.
				</p>
			)}
			<Panel>
				<FormSection title="Activity">
					<FormGrid>
						<Field
							label="Date"
							required
							hint={
								<>
									{derivedDay}
									{derivedWeek != null && ` · week ${derivedWeek}`}
								</>
							}
						>
							<Input
								type="date"
								name="date"
								required
								value={dateValue}
								onChange={(e) => setDateValue(e.target.value)}
							/>
						</Field>
						<Field label="Type" required as="div" className="min-[721px]:col-span-2">
							<ChoiceChips
								aria-label="Activity type"
								value={activityType}
								options={ACTIVITY_TYPES.map((t) => ({
									value: t,
									label: sportChipLabel(t, activityLabel(t))
								}))}
								onChange={setActivityType}
							/>
						</Field>
						{activityType === 'run' && (
							<Field label="Session">
								<Select
									name="session"
									defaultValue={defaultSession}
									aria-label="Session"
									options={SESSIONS.map((s) => ({ value: s, label: s }))}
								/>
							</Field>
						)}
					</FormGrid>
				</FormSection>

				<FormSection title="Numbers">
					<FormGrid>
						{showsField(activityType, 'distance') && (
							<Field label="Distance (km)">
								<Input name="distance_km" type="text" inputMode="decimal" placeholder="7.04" />
							</Field>
						)}
						<Field label="Duration">
							<Input
								name="time"
								placeholder="45:12 or 1:15:01"
								value={durationValue}
								onChange={(e) => setDurationValue(e.target.value)}
							/>
						</Field>
						<Field label="Start time" required>
							<Input
								type="time"
								name="start_time"
								required
								value={startTimeValue}
								onChange={(e) => setStartTimeValue(e.target.value)}
							/>
						</Field>
						{showsField(activityType, 'pace') && (
							<Field label={paceFieldLabel(activityType)}>
								<Input name="avg_pace" inputMode="decimal" placeholder="6:29" />
							</Field>
						)}
						{showsField(activityType, 'hr') && (
							<Field label="Avg HR">
								<Input name="avg_hr" type="text" inputMode="numeric" placeholder="147" />
							</Field>
						)}
						{showsField(activityType, 'hr') && (
							<Field label="Max HR">
								<Input name="max_hr" type="text" inputMode="numeric" placeholder="172" />
							</Field>
						)}
						{showsField(activityType, 'elevation') && (
							<Field label="Elev gain (m)">
								<Input name="elev_gain" type="text" inputMode="decimal" placeholder="48" />
							</Field>
						)}
						{showsField(activityType, 'cadence') && (
							<Field label="Cadence">
								<Input name="cadence" type="text" inputMode="numeric" placeholder="176" />
							</Field>
						)}
					</FormGrid>
				</FormSection>

				<FormSection title="How it felt">
					<FormGrid>
						{showsFeel(activityType, 'effort') && (
							<FeelChips name="effort" label="Effort (1–10)" min={1} max={10} low="easy" high="max" />
						)}
						{showsFeel(activityType, 'shins') && (
							<FeelChips name="shins" label="Shins (0–10)" min={0} max={10} low="none" high="severe" />
						)}
						{showsFeel(activityType, 'legs') && (
							<FeelChips name="legs" label="Legs (0–10)" min={0} max={10} low="fresh" high="heavy" />
						)}
						{showsFeel(activityType, 'energy') && (
							<FeelChips name="energy" label="Energy (1–10)" min={1} max={10} low="empty" high="full" />
						)}
						{showsFeel(activityType, 'wanted_faster') && <WantedFasterChips />}
					</FormGrid>
				</FormSection>

				<FormSection title="Details">
					{(showsField(activityType, 'weather') ||
						showsField(activityType, 'surface') ||
						showsField(activityType, 'gear')) && (
						<FormGrid>
							{showsField(activityType, 'weather') && (
								<WeatherField
									value={weather}
									onChange={setWeather}
									date={dateValue}
									time={startTimeValue}
									duration={durationValue}
								/>
							)}
							{showsField(activityType, 'surface') && (
								<Field label="Surface">
									<Input
										name="surface"
										placeholder="asphalt / mixed / trail"
										defaultValue="asphalt"
									/>
								</Field>
							)}
							{showsField(activityType, 'gear') && gearKind && gearKindMeta && (
								<GearField
									key={gearKind}
									options={gearPickerOptions(gear[gearKind])}
									wear={gearWear?.[gearKind]}
									defaultValue={gear[gearKind].active}
									label={gearKindMeta.label}
									placeholder={gearKindMeta.customPlaceholder}
									activeHint={gearKindMeta.activeLabel.toLowerCase()}
								/>
							)}
						</FormGrid>
					)}
					{activityType === 'strength' ? (
						<Field label="Sets" as="div" className="mt-[0.85rem]">
							<StrengthEditor initial={strengthNotes} onChange={setStrengthNotes} />
						</Field>
					) : (
						<Field label="Notes" className="mt-[0.85rem]">
							<Textarea name="notes" placeholder="How it felt, route, heat, fatigue…" />
						</Field>
					)}
				</FormSection>
			</Panel>

			<Actions sticky>
				<Link className={buttonClass({ variant: 'ghost' })} to="/">
					<Icon name="close" size={16} />
					Cancel
				</Link>
				<Button variant="primary" stickyPrimary type="submit">
					<Icon name="check" size={16} />
					Save activity
				</Button>
			</Actions>
		</Form>
	);
}
