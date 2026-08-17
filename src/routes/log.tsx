import { useState } from 'react';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { getLogDefaults, createRun, type CreateRunInput } from '$lib/server/functions';
import { dayFromIsoDate } from '$lib/format';
import { weekNumberForDate } from '$lib/plan';
import { ACTIVITY_TYPES, activityLabel, paceFieldLabel, showsFeel, showsField } from '$lib/activity';
import { StrengthEditor } from '../components/StrengthEditor';
import { ShoesField } from '../components/ShoesField';
import { WeatherField } from '../components/WeatherField';
import { FeelChips, WantedFasterChips } from '../components/FeelChips';

export const Route = createFileRoute('/log')({
	loader: () => getLogDefaults(),
	component: LogRun
});

function LogRun() {
	const data = Route.useLoaderData();
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

	const planSession = data.week?.sessions.find((s) => s.day === derivedDay);
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
			router.navigate({ to: '/runs/$slug', params: { slug: res.slug } });
		} catch (err) {
			setMessage(err instanceof Error ? err.message : 'Save failed');
		}
	}

	const sessions = ['easy', 'quality', 'tempo', 'steady', 'long', 'shakeout', 'race', 'other'];

	return (
		<>
			<section className="hero">
				<div>
					<p className="muted">Manual fallback</p>
					<h1>Log an activity</h1>
					<p>
						<Link to="/import">Import</Link> is the usual way to add a session. Use this form when you
						need to enter one by hand — fields adapt to the activity.
					</p>
				</div>
			</section>

			{message && <div className="flash">{message}</div>}

			<form className="form" method="POST" onSubmit={onSubmit}>
				<div className="panel">
				<div className="form-section">
					<h3 className="form-section-title">Activity</h3>
					<div className="form-grid">
						<label className="field">
							<span className="req">Date</span>
							<input
								type="date"
								name="date"
								required
								value={dateValue}
								onChange={(e) => setDateValue(e.target.value)}
							/>
							<span className="field-hint muted">
								{derivedDay}
								{derivedWeek != null && ` · week ${derivedWeek}`}
							</span>
						</label>
						<label className="field">
							<span className="req">Type</span>
							<select value={activityType} onChange={(e) => setActivityType(e.target.value)}>
								{ACTIVITY_TYPES.map((t) => (
									<option key={t} value={t}>
										{activityLabel(t)}
									</option>
								))}
							</select>
						</label>
						{activityType === 'run' && (
							<label className="field">
								<span>Session</span>
								<select name="session" defaultValue={defaultSession}>
									{sessions.map((s) => (
										<option key={s} value={s}>
											{s}
										</option>
									))}
								</select>
							</label>
						)}
					</div>
				</div>

				<div className="form-section">
					<h3 className="form-section-title">Numbers</h3>
					<div className="form-grid">
						{showsField(activityType, 'distance') && (
							<label className="field">
								<span>Distance (km)</span>
								<input
									name="distance_km"
									type="text"
									inputMode="decimal"
									placeholder="7.04"
								/>
							</label>
						)}
						<label className="field">
							<span>Duration</span>
							<input
								name="time"
								placeholder="45:12 or 1:15:01"
								value={durationValue}
								onChange={(e) => setDurationValue(e.target.value)}
							/>
						</label>
						<label className="field">
							<span className="req">Start time</span>
							<input
								type="time"
								name="start_time"
								required
								value={startTimeValue}
								onChange={(e) => setStartTimeValue(e.target.value)}
							/>
						</label>
						{showsField(activityType, 'pace') && (
							<label className="field">
								<span>{paceFieldLabel(activityType)}</span>
								<input name="avg_pace" inputMode="decimal" placeholder="6:29" />
							</label>
						)}
						{showsField(activityType, 'hr') && (
							<label className="field">
								<span>Avg HR</span>
								<input name="avg_hr" type="text" inputMode="numeric" placeholder="147" />
							</label>
						)}
						{showsField(activityType, 'hr') && (
							<label className="field">
								<span>Max HR</span>
								<input name="max_hr" type="text" inputMode="numeric" placeholder="172" />
							</label>
						)}
						{showsField(activityType, 'elevation') && (
							<label className="field">
								<span>Elev gain (m)</span>
								<input
									name="elev_gain"
									type="text"
									inputMode="decimal"
									placeholder="48"
								/>
							</label>
						)}
						{showsField(activityType, 'cadence') && (
							<label className="field">
								<span>Cadence</span>
								<input name="cadence" type="text" inputMode="numeric" placeholder="176" />
							</label>
						)}
					</div>
				</div>

				<div className="form-section">
					<h3 className="form-section-title">How it felt</h3>
					<div className="form-grid">
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

				<div className="form-section">
					<h3 className="form-section-title">Details</h3>
					{(showsField(activityType, 'weather') ||
						showsField(activityType, 'surface') ||
						showsField(activityType, 'shoes')) && (
						<div className="form-grid">
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
								<label className="field">
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
									options={[data.shoes.active, ...data.shoes.rotation]}
									defaultValue={data.shoes.active}
								/>
							)}
						</div>
					)}
					{activityType === 'strength' ? (
						<div className="field" style={{ marginTop: '0.85rem' }}>
							<span>Sets</span>
							<StrengthEditor initial={strengthNotes} onChange={setStrengthNotes} />
						</div>
					) : (
						<label className="field" style={{ marginTop: '0.85rem' }}>
							<span>Notes</span>
							<textarea name="notes" placeholder="How it felt, route, heat, fatigue…"></textarea>
						</label>
					)}
				</div>
				</div>

				<div className="actions form-sticky-actions">
					<button className="btn btn-primary" type="submit">
						Save activity
					</button>
					<Link className="btn btn-ghost" to="/">
						Cancel
					</Link>
				</div>
			</form>
		</>
	);
}
