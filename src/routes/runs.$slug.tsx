import { useState } from 'react';
import { createFileRoute, notFound, useRouter } from '@tanstack/react-router';
import {
	getRunDetail,
	updateRun,
	deleteRun,
	saveHrMax,
	type UpdateRunInput
} from '$lib/server/functions';
import { dayFromIsoDate } from '$lib/format';
import { weekNumberForDate } from '$lib/plan';
import {
	ACTIVITY_TYPES,
	activityLabel,
	headlineMetric,
	normalizeActivityType,
	showsField
} from '$lib/activity';
import { parseStrengthNotes, topSet, exerciseVolume } from '$lib/strength';
import { RouteMap } from '../components/RouteMap';
import { SplitsPanel } from '../components/SplitsPanel';
import { StrengthEditor } from '../components/StrengthEditor';
import { ShoesField } from '../components/ShoesField';
import { WeatherField } from '../components/WeatherField';

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

/** A single value you can click to edit in place, saved on its own (no full form). */
function InlineText({
	label,
	value,
	placeholder,
	multiline = false,
	numeric = false,
	datalistId,
	options,
	onSave
}: {
	label: string;
	value: string;
	placeholder?: string;
	multiline?: boolean;
	numeric?: boolean;
	datalistId?: string;
	options?: string[];
	onSave: (v: string) => Promise<void>;
}) {
	const [editing, setEditing] = useState(false);
	const [val, setVal] = useState(value);
	const [busy, setBusy] = useState(false);

	async function save() {
		setBusy(true);
		try {
			await onSave(val.trim());
			setEditing(false);
		} finally {
			setBusy(false);
		}
	}

	if (!editing) {
		return (
			<div className={`quick-field${multiline ? ' quick-field-wide' : ''}`}>
				<span className="muted quick-label">{label}</span>
				<button
					type="button"
					className="quick-value"
					onClick={() => {
						setVal(value);
						setEditing(true);
					}}
					title="Click to edit"
				>
					{value ? (
						<span className="quick-value-text">{value}</span>
					) : (
						<span className="muted">— add</span>
					)}
					<span className="quick-edit-pencil" aria-hidden="true">
						✎
					</span>
				</button>
			</div>
		);
	}

	return (
		<div className={`quick-field editing${multiline ? ' quick-field-wide' : ''}`}>
			<span className="muted quick-label">{label}</span>
			<div className={`quick-edit-row${multiline ? ' col' : ''}`}>
				{multiline ? (
					<textarea
						value={val}
						placeholder={placeholder}
						rows={3}
						autoFocus
						onChange={(e) => setVal(e.target.value)}
					/>
				) : (
					<input
						value={val}
						type={numeric ? 'number' : 'text'}
						placeholder={placeholder}
						list={datalistId}
						autoFocus
						onChange={(e) => setVal(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter') save();
							if (e.key === 'Escape') setEditing(false);
						}}
					/>
				)}
				{datalistId && options && (
					<datalist id={datalistId}>
						{[...new Set(options.map((o) => o.trim()).filter(Boolean))].map((o) => (
							<option key={o} value={o} />
						))}
					</datalist>
				)}
				<div className="quick-edit-actions">
					<button
						type="button"
						className="btn btn-primary btn-sm"
						onClick={save}
						disabled={busy}
					>
						{busy ? '…' : 'Save'}
					</button>
					<button
						type="button"
						className="btn btn-ghost btn-sm"
						onClick={() => setEditing(false)}
						disabled={busy}
					>
						Cancel
					</button>
				</div>
			</div>
		</div>
	);
}

/** A metric tile (like the pace/HR tiles) that you click to edit the score in place. */
function FeelTile({
	label,
	value,
	min,
	max,
	onSave
}: {
	label: string;
	value: number | null;
	min: number;
	max: number;
	onSave: (v: number | null) => void;
}) {
	const [editing, setEditing] = useState(false);
	const [val, setVal] = useState(value != null ? String(value) : '');

	function commit() {
		setEditing(false);
		const t = val.trim();
		if (t === '') {
			onSave(null);
			return;
		}
		const n = Math.max(min, Math.min(max, Math.round(Number(t))));
		onSave(Number.isFinite(n) ? n : null);
	}

	if (editing) {
		return (
			<div className="metric metric-emph metric-edit">
				<input
					type="number"
					min={min}
					max={max}
					value={val}
					autoFocus
					onChange={(e) => setVal(e.target.value)}
					onBlur={commit}
					onKeyDown={(e) => {
						if (e.key === 'Enter') commit();
						if (e.key === 'Escape') setEditing(false);
					}}
				/>
				<span>{label}</span>
			</div>
		);
	}
	return (
		<button
			type="button"
			className="metric metric-emph metric-editable"
			title="Click to edit"
			onClick={() => {
				setVal(value != null ? String(value) : '');
				setEditing(true);
			}}
		>
			<b>{value ?? '—'}</b>
			<span>{label}</span>
		</button>
	);
}

function RunDetail() {
	const { run: r, analytics, shoes, hrMaxManual, hrMaxAllTime } = Route.useLoaderData();
	const router = useRouter();

	async function onSaveHrMax(hrMax: number | null) {
		await saveHrMax({ data: hrMax });
		await router.invalidate();
	}

	const [editing, setEditing] = useState(false);
	const [editDate, setEditDate] = useState(r.date);
	const [editActivity, setEditActivity] = useState(r.activity_type || 'run');
	const [editNotes, setEditNotes] = useState(r.notes);
	const [editWeather, setEditWeather] = useState(r.weather || '');
	const [editStart, setEditStart] = useState(r.start_time || '');
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
			session: editActivity === 'run' ? String(fd.get('session') ?? 'easy') : r.session || 'other',
			effort: num('effort'),
			shins: num('shins'),
			legs: num('legs'),
			energy: num('energy'),
			weather: editWeather,
			surface: String(fd.get('surface') ?? ''),
			wanted_faster: wanted === 'Y' ? true : wanted === 'N' ? false : null,
			distance_km: num('distance_km'),
			start_time: editStart,
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

	/** Full current values as an UpdateRunInput, so a quick-edit only overrides one field. */
	function runToInput(): UpdateRunInput {
		return {
			slug: r.slug,
			date: r.date,
			activity_type: r.activity_type || 'run',
			session: r.session || 'other',
			effort: r.effort,
			shins: r.shins,
			legs: r.legs,
			energy: r.energy,
			weather: r.weather || '',
			surface: r.surface || '',
			wanted_faster: r.wanted_faster,
			distance_km: r.distance_km,
			start_time: r.start_time || '',
			time: r.time || '',
			avg_pace: r.avg_pace || '',
			avg_hr: r.avg_hr,
			max_hr: r.max_hr,
			elev_gain: r.elev_gain,
			cadence: r.cadence,
			shoes: r.shoes || '',
			notes: r.notes || ''
		};
	}

	/** Patch a few fields inline without opening the full edit form. */
	async function patchRun(partial: Partial<UpdateRunInput>) {
		try {
			await updateRun({ data: { ...runToInput(), ...partial } });
			await router.invalidate();
		} catch (err) {
			setMessage(err instanceof Error ? err.message : 'Quick save failed');
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
						</>
					)}
				</div>
			</section>

			{message && <div className="flash">{message}</div>}

			{editing ? (
				<form className="panel form" method="POST" onSubmit={onUpdate}>
					<div className="form-section">
					<h3 className="form-section-title">Activity</h3>
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
						{editActivity === 'run' && (
							<label className="field">
								<span>Session</span>
								<select name="session" defaultValue={r.session}>
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
						{showsField(editActivity, 'distance') && (
							<label className="field">
								<span>Distance (km)</span>
								<input
									name="distance_km"
									type="number"
									step="0.01"
									defaultValue={r.distance_km ?? ''}
								/>
							</label>
						)}
						<label className="field">
							<span>Start time</span>
							<input
								type="time"
								name="start_time"
								value={editStart}
								onChange={(e) => setEditStart(e.target.value)}
							/>
						</label>
						<label className="field">
							<span>Duration</span>
							<input name="time" placeholder="45:12 or 1:15:01" defaultValue={r.time || ''} />
						</label>
						{showsField(editActivity, 'pace') && (
							<label className="field">
								<span>Avg pace /km</span>
								<input name="avg_pace" placeholder="6:29" defaultValue={r.avg_pace || ''} />
							</label>
						)}
						<label className="field">
							<span>Avg HR</span>
							<input name="avg_hr" type="number" defaultValue={r.avg_hr ?? ''} />
						</label>
						<label className="field">
							<span>Max HR</span>
							<input name="max_hr" type="number" defaultValue={r.max_hr ?? ''} />
						</label>
						{showsField(editActivity, 'elevation') && (
							<label className="field">
								<span>Elev gain (m)</span>
								<input
									name="elev_gain"
									type="number"
									step="0.1"
									defaultValue={r.elev_gain ?? ''}
								/>
							</label>
						)}
						{showsField(editActivity, 'cadence') && (
							<label className="field">
								<span>Cadence</span>
								<input name="cadence" type="number" defaultValue={r.cadence ?? ''} />
							</label>
						)}
					</div>
					</div>

					<div className="form-section">
					<h3 className="form-section-title">How it felt & details</h3>
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
						<WeatherField
							value={editWeather}
							onChange={setEditWeather}
							date={editDate}
							time={editStart}
							duration={r.time}
						/>
						<label className="field">
							<span>Surface</span>
							<input
								name="surface"
								placeholder="asphalt / mixed / trail"
								defaultValue={r.surface || ''}
							/>
						</label>
						<ShoesField
							options={[shoes.active, ...shoes.rotation, r.shoes]}
							defaultValue={r.shoes || ''}
						/>
						<label className="field">
							<span>Wanted to go faster?</span>
							<select name="wanted_faster" defaultValue={wantedValue}>
								<option value="">—</option>
								<option value="Y">Y</option>
								<option value="N">N</option>
							</select>
						</label>
					</div>
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
					<div className="metrics metrics-primary" style={{ marginBottom: '1rem' }}>
						{showsField(r.activity_type, 'distance') && (
							<div className="metric metric-emph">
								<b>{r.distance_km ?? '—'}</b>
								<span>km</span>
							</div>
						)}
						<div className="metric metric-emph">
							<b>{metric.value}</b>
							<span>{metricSub}</span>
						</div>
						{metric.unit !== '' && (
							<div className="metric metric-emph">
								<b>{r.time || '—'}</b>
								<span>
									{r.elapsed_time && r.elapsed_time !== r.time
										? `moving · ${r.elapsed_time} elapsed`
										: 'time'}
								</span>
							</div>
						)}
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
						{showsField(r.activity_type, 'elevation') && (
							<div className="metric">
								<b>{r.elev_gain != null ? r.elev_gain : '—'}</b>
								<span>elev m</span>
							</div>
						)}
						{showsField(r.activity_type, 'cadence') && (
							<div className="metric">
								<b>{r.cadence ?? '—'}</b>
								<span>cadence</span>
							</div>
						)}
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
					</div>

					<div className="metrics feel-metrics" style={{ marginBottom: '1.25rem' }}>
						<FeelTile label="effort" value={r.effort} min={1} max={10} onSave={(v) => patchRun({ effort: v })} />
						<FeelTile label="energy" value={r.energy} min={1} max={10} onSave={(v) => patchRun({ energy: v })} />
						<FeelTile label="shins" value={r.shins} min={0} max={10} onSave={(v) => patchRun({ shins: v })} />
						<FeelTile label="legs" value={r.legs} min={0} max={10} onSave={(v) => patchRun({ legs: v })} />
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
						<SplitsPanel
							analytics={analytics}
							hrMaxManual={hrMaxManual}
							hrMaxAllTime={hrMaxAllTime}
							onSaveHrMax={onSaveHrMax}
						/>
					)}

					<div className="panel quick-panel" style={{ marginBottom: '1rem' }}>
						<div className="splits-head">
							<h3>Notes &amp; conditions</h3>
							<p className="muted splits-sub">Click any value to update it</p>
						</div>
						<div className="quick-grid">
							<InlineText
								label="Weather"
								value={r.weather || ''}
								placeholder="14°C drizzle"
								onSave={(v) => patchRun({ weather: v })}
							/>
							<InlineText
								label="Surface"
								value={r.surface || ''}
								placeholder="asphalt / trail"
								onSave={(v) => patchRun({ surface: v })}
							/>
							<InlineText
								label="Shoes"
								value={r.shoes || ''}
								placeholder="Shoe"
								datalistId="quick-shoes"
								options={[shoes.active, ...shoes.rotation, r.shoes]}
								onSave={(v) => patchRun({ shoes: v })}
							/>
							<div className="quick-field">
								<span className="muted quick-label">Wanted faster</span>
								<div className="quick-wanted">
									{(['Y', 'N', ''] as const).map((opt) => {
										const active =
											(opt === 'Y' && r.wanted_faster === true) ||
											(opt === 'N' && r.wanted_faster === false) ||
											(opt === '' && r.wanted_faster == null);
										return (
											<button
												key={opt || 'none'}
												type="button"
												className={`chip${active ? ' active' : ''}`}
												onClick={() =>
													patchRun({
														wanted_faster: opt === 'Y' ? true : opt === 'N' ? false : null
													})
												}
											>
												{opt === 'Y' ? 'Yes' : opt === 'N' ? 'No' : '—'}
											</button>
										);
									})}
								</div>
							</div>
						</div>
						{!strength && (
							<InlineText
								label="Notes & mid-run context"
								value={r.notes || ''}
								multiline
								placeholder="Shins flared at 4 km, backed off. Legs opened up after the turnaround…"
								onSave={(v) => patchRun({ notes: v })}
							/>
						)}
						{r.start_time && <p className="muted quick-start">Started {r.start_time}</p>}
					</div>
				</>
			)}
		</>
	);
}
