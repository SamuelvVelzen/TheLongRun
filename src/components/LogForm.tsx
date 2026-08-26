import { ACTIVITY_TYPES, activityLabel, normalizeActivityType, paceFieldLabel, showsFeel, showsField } from '$lib/activity';
import { dayFromIsoDate } from '$lib/format';
import { weekNumberForDate } from '$lib/plan';
import { createRun, type CreateRunInput } from '$lib/server/functions';
import type { PlanWeek } from '$lib/types';
import { Link, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { cn, ui } from '$lib/ui';
import { FeelChips, WantedFasterChips } from './FeelChips';
import { ShoesField } from './ShoesField';
import { StrengthEditor } from './StrengthEditor';
import { WeatherField } from './WeatherField';

const SESSIONS = ['easy', 'quality', 'tempo', 'steady', 'long', 'shakeout', 'race', 'other'];

export function LogForm({
	week,
	shoes,
	afterSave = 'coach'
}: {
	week: PlanWeek | null;
	shoes: { active: string; rotation: string[]; notes: string };
	afterSave?: 'coach' | 'run';
}) {
	const router = useRouter();
	const todayIso = new Date().toISOString().slice(0, 10);
	const [dateValue, setDateValue] = useState(todayIso);
	const [startTimeValue, setStartTimeValue] = useState('');
	const [durationValue, setDurationValue] = useState('');
	const [weather, setWeather] = useState('');
	const [activityType, setActivityType] = useState('run');
	const [strengthNotes, setStrengthNotes] = useState('');
	const [message, setMessage] = useState('');

	const derivedDay = dayFromIsoDate(dateValue || todayIso);
	const derivedWeek = weekNumberForDate(dateValue || todayIso);

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
			shoes: String(fd.get('shoes') ?? ''),
			notes: activityType === 'strength' ? strengthNotes : String(fd.get('notes') ?? '')
		};
		try {
			const res = await createRun({ data: input });
			if (afterSave === 'run') {
				router.navigate({ to: '/runs/$slug', params: { slug: res.slug } });
			} else {
				router.navigate({
					to: '/coach',
					search: { tab: 'debrief', slug: res.slug },
					replace: true,
					resetScroll: false
				});
			}
		} catch (err) {
			setMessage(err instanceof Error ? err.message : 'Save failed');
		}
	}

	return (
		<form className={ui.form} method="POST" onSubmit={onSubmit}>
			{message && <div className={ui.flash}>{message}</div>}
			<div className={ui.panel}>
				<div className={ui.formSection}>
					<h3 className={ui.formSectionTitle}>Activity</h3>
					<div className={ui.formGrid}>
						<label className={ui.field}>
							<span className={ui.req}>Date</span>
							<input
								type="date"
								name="date"
								required
								value={dateValue}
								onChange={(e) => setDateValue(e.target.value)}
							/>
							<span className={cn(ui.fieldHint, ui.muted)}>
								{derivedDay}
								{derivedWeek != null && ` · week ${derivedWeek}`}
							</span>
						</label>
						<label className={ui.field}>
							<span className={ui.req}>Type</span>
							<select value={activityType} onChange={(e) => setActivityType(e.target.value)}>
								{ACTIVITY_TYPES.map((t) => (
									<option key={t} value={t}>
										{activityLabel(t)}
									</option>
								))}
							</select>
						</label>
						{activityType === 'run' && (
							<label className={ui.field}>
								<span>Session</span>
								<select name="session" defaultValue={defaultSession}>
									{SESSIONS.map((s) => (
										<option key={s} value={s}>
											{s}
										</option>
									))}
								</select>
							</label>
						)}
					</div>
				</div>

				<div className={ui.formSection}>
					<h3 className={ui.formSectionTitle}>Numbers</h3>
					<div className={ui.formGrid}>
						{showsField(activityType, 'distance') && (
							<label className={ui.field}>
								<span>Distance (km)</span>
								<input name="distance_km" type="text" inputMode="decimal" placeholder="7.04" />
							</label>
						)}
						<label className={ui.field}>
							<span>Duration</span>
							<input
								name="time"
								placeholder="45:12 or 1:15:01"
								value={durationValue}
								onChange={(e) => setDurationValue(e.target.value)}
							/>
						</label>
						<label className={ui.field}>
							<span className={ui.req}>Start time</span>
							<input
								type="time"
								name="start_time"
								required
								value={startTimeValue}
								onChange={(e) => setStartTimeValue(e.target.value)}
							/>
						</label>
						{showsField(activityType, 'pace') && (
							<label className={ui.field}>
								<span>{paceFieldLabel(activityType)}</span>
								<input name="avg_pace" inputMode="decimal" placeholder="6:29" />
							</label>
						)}
						{showsField(activityType, 'hr') && (
							<label className={ui.field}>
								<span>Avg HR</span>
								<input name="avg_hr" type="text" inputMode="numeric" placeholder="147" />
							</label>
						)}
						{showsField(activityType, 'hr') && (
							<label className={ui.field}>
								<span>Max HR</span>
								<input name="max_hr" type="text" inputMode="numeric" placeholder="172" />
							</label>
						)}
						{showsField(activityType, 'elevation') && (
							<label className={ui.field}>
								<span>Elev gain (m)</span>
								<input name="elev_gain" type="text" inputMode="decimal" placeholder="48" />
							</label>
						)}
						{showsField(activityType, 'cadence') && (
							<label className={ui.field}>
								<span>Cadence</span>
								<input name="cadence" type="text" inputMode="numeric" placeholder="176" />
							</label>
						)}
					</div>
				</div>

				<div className={ui.formSection}>
					<h3 className={ui.formSectionTitle}>How it felt</h3>
					<div className={ui.formGrid}>
						{showsFeel(activityType, 'effort') && (
							<FeelChips name="effort" label="Effort (1–10)" min={1} max={10} />
						)}
						{showsFeel(activityType, 'shins') && (
							<FeelChips name="shins" label="Shins (0–10)" min={0} max={10} />
						)}
						{showsFeel(activityType, 'legs') && (
							<FeelChips name="legs" label="Legs (0–10)" min={0} max={10} />
						)}
						{showsFeel(activityType, 'energy') && (
							<FeelChips name="energy" label="Energy (1–10)" min={1} max={10} />
						)}
						{showsFeel(activityType, 'wanted_faster') && <WantedFasterChips />}
					</div>
				</div>

				<div className={ui.formSection}>
					<h3 className={ui.formSectionTitle}>Details</h3>
					{(showsField(activityType, 'weather') ||
						showsField(activityType, 'surface') ||
						showsField(activityType, 'shoes')) && (
						<div className={ui.formGrid}>
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
								<label className={ui.field}>
									<span>Surface</span>
									<input
										name="surface"
										placeholder="asphalt / mixed / trail"
										defaultValue="asphalt"
									/>
								</label>
							)}
							{showsField(activityType, 'shoes') && (
								<ShoesField
									options={[shoes.active, ...shoes.rotation]}
									defaultValue={shoes.active}
								/>
							)}
						</div>
					)}
					{activityType === 'strength' ? (
						<div className={cn(ui.field, 'mt-[0.85rem]')}>
							<span>Sets</span>
							<StrengthEditor initial={strengthNotes} onChange={setStrengthNotes} />
						</div>
					) : (
						<label className={cn(ui.field, 'mt-[0.85rem]')}>
							<span>Notes</span>
							<textarea name="notes" placeholder="How it felt, route, heat, fatigue…"></textarea>
						</label>
					)}
				</div>
			</div>

			<div className={cn(ui.actions, ui.stickyActions)}>
				<button className={cn(ui.btnPrimary, ui.stickyPrimary)} type="submit">
					Save activity
				</button>
				<Link className={ui.btnGhost} to="/">
					Cancel
				</Link>
			</div>
		</form>
	);
}
