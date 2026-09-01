import {
    ACTIVITY_TYPES,
    activityLabel,
    headlineMetric,
    normalizeActivityType,
    paceFieldLabel,
    showsFeel,
    showsField
} from '$lib/activity';
import { useAuthed } from '$lib/auth';
import { dayFromIsoDate } from '$lib/format';
import { weekNumberForDate } from '$lib/plan';
import {
    deleteRun,
    getRunDetail,
    saveHrMax,
    updateRun,
    type UpdateRunInput
} from '$lib/server/functions';
import { shoePickerOptions } from '$lib/shoes';
import {
    exerciseTotalLabel,
    formatSetDisplay,
    formatSetTop,
    parseStrengthNotes,
    topSet
} from '$lib/strength';
import { cn, ui } from '$lib/ui';
import { createFileRoute, notFound, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { BestEffortBadges } from '../components/BestEffortBadges';
import { DeleteButton } from '../components/DeleteButton';
import { ConfirmDialog } from '../components/Dialog';
import { FeelChips, WantedFasterChips } from '../components/FeelChips';
import { ActivityIcon, Icon } from '../components/Icon';
import { RouteChip } from '../components/RouteChip';
import { RouteMap } from '../components/RouteMap';
import { ShoesField } from '../components/ShoesField';
import { errorMessage, useSnackbar } from '../components/Snackbar';
import { SplitsPanel } from '../components/SplitsPanel';
import { StrengthEditor } from '../components/StrengthEditor';
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

const fieldLabel = cn(ui.muted, 'text-[0.72rem] uppercase tracking-[0.05em]');
const fieldBox =
	'w-full min-h-11 min-w-0 text-left bg-white/[0.03] border border-line rounded-lg p-[0.65rem_0.75rem] [overflow-wrap:anywhere]';

/** A single value you can tap to edit in place, saved on its own (no full form). */
function InlineText({
	label,
	value,
	placeholder,
	multiline = false,
	numeric = false,
	datalistId,
	options,
	editable = true,
	onSave
}: {
	label: string;
	value: string;
	placeholder?: string;
	multiline?: boolean;
	numeric?: boolean;
	datalistId?: string;
	options?: string[];
	editable?: boolean;
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

	const wrap = cn('flex flex-col gap-[0.28rem] min-w-0', (multiline || editing) && 'col-span-full');

	if (!editing) {
		return (
			<div className={wrap}>
				<span className={fieldLabel}>{label}</span>
				{editable ? (
					<button
						type="button"
						className={cn(
							fieldBox,
							'flex items-start justify-between gap-3 text-inherit font-inherit cursor-pointer hover:border-accent hover:bg-[rgba(200,242,90,0.06)] active:border-accent group/qv'
						)}
						onClick={() => {
							setVal(value);
							setEditing(true);
						}}
						title="Tap to edit"
					>
						{value ? (
							<span className="whitespace-pre-wrap break-words min-w-0 flex-1">{value}</span>
						) : (
							<span className={ui.muted}>— add</span>
						)}
						<span
							className="shrink-0 mt-[0.15rem] text-accent text-[0.85rem] sm:opacity-0 group-hover/qv:opacity-100"
							aria-hidden="true"
						>
							✎
						</span>
					</button>
				) : (
					<div className={fieldBox}>
						{value ? (
							<span className="whitespace-pre-wrap break-words">{value}</span>
						) : (
							<span className={ui.muted}>—</span>
						)}
					</div>
				)}
			</div>
		);
	}

	return (
		<div className={wrap}>
			<span className={fieldLabel}>{label}</span>
			<div className="flex flex-col gap-[0.45rem] sm:flex-row sm:items-start">
				{multiline ? (
					<textarea
						className="flex-1 min-w-0 text-base"
						value={val}
						placeholder={placeholder}
						rows={5}
						autoFocus
						onChange={(e) => setVal(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Escape') setEditing(false);
						}}
					/>
				) : (
					<input
						className="flex-1 min-w-0 text-base"
						value={val}
						type={numeric ? 'number' : 'text'}
						inputMode={numeric ? 'decimal' : 'text'}
						placeholder={placeholder}
						list={datalistId}
						enterKeyHint="done"
						autoComplete="off"
						autoCorrect="off"
						autoFocus
						onChange={(e) => setVal(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter') void save();
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
				<div className="flex gap-[0.35rem] shrink-0 max-sm:w-full sm:justify-end">
					<button
						type="button"
						className={cn(ui.btnPrimary, ui.btnSm, 'max-sm:flex-1')}
						onClick={() => void save()}
						disabled={busy}
					>
						{busy ? '…' : 'Save'}
					</button>
					<button
						type="button"
						className={cn(ui.btnGhost, ui.btnSm, 'max-sm:flex-1')}
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
	editable = true,
	onSave
}: {
	label: string;
	value: number | null;
	min: number;
	max: number;
	editable?: boolean;
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
			<div className={cn(ui.metric, ui.metricEmph, 'pt-2 max-sm:flex-[1_1_100%]')}>
				<input
					className="font-display text-[1.35rem] min-h-11 px-2 py-[0.35rem] rounded-lg w-full"
					type="number"
					inputMode="numeric"
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
			className={cn(
				ui.metric,
				ui.metricEmph,
				'block w-full text-left font-inherit text-inherit',
				editable &&
					'cursor-pointer hover:border-accent hover:bg-[rgba(200,242,90,0.1)] active:border-accent active:bg-[rgba(200,242,90,0.1)]'
			)}
			title={editable ? 'Click to edit' : undefined}
			disabled={!editable}
			onClick={() => {
				if (!editable) return;
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
	const { run: r, analytics, shoes, shoeWear, hrMaxManual, hrMaxAllTime, bestEfforts, plannedRoute } =
		Route.useLoaderData();
	const router = useRouter();
	const authed = useAuthed();
	const snack = useSnackbar();

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
	const [pendingDelete, setPendingDelete] = useState(false);

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
		setPendingDelete(true);
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
			snack.error(errorMessage(err, 'Update failed'));
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
			snack.error(errorMessage(err, 'Quick save failed'));
		}
	}

	return (
		<>
			<section className={ui.hero}>
				<div>
					<p className={cn(ui.muted, 'inline-flex items-center gap-1.5 flex-wrap')}>
						<ActivityIcon type={r.activity_type} size={14} />
						{[
							activityLabel(r.activity_type),
							r.day || null,
							r.session && r.session !== 'other' ? r.session : null,
							r.week != null ? `week ${r.week}` : null,
							r.start_time ? `started ${r.start_time}` : null,
							r.place || r.country ? [r.place, r.country].filter(Boolean).join(', ') : null
						]
							.filter(Boolean)
							.join(' · ')}
					</p>
					<h1 className={ui.runTitle}>
						{r.date}
						{r.has_map && (
							<span
								className={cn(ui.mapBadge, 'ml-[0.15rem] align-middle')}
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
					{plannedRoute && (
						<RouteChip
							slug={plannedRoute.slug}
							name={plannedRoute.name}
							distanceKm={plannedRoute.distance_km}
							prefix="Route"
						/>
					)}
					{!editing && (strength ? strength.extra : r.notes) && (
						<p className="max-sm:line-clamp-3">{strength ? strength.extra : r.notes}</p>
					)}
				</div>
				<div className={ui.actions}>
					{authed && !editing && (
						<>
							<button
								className={cn(ui.btnGhost, ui.btnIcon)}
								type="button"
								aria-label="Edit activity"
								title="Edit activity"
								onClick={startEditing}
							>
								<Icon name="pencil" size={16} />
							</button>
							<DeleteButton
								label={`Delete ${activityLabel(r.activity_type).toLowerCase()} ${r.date}`}
								onClick={onDelete}
							/>
						</>
					)}
				</div>
			</section>

			{editing ? (
				<form className={ui.form} method="POST" onSubmit={onUpdate}>
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
								value={editDate}
								onChange={(e) => setEditDate(e.target.value)}
							/>
							<span className={cn(ui.fieldHint, ui.muted)}>
								{derivedDay}
								{derivedWeek != null && ` · week ${derivedWeek}`}
							</span>
						</label>
						<label className={ui.field}>
							<span className={ui.req}>Activity</span>
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
							<label className={ui.field}>
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

					<div className={ui.formSection}>
					<h3 className={ui.formSectionTitle}>Numbers</h3>
					<div className={ui.formGrid}>
						{showsField(editActivity, 'distance') && (
							<label className={ui.field}>
								<span>Distance (km)</span>
								<input
									name="distance_km"
									type="text"
									inputMode="decimal"
									defaultValue={r.distance_km ?? ''}
								/>
							</label>
						)}
						<label className={ui.field}>
							<span className={ui.req}>Start time</span>
							<input
								type="time"
								name="start_time"
								required
								value={editStart}
								onChange={(e) => setEditStart(e.target.value)}
							/>
						</label>
						<label className={ui.field}>
							<span>Duration</span>
							<input name="time" placeholder="45:12 or 1:15:01" defaultValue={r.time || ''} />
						</label>
						{showsField(editActivity, 'pace') && (
							<label className={ui.field}>
								<span>{paceFieldLabel(editActivity)}</span>
								<input
									name="avg_pace"
									inputMode="decimal"
									placeholder="6:29"
									defaultValue={r.avg_pace || ''}
								/>
							</label>
						)}
						{showsField(editActivity, 'hr') && (
							<label className={ui.field}>
								<span>Avg HR</span>
								<input
									name="avg_hr"
									type="text"
									inputMode="numeric"
									defaultValue={r.avg_hr ?? ''}
								/>
							</label>
						)}
						{showsField(editActivity, 'hr') && (
							<label className={ui.field}>
								<span>Max HR</span>
								<input
									name="max_hr"
									type="text"
									inputMode="numeric"
									defaultValue={r.max_hr ?? ''}
								/>
							</label>
						)}
						{showsField(editActivity, 'elevation') && (
							<label className={ui.field}>
								<span>Elev gain (m)</span>
								<input
									name="elev_gain"
									type="text"
									inputMode="decimal"
									defaultValue={r.elev_gain ?? ''}
								/>
							</label>
						)}
						{showsField(editActivity, 'cadence') && (
							<label className={ui.field}>
								<span>Cadence</span>
								<input
									name="cadence"
									type="text"
									inputMode="numeric"
									defaultValue={r.cadence ?? ''}
								/>
							</label>
						)}
					</div>
					</div>

					<div className={ui.formSection}>
					<h3 className={ui.formSectionTitle}>How it felt & details</h3>
					<div className={ui.formGrid}>
						{showsFeel(editActivity, 'effort') && (
							<FeelChips name="effort" label="Effort (1–10)" min={1} max={10} defaultValue={r.effort} />
						)}
						{showsFeel(editActivity, 'shins') && (
							<FeelChips name="shins" label="Shins (0–10)" min={0} max={10} defaultValue={r.shins} />
						)}
						{showsFeel(editActivity, 'legs') && (
							<FeelChips name="legs" label="Legs (0–10)" min={0} max={10} defaultValue={r.legs} />
						)}
						{showsFeel(editActivity, 'energy') && (
							<FeelChips name="energy" label="Energy (1–10)" min={1} max={10} defaultValue={r.energy} />
						)}
						{showsFeel(editActivity, 'wanted_faster') && (
							<WantedFasterChips defaultValue={wantedValue} />
						)}
						{showsField(editActivity, 'weather') && (
							<WeatherField
								value={editWeather}
								onChange={setEditWeather}
								date={editDate}
								time={editStart}
								duration={r.time}
							/>
						)}
						{showsField(editActivity, 'surface') && (
							<label className={ui.field}>
								<span>Surface</span>
								<input
									name="surface"
									placeholder="asphalt / mixed / trail"
									defaultValue={r.surface || ''}
								/>
							</label>
						)}
						{showsField(editActivity, 'shoes') && (
							<ShoesField
								options={shoePickerOptions(shoes, [r.shoes])}
								wear={shoeWear}
								defaultValue={r.shoes || ''}
							/>
						)}
					</div>
					</div>

					{editActivity === 'strength' ? (
						<div className={ui.field}>
							<span>Sets</span>
							<StrengthEditor initial={r.notes} onChange={setEditNotes} />
						</div>
					) : (
						<label className={ui.field}>
							<span>Notes</span>
							<textarea name="notes" defaultValue={r.notes}></textarea>
						</label>
					)}
					</div>

					<div className={cn(ui.actions, ui.stickyActions)}>
						<button className={cn(ui.btnPrimary, ui.stickyPrimary)} type="submit">
							Save changes
						</button>
						<button className={ui.btnGhost} type="button" onClick={() => setEditing(false)}>
							Cancel
						</button>
					</div>
				</form>
			) : (
				<>
					<div className={cn(ui.metrics, 'mb-4')}>
						{showsField(r.activity_type, 'distance') && (
							<div className={cn(ui.metric, ui.metricEmph)}>
								<b>{r.distance_km ?? '—'}</b>
								<span>km</span>
							</div>
						)}
						<div className={cn(ui.metric, ui.metricEmph)}>
							<b>{metric.value}</b>
							<span>{metricSub}</span>
						</div>
						{metric.unit !== '' && (
							<div className={cn(ui.metric, ui.metricEmph)}>
								<b>{r.time || '—'}</b>
								<span>
									{r.elapsed_time && r.elapsed_time !== r.time
										? `moving · ${r.elapsed_time} elapsed`
										: 'time'}
								</span>
							</div>
						)}
						{r.avg_hr != null || r.max_hr != null ? (
							<div className={cn(ui.metric, 'flex-[1.4_1_9rem]')}>
								<div className="flex items-baseline gap-1">
									<b>{r.avg_hr ?? '—'}</b>
									<span className="text-muted text-[0.95rem]">/</span>
									<strong className="font-display text-[1.05rem] text-warn">{r.max_hr ?? '—'}</strong>
								</div>
								<span>HR avg / max</span>
								{hrFill != null && (
									<div className="mt-[0.45rem] h-1 rounded-full bg-white/8 overflow-hidden" aria-hidden="true">
										<div
											className="h-full rounded-[inherit] bg-[linear-gradient(90deg,var(--color-accent),var(--color-warn))]"
											style={{ width: `${hrFill}%` }}
										></div>
									</div>
								)}
							</div>
						) : (
							<div className={ui.metric}>
								<b>—</b>
								<span>HR</span>
							</div>
						)}
						{showsField(r.activity_type, 'elevation') && (
							<div className={ui.metric}>
								<b>{r.elev_gain != null ? r.elev_gain : '—'}</b>
								<span>elev m</span>
							</div>
						)}
						{showsField(r.activity_type, 'cadence') && (
							<div className={ui.metric}>
								<b>{r.cadence ?? '—'}</b>
								<span>cadence</span>
							</div>
						)}
						{r.calories != null && (
							<div className={ui.metric}>
								<b>{r.calories}</b>
								<span>kcal</span>
							</div>
						)}
						{r.kilojoules != null && (
							<div className={ui.metric}>
								<b>{r.kilojoules}</b>
								<span>kJ</span>
							</div>
						)}
						{r.max_speed != null && (
							<div className={ui.metric}>
								<b>{r.max_speed}</b>
								<span>max km/h</span>
							</div>
						)}
					</div>

					<div className={cn(ui.metrics, 'mb-5')}>
						{showsFeel(r.activity_type, 'effort') && (
							<FeelTile editable={authed} label="effort" value={r.effort} min={1} max={10} onSave={(v) => patchRun({ effort: v })} />
						)}
						{showsFeel(r.activity_type, 'energy') && (
							<FeelTile editable={authed} label="energy" value={r.energy} min={1} max={10} onSave={(v) => patchRun({ energy: v })} />
						)}
						{showsFeel(r.activity_type, 'shins') && (
							<FeelTile editable={authed} label="shins" value={r.shins} min={0} max={10} onSave={(v) => patchRun({ shins: v })} />
						)}
						{showsFeel(r.activity_type, 'legs') && (
							<FeelTile editable={authed} label="legs" value={r.legs} min={0} max={10} onSave={(v) => patchRun({ legs: v })} />
						)}
					</div>

					{strength && strength.exercises.length > 0 && (
						<div className={cn(ui.panel, 'mb-4')}>
							<div className="flex flex-wrap items-baseline gap-x-[0.85rem] gap-y-[0.45rem] mb-[0.85rem]">
								<h3>Sets</h3>
								<p className={cn(ui.muted, 'text-[0.85rem]')}>weight, reps, or time</p>
							</div>
							<div className="hidden sm:grid grid-cols-[minmax(6rem,1.4fr)_2fr_auto_auto] gap-x-[0.9rem] gap-y-1.5 items-center py-[0.32rem] border-b border-line text-[0.72rem] uppercase tracking-[0.06em] text-muted pb-1.5">
								<span>Exercise</span>
								<span>Sets</span>
								<span>Top</span>
								<span>Total</span>
							</div>
							{strength.exercises.map((ex, i) => {
								const t = topSet(ex);
								return (
									<div
										className="grid grid-cols-[minmax(6rem,1.4fr)_2fr_auto_auto] gap-x-[0.9rem] gap-y-1.5 items-center py-[0.32rem] border-b border-[rgba(232,240,226,0.06)] text-[0.9rem] last:border-b-0 max-sm:grid-cols-1 max-sm:gap-[0.2rem] max-sm:py-3"
										key={i}
									>
										<span className="min-w-0 break-words max-sm:font-semibold">{ex.name}</span>
										<span className={cn(ui.muted, 'min-w-0 break-words')}>
											{ex.sets.map((s) => formatSetDisplay(s, ex.kind)).join(', ')}
										</span>
										<span className="font-display font-bold text-accent">
											<span className="sm:hidden font-sans font-normal text-muted text-[0.72rem] uppercase tracking-[0.05em] mr-1.5">
												Top
											</span>
											{t ? formatSetTop(t, ex.kind) : '—'}
										</span>
										<span className={ui.muted}>
											<span className="sm:hidden font-sans text-[0.72rem] uppercase tracking-[0.05em] mr-1.5">
												Total
											</span>
											{exerciseTotalLabel(ex)}
										</span>
									</div>
								);
							})}
						</div>
					)}

					{r.route && routeId && (
						<div className={cn(ui.panel, 'mb-4 p-0 overflow-hidden')}>
							<div className="p-[1.1rem_1.2rem_0.6rem]">
								<h3>Route</h3>
							</div>
							<RouteMap routeId={routeId} kmMarkers={analytics?.kmMarkers ?? null} />
						</div>
					)}

					{bestEfforts && bestEfforts.length > 0 && (
						<div className={cn(ui.panel, 'mb-4')}>
							<div className="flex flex-wrap items-baseline gap-x-[0.85rem] gap-y-[0.45rem] mb-[0.85rem]">
								<h3>Best efforts</h3>
								<p className={cn(ui.muted, 'text-[0.85rem]')}>Top 3 all-time for this distance</p>
							</div>
							<BestEffortBadges highlights={bestEfforts} />
						</div>
					)}

					{analytics && (analytics.splits.length || analytics.hrZones) && (
						<SplitsPanel
							analytics={analytics}
							hrMaxManual={hrMaxManual}
							hrMaxAllTime={hrMaxAllTime}
							onSaveHrMax={authed ? onSaveHrMax : undefined}
						/>
					)}

					<div className={cn(ui.panel, 'mb-4')}>
						<div className="flex flex-wrap items-baseline gap-x-[0.85rem] gap-y-[0.45rem] mb-[0.9rem]">
							<h3>Notes &amp; conditions</h3>
							<p className={cn(ui.muted, 'text-[0.85rem]')}>
								{authed ? 'Tap a field to update it' : 'Conditions for this session'}
							</p>
						</div>
						<div className="grid grid-cols-1 gap-3 mb-4 min-w-0 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-3">
							{showsField(r.activity_type, 'weather') && (
								<InlineText
									label="Weather"
									value={r.weather || ''}
									placeholder="14°C drizzle"
									editable={authed}
									onSave={(v) => patchRun({ weather: v })}
								/>
							)}
							{showsField(r.activity_type, 'surface') && (
								<InlineText
									label="Surface"
									value={r.surface || ''}
									placeholder="asphalt / trail"
									editable={authed}
									onSave={(v) => patchRun({ surface: v })}
								/>
							)}
							{showsField(r.activity_type, 'shoes') &&
								(authed ? (
									<ShoesField
										options={shoePickerOptions(shoes, [r.shoes])}
										wear={shoeWear}
										defaultValue={r.shoes || ''}
										immediate
										onChange={(v) => {
											void patchRun({ shoes: v });
										}}
									/>
								) : (
									<InlineText
										label="Shoes"
										value={r.shoes || ''}
										placeholder="Shoe"
										editable={false}
										onSave={async () => {}}
									/>
								))}
							{showsFeel(r.activity_type, 'wanted_faster') && (
								<div className="flex flex-col gap-[0.28rem] min-w-0">
									<span className={fieldLabel}>Wanted faster</span>
									<div className="flex w-full gap-[0.3rem]" role="group" aria-label="Wanted faster">
										{(['Y', 'N', ''] as const).map((opt) => {
											const active =
												(opt === 'Y' && r.wanted_faster === true) ||
												(opt === 'N' && r.wanted_faster === false) ||
												(opt === '' && r.wanted_faster == null);
											return (
												<button
													key={opt || 'none'}
													type="button"
													disabled={!authed}
													className={cn(
														'flex-1 min-h-11 min-w-0 border rounded-lg p-[0.5rem_0.4rem] font-inherit text-[0.9rem]',
														authed && 'cursor-pointer hover:border-accent active:border-accent',
														active
															? 'border-accent bg-[rgba(200,242,90,0.12)] text-fg font-semibold'
															: 'bg-white/[0.03] border-line text-muted'
													)}
													onClick={() => {
														if (!authed) return;
														void patchRun({
															wanted_faster: opt === 'Y' ? true : opt === 'N' ? false : null
														});
													}}
												>
													{opt === 'Y' ? 'Yes' : opt === 'N' ? 'No' : '—'}
												</button>
											);
										})}
									</div>
								</div>
							)}
						</div>
						{!strength && (
							<InlineText
								label="Notes & mid-run context"
								value={r.notes || ''}
								multiline
								placeholder="Shins flared at 4 km, backed off. Legs opened up after the turnaround…"
								editable={authed}
								onSave={(v) => patchRun({ notes: v })}
							/>
						)}
						{r.start_time && (
							<p className={cn(ui.muted, 'mt-[0.4rem] mb-0 text-[0.82rem]')}>
								Started {r.start_time}
							</p>
						)}
					</div>
				</>
			)}
			<ConfirmDialog
				open={pendingDelete}
				title="Delete this activity?"
				description={`${r.date}${r.day ? ` · ${r.day}` : ''}. This cannot be undone.`}
				onClose={() => setPendingDelete(false)}
				onConfirm={async () => {
					await deleteRun({ data: r.slug });
					router.navigate({ to: '/timeline' });
				}}
			/>
		</>
	);
}
