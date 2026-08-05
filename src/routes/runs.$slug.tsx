import { useState } from 'react';
import { createFileRoute, Link, notFound, useRouter } from '@tanstack/react-router';
import { getRunDetail, updateRun, deleteRun, type UpdateRunInput } from '$lib/server/functions';
import { dayFromIsoDate } from '$lib/format';
import { weekNumberForDate } from '$lib/plan';
import { ACTIVITY_TYPES, activityLabel, headlineMetric, normalizeActivityType } from '$lib/activity';
import { parseStrengthNotes, topSet, exerciseVolume } from '$lib/strength';
import { RouteMap } from '../components/RouteMap';
import { SplitsPanel } from '../components/SplitsPanel';
import { StrengthEditor } from '../components/StrengthEditor';

export const Route = createFileRoute('/runs/$slug')({
	loader: async ({ params }) => {
		const detail = await getRunDetail({ data: params.slug });
		if (!detail) throw notFound();
		return detail;
	},
	component: RunDetail
});

const sessions = ['easy', 'quality', 'tempo', 'steady', 'long', 'shakeout', 'race', 'other'];

function routeIdFrom(route: string, stravaId: string): string {
	const fromRoute = route
		.trim()
		.split(/[\\/]/)
		.pop();
	const id = (fromRoute ?? '').replace(/\?.*$/, '').replace(/\.json$/i, '');
	return id || stravaId || '';
}

function RunDetail() {
	const { run: r, analytics } = Route.useLoaderData();
	const router = useRouter();

	const [editing, setEditing] = useState(false);
	const [editDate, setEditDate] = useState(r.date);
	const [editActivity, setEditActivity] = useState(r.activity_type || 'run');
	const [editNotes, setEditNotes] = useState(r.notes);
	const [message, setMessage] = useState('');

	const derivedDay = dayFromIsoDate(editDate || r.date);
	const derivedWeek = weekNumberForDate(editDate || r.date);

	const hrFill =
		r.avg_hr != null && r.max_hr != null && r.max_hr > 0
			? Math.min(100, Math.round((r.avg_hr / r.max_hr) * 100))
			: null;
	const wantedValue = r.wanted_faster === true ? 'Y' : r.wanted_faster === false ? 'N' : '';
	const routeId = r.route ? routeIdFrom(r.route, r.strava_id) : '';
	const strength =
		normalizeActivityType(r.activity_type) === 'strength' ? parseStrengthNotes(r.notes) : null;
	const metric = headlineMetric(r);
	const metricSub =
		metric.unit === ''
			? 'duration'
			: metric.unit === 'km/h'
				? 'avg km/h'
				: metric.unit === '/100m'
					? 'pace /100m'
					: 'pace /km';

	function startEditing() {
		setEditDate(r.date);
		setEditing(true);
	}

	async function onDelete(e: React.MouseEvent) {
		e.preventDefault();
		if (!confirm(`Delete run ${r.date} (${r.day})? This cannot be undone.`)) return;
		await deleteRun({ data: r.slug });
		router.navigate({ to: '/timeline' });
	}

	async function onUpdate(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		const fd = new FormData(e.currentTarget);
		const num = (k: string) => {
			const v = String(fd.get(k) ?? '').trim();
			if (!v) return null;
			const n = Number(v);
			return Number.isFinite(n) ? n : null;
		};
		const wanted = String(fd.get('wanted_faster') ?? '');
		const input: UpdateRunInput = {
			slug: r.slug,
			date: editDate,
			activity_type: editActivity,
			session: String(fd.get('session') ?? ''),
			effort: num('effort'),
			shins: num('shins'),
			legs: num('legs'),
			energy: num('energy'),
			weather: String(fd.get('weather') ?? ''),
			surface: String(fd.get('surface') ?? ''),
			wanted_faster: wanted === 'Y' ? true : wanted === 'N' ? false : null,
			distance_km: num('distance_km'),
			start_time: String(fd.get('start_time') ?? ''),
			time: String(fd.get('time') ?? ''),
			avg_pace: String(fd.get('avg_pace') ?? ''),
			avg_hr: num('avg_hr'),
			max_hr: num('max_hr'),
			elev_gain: num('elev_gain'),
			cadence: num('cadence'),
			shoes: String(fd.get('shoes') ?? ''),
			notes: editActivity === 'strength' ? editNotes : String(fd.get('notes') ?? '')
		};
		try {
			const res = await updateRun({ data: input });
			setEditing(false);
			if (res.slug !== r.slug) {
				router.navigate({ to: '/runs/$slug', params: { slug: res.slug } });
			} else {
				router.invalidate();
			}
		} catch (err) {
			setMessage(err instanceof Error ? err.message : 'Update failed');
		}
	}

	return (
		<>
			<section className="hero">
				<div>
					<p className="muted">
						{activityLabel(r.activity_type)} · {r.day} · {r.session}
						{r.week != null && ` · week ${r.week}`}
						{r.start_time && ` · started ${r.start_time}`}
					</p>
					<h1 className="run-title">
						{r.date}
						{r.has_map && (
							<span
								className="map-badge map-badge-lg"
								title="Route map available"
								aria-label="Has route map"
							>
								<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
									<path
										fill="currentColor"
										d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"
									/>
								</svg>
							</span>
						)}
					</h1>
					{!editing && (
						<p>{(strength ? strength.extra : r.notes) || 'No notes for this run.'}</p>
					)}
				</div>
				<div className="actions">
					{!editing && (
						<>
							<button
								className="btn btn-ghost btn-icon"
								type="button"
								aria-label="Edit run"
								title="Edit run"
								onClick={startEditing}
							>
								<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
									<path
										fill="currentColor"
										d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"
									/>
								</svg>
							</button>
							<button
								className="btn btn-ghost btn-danger btn-icon"
								type="button"
								aria-label={`Delete run ${r.date}`}
								title="Delete run"
								onClick={onDelete}
							>
								<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
									<path
										fill="currentColor"
										d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9zm-1 12h12l1-12H5l1 12z"
									/>
								</svg>
							</button>
							<Link className="btn btn-ghost" to="/log">
								Log another
							</Link>
							<Link className="btn btn-ghost" to="/context">
								Copy context
							</Link>
						</>
					)}
				</div>
			</section>

			{message && <div className="flash">{message}</div>}

			{editing ? (
				<form className="panel form" method="POST" onSubmit={onUpdate}>
					<div className="form-grid">
						<label className="field">
							<span className="req">Date</span>
							<input
								type="date"
								name="date"
								required
								value={editDate}
								onChange={(e) => setEditDate(e.target.value)}
							/>
							<span className="field-hint muted">
								{derivedDay}
								{derivedWeek != null && ` · week ${derivedWeek}`}
							</span>
						</label>
						<label className="field">
							<span className="req">Activity</span>
							<select
								name="activity_type"
								value={editActivity}
								onChange={(e) => setEditActivity(e.target.value)}
							>
								{ACTIVITY_TYPES.map((t) => (
									<option key={t} value={t}>
										{activityLabel(t)}
									</option>
								))}
							</select>
						</label>
						<label className="field">
							<span className="req">Session</span>
							<select name="session" required defaultValue={r.session}>
								{sessions.map((s) => (
									<option key={s} value={s}>
										{s}
									</option>
								))}
							</select>
						</label>
					</div>

					<div className="form-grid">
						<label className="field">
							<span>Distance (km)</span>
							<input name="distance_km" type="number" step="0.01" defaultValue={r.distance_km ?? ''} />
						</label>
						<label className="field">
							<span>Start time</span>
							<input type="time" name="start_time" defaultValue={r.start_time || ''} />
						</label>
						<label className="field">
							<span>Duration</span>
							<input name="time" placeholder="45:12 or 1:15:01" defaultValue={r.time || ''} />
						</label>
						<label className="field">
							<span>Avg pace /km</span>
							<input name="avg_pace" placeholder="6:29" defaultValue={r.avg_pace || ''} />
						</label>
						<label className="field">
							<span>Avg HR</span>
							<input name="avg_hr" type="number" defaultValue={r.avg_hr ?? ''} />
						</label>
						<label className="field">
							<span>Max HR</span>
							<input name="max_hr" type="number" defaultValue={r.max_hr ?? ''} />
						</label>
						<label className="field">
							<span>Elev gain (m)</span>
							<input name="elev_gain" type="number" step="0.1" defaultValue={r.elev_gain ?? ''} />
						</label>
						<label className="field">
							<span>Cadence</span>
							<input name="cadence" type="number" defaultValue={r.cadence ?? ''} />
						</label>
						<label className="field">
							<span>Shoes</span>
							<input name="shoes" defaultValue={r.shoes || ''} />
						</label>
					</div>

					<div className="form-grid">
						<label className="field">
							<span>Effort (1–10)</span>
							<input name="effort" type="number" min="1" max="10" defaultValue={r.effort ?? ''} />
						</label>
						<label className="field">
							<span>Shins (0–10)</span>
							<input name="shins" type="number" min="0" max="10" defaultValue={r.shins ?? ''} />
						</label>
						<label className="field">
							<span>Legs (0–10)</span>
							<input name="legs" type="number" min="0" max="10" defaultValue={r.legs ?? ''} />
						</label>
						<label className="field">
							<span>Energy (1–10)</span>
							<input name="energy" type="number" min="1" max="10" defaultValue={r.energy ?? ''} />
						</label>
						<label className="field">
							<span>Weather</span>
							<input name="weather" placeholder="27°C humid / cloudy" defaultValue={r.weather || ''} />
						</label>
						<label className="field">
							<span>Surface</span>
							<input
								name="surface"
								placeholder="asphalt / mixed / trail"
								defaultValue={r.surface || ''}
							/>
						</label>
						<label className="field">
							<span>Wanted to go faster?</span>
							<select name="wanted_faster" defaultValue={wantedValue}>
								<option value="">—</option>
								<option value="Y">Y</option>
								<option value="N">N</option>
							</select>
						</label>
					</div>

					{editActivity === 'strength' ? (
						<div className="field">
							<span>Sets</span>
							<StrengthEditor initial={r.notes} onChange={setEditNotes} />
						</div>
					) : (
						<label className="field">
							<span>Notes</span>
							<textarea name="notes" defaultValue={r.notes}></textarea>
						</label>
					)}

					<div className="actions">
						<button className="btn btn-primary" type="submit">
							Save changes
						</button>
						<button className="btn btn-ghost" type="button" onClick={() => setEditing(false)}>
							Cancel
						</button>
					</div>
				</form>
			) : (
				<>
					<div className="metrics metrics-primary" style={{ marginBottom: '0.75rem' }}>
						<div className="metric metric-emph">
							<b>{r.distance_km ?? '—'}</b>
							<span>km</span>
						</div>
						<div className="metric metric-emph">
							<b>{metric.value}</b>
							<span>{metricSub}</span>
						</div>
						<div className="metric metric-emph">
							<b>{r.time || '—'}</b>
							<span>moving</span>
						</div>
						{r.elapsed_time && r.elapsed_time !== r.time && (
							<div className="metric">
								<b>{r.elapsed_time}</b>
								<span>elapsed</span>
							</div>
						)}
					</div>

					<div className="metrics" style={{ marginBottom: '1.25rem' }}>
						{r.avg_hr != null || r.max_hr != null ? (
							<div className="metric metric-hr">
								<div className="metric-hr-vals">
									<b>{r.avg_hr ?? '—'}</b>
									<span className="metric-hr-sep">/</span>
									<strong className="metric-hr-max">{r.max_hr ?? '—'}</strong>
								</div>
								<span>HR avg / max</span>
								{hrFill != null && (
									<div className="hr-bar" aria-hidden="true">
										<div className="hr-bar-fill" style={{ width: `${hrFill}%` }}></div>
									</div>
								)}
							</div>
						) : (
							<div className="metric">
								<b>—</b>
								<span>HR</span>
							</div>
						)}
						<div className="metric">
							<b>{r.elev_gain != null ? r.elev_gain : '—'}</b>
							<span>elev m</span>
						</div>
						<div className="metric">
							<b>{r.cadence ?? '—'}</b>
							<span>cadence</span>
						</div>
						{r.calories != null && (
							<div className="metric">
								<b>{r.calories}</b>
								<span>kcal</span>
							</div>
						)}
						{r.kilojoules != null && (
							<div className="metric">
								<b>{r.kilojoules}</b>
								<span>kJ</span>
							</div>
						)}
						{r.max_speed != null && (
							<div className="metric">
								<b>{r.max_speed}</b>
								<span>max km/h</span>
							</div>
						)}
						<div className="metric">
							<b>{r.effort ?? '—'}</b>
							<span>effort</span>
						</div>
						<div className="metric">
							<b>{r.shins ?? '—'}</b>
							<span>shins</span>
						</div>
						<div className="metric">
							<b>{r.legs ?? '—'}</b>
							<span>legs</span>
						</div>
						<div className="metric">
							<b>{r.energy ?? '—'}</b>
							<span>energy</span>
						</div>
					</div>

					{strength && strength.exercises.length > 0 && (
						<div className="panel" style={{ marginBottom: '1rem' }}>
							<div className="splits-head">
								<h3>Sets</h3>
								<p className="muted splits-sub">reps × kg</p>
							</div>
							<div className="strength-view-row strength-view-head">
								<span>Exercise</span>
								<span>Sets</span>
								<span>Top</span>
								<span>Volume</span>
							</div>
							{strength.exercises.map((ex, i) => {
								const t = topSet(ex);
								const vol = Math.round(exerciseVolume(ex));
								return (
									<div className="strength-view-row" key={i}>
										<span>{ex.name}</span>
										<span className="muted">
											{ex.sets
												.map((s) => (s.kg != null ? `${s.reps}×${s.kg}` : `${s.reps}`))
												.join(', ')}
										</span>
										<span className="splits-pace">
											{t ? (t.kg != null ? `${t.reps}×${t.kg}kg` : `${t.reps} reps`) : '—'}
										</span>
										<span className="muted">{vol ? `${vol} kg` : '—'}</span>
									</div>
								);
							})}
						</div>
					)}

					{r.route && routeId && (
						<div
							className="panel"
							style={{ marginBottom: '1rem', padding: 0, overflow: 'hidden' }}
						>
							<div style={{ padding: '1.1rem 1.2rem 0.6rem' }}>
								<h3>Route</h3>
							</div>
							<RouteMap routeId={routeId} kmMarkers={analytics?.kmMarkers ?? null} />
						</div>
					)}

					{analytics && (analytics.splits.length || analytics.hrZones) && (
						<SplitsPanel analytics={analytics} />
					)}

					<div className="panel" style={{ marginBottom: '1rem' }}>
						<div className="grid grid-2">
							<p>
								<span className="muted">Weather</span>
								<br />
								{r.weather || '—'}
							</p>
							<p>
								<span className="muted">Surface</span>
								<br />
								{r.surface || '—'}
							</p>
							<p>
								<span className="muted">Wanted faster</span>
								<br />
								{r.wanted_faster == null ? '—' : r.wanted_faster ? 'Yes' : 'No'}
							</p>
							<p>
								<span className="muted">Shoes</span>
								<br />
								{r.shoes || '—'}
							</p>
							{r.start_time && (
								<p>
									<span className="muted">Start time</span>
									<br />
									{r.start_time}
								</p>
							)}
						</div>
					</div>
				</>
			)}
		</>
	);
}
