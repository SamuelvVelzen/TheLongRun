import { useEffect, useState } from 'react';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { getLogDefaults, getWeather, createRun, type CreateRunInput } from '$lib/server/functions';
import { dayFromIsoDate } from '$lib/format';
import { weekNumberForDate } from '$lib/plan';
import { ACTIVITY_TYPES, activityLabel } from '$lib/activity';

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
	const [weatherManual, setWeatherManual] = useState(false);
	const [weatherHint, setWeatherHint] = useState('');
	const [activityType, setActivityType] = useState('run');
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

	useEffect(() => {
		if (!dateValue || weatherManual) return;
		let cancelled = false;
		setWeatherHint('Fetching…');
		getWeather({
			data: { date: dateValue, time: startTimeValue || null, duration: durationValue || null }
		})
			.then((w) => {
				if (cancelled) return;
				setWeather(w ?? '');
				setWeatherHint(
					w ? 'From Open-Meteo (hourly) — edit anytime' : 'No weather data for this date'
				);
			})
			.catch(() => {
				if (!cancelled) setWeatherHint('Weather fetch failed');
			});
		return () => {
			cancelled = true;
		};
	}, [dateValue, startTimeValue, durationValue, weatherManual]);

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
			notes: String(fd.get('notes') ?? '')
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
					<p className="muted">Quick manual entry</p>
					<h1>Log an activity</h1>
					<p>Pick the type, fill what you have — weather auto-fills when left blank.</p>
				</div>
			</section>

			{message && <div className="flash">{message}</div>}

			{data.week && (
				<div className="panel" style={{ marginBottom: '1rem' }}>
					<span className="tag accent">Plan week {data.week.week}</span>
					<p style={{ marginTop: '0.6rem' }}>
						{data.week.sessions.map((s, i) => (
							<span key={i} className="muted">
								{s.day}: {s.detail}.{' '}
							</span>
						))}
					</p>
				</div>
			)}

			<form className="panel form" method="POST" onSubmit={onSubmit}>
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
						<label className="field">
							<span>Distance (km)</span>
							<input name="distance_km" type="number" step="0.01" placeholder="7.04" />
						</label>
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
							<span>Start time</span>
							<input
								type="time"
								name="start_time"
								value={startTimeValue}
								onChange={(e) => setStartTimeValue(e.target.value)}
							/>
						</label>
						<label className="field">
							<span>Avg pace /km</span>
							<input name="avg_pace" placeholder="6:29" />
						</label>
						<label className="field">
							<span>Avg HR</span>
							<input name="avg_hr" type="number" placeholder="147" />
						</label>
						<label className="field">
							<span>Max HR</span>
							<input name="max_hr" type="number" placeholder="172" />
						</label>
						<label className="field">
							<span>Elev gain (m)</span>
							<input name="elev_gain" type="number" step="0.1" placeholder="48" />
						</label>
						<label className="field">
							<span>Cadence</span>
							<input name="cadence" type="number" placeholder="176" />
						</label>
					</div>
				</div>

				<div className="form-section">
					<h3 className="form-section-title">How it felt</h3>
					<div className="form-grid">
						<label className="field">
							<span>Effort (1–10)</span>
							<input name="effort" type="number" min="1" max="10" placeholder="6" />
						</label>
						<label className="field">
							<span>Shins (0–10)</span>
							<input name="shins" type="number" min="0" max="10" placeholder="2" />
						</label>
						<label className="field">
							<span>Legs (0–10)</span>
							<input name="legs" type="number" min="0" max="10" placeholder="7" />
						</label>
						<label className="field">
							<span>Energy (1–10)</span>
							<input name="energy" type="number" min="1" max="10" placeholder="7" />
						</label>
						<label className="field">
							<span>Wanted to go faster?</span>
							<select name="wanted_faster" defaultValue="">
								<option value="">—</option>
								<option value="Y">Yes</option>
								<option value="N">No</option>
							</select>
						</label>
					</div>
				</div>

				<div className="form-section">
					<h3 className="form-section-title">Details</h3>
					<div className="form-grid">
						<label className="field">
							<span>Weather</span>
							<input
								name="weather"
								placeholder="27°C humid / cloudy"
								value={weather}
								onChange={(e) => {
									setWeather(e.target.value);
									setWeatherManual(true);
									setWeatherHint('Manual override');
								}}
							/>
							{weatherHint && <span className="field-hint muted">{weatherHint}</span>}
						</label>
						<label className="field">
							<span>Surface</span>
							<input name="surface" placeholder="asphalt / mixed / trail" defaultValue="asphalt" />
						</label>
						<label className="field">
							<span>Shoes</span>
							<input name="shoes" defaultValue={data.shoes.active} />
						</label>
					</div>
					<label className="field" style={{ marginTop: '0.85rem' }}>
						<span>Notes</span>
						<textarea name="notes" placeholder="How it felt, route, heat, fatigue…"></textarea>
					</label>
				</div>

				<div className="actions">
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
