import {
	activityLabel,
	headlineMetric,
	normalizeActivityType,
	showsFeel,
	showsField
} from '$lib/activity';
import { runToActivityForm, toUpdateRunInput } from '$lib/activity-form';
import { HABIT_PLACEHOLDERS, withHabitDefaults } from '$lib/activity-habits';
import { useAuthed, useBodyAreas } from '$lib/auth';
import { bodyScoreRows, rowsToBodyScores } from '$lib/body-scores';
import { gearKindForActivity, gearMetaForActivity, gearPickerOptions } from '$lib/gear';
import {
	createActivityGroupFn,
	deleteRun,
	saveHrMax,
	updateRun,
	type UpdateRunInput
} from '$lib/server/functions';
import {
	exerciseTotalLabel,
	formatSetDisplay,
	formatSetTop,
	parseStrengthNotes,
	topSet
} from '$lib/strength';
import { activityTitlePart } from '$lib/title';
import { cn } from '$lib/ui';
import { Link, useRouter, getRouteApi  } from '@tanstack/react-router';
import { lazy, Suspense, useEffect, useState } from 'react';
import { ActivityForm } from '../ActivityForm';
import { BestEffortBadges } from '../BestEffortBadges';
import { EditButton, TrashIcon } from '../DeleteButton';
import { FeelAiDialog } from '../FeelAiDialog';
import { GearField } from '../GearField';
import { FuelTryLine } from '../FuelParts';
import { exportActivityGpx, GpsRepair } from '../GpsRepair';
import { ActivityIcon, Icon } from '../Icon';
import { MoreMenu } from '../MoreMenu';
import { RouteChip } from '../RouteChip';
import { SplitsPanel } from '../SplitsPanel';
import {
	Button,
	ConfirmDialog,
	Dialog,
	MapBadge,
	Metric,
	Metrics,
	PageHero,
	Panel,
	PanelTitle,
	errorMessage,
	useLeaveGuard,
	useSnackbar
} from '../ui';
import { buttonClass } from '../ui/Button';
import { runTitleClass } from '../ui/Chrome';
import { fieldLabel, InlineText } from './InlineText';
import { FeelTile } from './FeelTile';
import { routeIdFrom } from './route-id';

const RouteMap = lazy(() =>
	import('../RouteMap').then((m) => ({ default: m.RouteMap }))
);
const runDetailRoute = getRouteApi('/runs/$slug');

export function RunDetail() {
	const {
		run: r,
		analytics,
		gps,
		gear,
		gearWear,
		hrMaxManual,
		hrMaxAllTime,
		bestEfforts,
		plannedRoute,
		repairRoutes,
		gpsContextTracks,
		calendar,
		group,
		groupOptions,
		habits,
		fuel
	} = runDetailRoute.useLoaderData();
	const router = useRouter();
	const authed = useAuthed();
	const bodyAreas = useBodyAreas();
	const snack = useSnackbar();
	const { edit: editFromSearch } = runDetailRoute.useSearch();
	const editing = authed && Boolean(editFromSearch);
	/** False until a field in the edit form actually differs from its default. */
	const [formDirty, setFormDirty] = useState(false);
	useEffect(() => {
		if (!editing) setFormDirty(false);
	}, [editing]);
	const { guard: leaveGuard, allowNextLeave } = useLeaveGuard({ dirty: editing && formDirty });

	async function onSaveHrMax(hrMax: number | null) {
		await saveHrMax({ data: hrMax });
		await router.invalidate();
	}

	const [pendingDelete, setPendingDelete] = useState(false);
	const [feelAiOpen, setFeelAiOpen] = useState(false);
	const [groupOpen, setGroupOpen] = useState(false);
	const [groupPick, setGroupPick] = useState<number[]>([]);
	const [downloading, setDownloading] = useState(false);

	const viewGearKind = gearKindForActivity(r.activity_type);
	const viewGearMeta = gearMetaForActivity(r.activity_type);
	const ritual = withHabitDefaults(r.activity_type, habits, {
		before: r.before_notes,
		after: r.after_notes
	});

	const bodyRows = bodyScoreRows(r.body_scores, bodyAreas);

	const hrFill =
		r.avg_hr != null && r.max_hr != null && r.max_hr > 0
			? Math.min(100, Math.round((r.avg_hr / r.max_hr) * 100))
			: null;
	const routeId = r.route ? routeIdFrom(r.route, r.strava_id) : '';
	const strength =
		normalizeActivityType(r.activity_type) === 'strength' ? parseStrengthNotes(r.notes) : null;
	const metric = headlineMetric(r);
	const metricSub =
		metric.unit === '' ? 'duration' : metric.unit === 'km/h' ? 'avg km/h' : 'pace /km';

	function startEditing() {
		void router.navigate({
			to: '/runs/$slug',
			params: { slug: r.slug },
			search: { edit: true }
		});
	}

	function requestLeaveEdit() {
		if (router.history.canGoBack()) {
			router.history.back();
			return;
		}
		void router.navigate({
			to: '/runs/$slug',
			params: { slug: r.slug },
			search: {},
			replace: true
		});
	}

	async function downloadGpx() {
		if (!routeId || gps.issues.length > 0) {
			snack.info('No GPS track to export yet.');
			return;
		}
		setDownloading(true);
		try {
			await exportActivityGpx(r.date, r.activity_type, routeId);
		} catch (error) {
			snack.error(errorMessage(error, 'Could not export GPX'));
		} finally {
			setDownloading(false);
		}
	}

	/** Full current values as an UpdateRunInput, so a quick-edit only overrides one field. */
	function runToInput(): UpdateRunInput {
		return {
			id: r.id,
			date: r.date,
			activity_type: r.activity_type || 'run',
			session: r.session || 'other',
			effort: r.effort,
			body_scores: r.body_scores,
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
			gear: r.gear || '',
			notes: r.notes || '',
			before_notes: r.before_notes || '',
			after_notes: r.after_notes || ''
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
			{group && (
				<Panel className="mb-4">
					Part of a grouped session.{' '}
					<Link className="font-semibold text-accent-fg" to="/groups/$id" params={{ id: group.id }}>
						Open grouped activity
					</Link>
				</Panel>
			)}
			<PageHero
				className="grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2"
				kicker={
					<>
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
					</>
				}
				kickerClassName="inline-flex items-center gap-1.5 flex-wrap"
				title={
					<>
						{r.date}
						{r.has_map && (
							<MapBadge
								className="ml-[0.15rem] align-middle"
								title="Route map available"
								aria-label="Has route map"
							>
								<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
									<path
										fill="currentColor"
										d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"
									/>
								</svg>
							</MapBadge>
						)}
					</>
				}
				titleClassName={runTitleClass}
				actionsClassName="justify-end! items-center! gap-2! max-sm:w-auto max-sm:[&>button]:flex-none max-sm:[&>details]:flex-none"
				actions={
					!editing ? (
						<>
							{authed && (
								<EditButton compact label="Edit activity" onClick={startEditing} />
							)}
							<MoreMenu
								compact
								items={[
									...(authed
										? [
												{
													label: 'Feel with AI',
													icon: <Icon name="sparkle" size={16} />,
													onClick: () => setFeelAiOpen(true)
												}
											]
										: []),
									...(gps.issues.length === 0 && routeId
										? [
												{
													label: downloading ? 'Exporting…' : 'Download GPX',
													icon: <Icon name="download" size={16} />,
													onClick: () => void downloadGpx(),
													disabled: downloading
												}
											]
										: []),
									...(authed && !group
										? [
												{
													label: 'Group',
													icon: <Icon name="grid" size={16} />,
													onClick: () => {
														setGroupPick([]);
														setGroupOpen(true);
													}
												}
											]
										: []),
									...(authed
										? [
												{
													label: 'Delete',
													icon: <TrashIcon className="size-4" />,
													onClick: () => setPendingDelete(true),
													danger: true
												}
											]
										: [])
								]}
							/>
						</>
					) : null
				}
			>
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
			</PageHero>

			{editing ? (
				<ActivityForm
					calendar={calendar}
					gear={gear}
					gearWear={gearWear}
					habits={habits}
					extraGear={[r.gear]}
					runSlug={r.slug}
					onDirtyChange={setFormDirty}
					defaultValues={runToActivityForm({
						...r,
						before_notes: ritual.before,
						after_notes: ritual.after
					})}
					submitLabel="Save changes"
					cancel={
						<Button variant="ghost" type="button" onClick={requestLeaveEdit}>
							Cancel
						</Button>
					}
					onSubmit={async (values) => {
						try {
							const res = await updateRun({ data: toUpdateRunInput(r.id, values) });
							allowNextLeave();
							await router.invalidate();
							await router.navigate({
								to: '/runs/$slug',
								params: { slug: res.slug },
								search: {},
								replace: true
							});
						} catch (err) {
							snack.error(errorMessage(err, 'Update failed'));
						}
					}}
				/>
			) : (
				<>
					<Metrics className="mb-4">
						{showsField(r.activity_type, 'distance') && (
							<Metric emph>
								<b>{r.distance_km ?? '—'}</b>
								<span>km</span>
							</Metric>
						)}
						<Metric emph>
							<b>{metric.value}</b>
							<span>{metricSub}</span>
						</Metric>
						{metric.unit !== '' && (
							<Metric emph>
								<b>{r.time || '—'}</b>
								<span>
									{r.elapsed_time && r.elapsed_time !== r.time
										? `moving · ${r.elapsed_time} elapsed`
										: 'time'}
								</span>
							</Metric>
						)}
						{r.avg_hr != null || r.max_hr != null ? (
							<Metric className="flex-[1.4_1_9rem]">
								<div className="flex items-baseline gap-1">
									<b>{r.avg_hr ?? '—'}</b>
									<span className="text-[0.95rem] text-muted">/</span>
									<strong className="font-display text-[1.05rem] text-warn">
										{r.max_hr ?? '—'}
									</strong>
								</div>
								<span>HR avg / max</span>
								{hrFill != null && (
									<div
										className="mt-[0.45rem] h-1 overflow-hidden rounded-full bg-white/8"
										aria-hidden="true"
									>
										<div
											className="h-full rounded-[inherit] bg-[linear-gradient(90deg,var(--color-accent),var(--color-warn))]"
											style={{ width: `${hrFill}%` }}
										/>
									</div>
								)}
							</Metric>
						) : (
							<Metric>
								<b>—</b>
								<span>HR</span>
							</Metric>
						)}
						{showsField(r.activity_type, 'elevation') && (
							<Metric>
								<b>{r.elev_gain != null ? r.elev_gain : '—'}</b>
								<span>elev m</span>
							</Metric>
						)}
						{showsField(r.activity_type, 'cadence') && (
							<Metric>
								<b>{r.cadence ?? '—'}</b>
								<span>cadence</span>
							</Metric>
						)}
						{r.calories != null && (
							<Metric>
								<b>{r.calories}</b>
								<span>kcal</span>
							</Metric>
						)}
						{r.kilojoules != null && (
							<Metric>
								<b>{r.kilojoules}</b>
								<span>kJ</span>
							</Metric>
						)}
						{r.max_speed != null && (
							<Metric>
								<b>{r.max_speed}</b>
								<span>max km/h</span>
							</Metric>
						)}
					</Metrics>

					<Metrics className="mb-5">
						{showsFeel(r.activity_type, 'effort') && (
							<FeelTile
								editable={authed}
								label="effort"
								value={r.effort}
								min={1}
								max={10}
								onSave={(v) => patchRun({ effort: v })}
							/>
						)}
						{showsFeel(r.activity_type, 'energy') && (
							<FeelTile
								editable={authed}
								label="energy"
								value={r.energy}
								min={1}
								max={10}
								onSave={(v) => patchRun({ energy: v })}
							/>
						)}
						{showsFeel(r.activity_type, 'body') &&
							bodyRows.map((row, i) => (
								<FeelTile
									key={row.note_id ?? row.area}
									editable={authed}
									label={row.area.toLowerCase()}
									value={row.score}
									min={0}
									max={10}
									onSave={(v) =>
										patchRun({
											body_scores: rowsToBodyScores(
												bodyRows.map((x, j) => (j === i ? { ...x, score: v } : x))
											)
										})
									}
								/>
							))}
						{showsFeel(r.activity_type, 'legs') && (
							<FeelTile
								editable={authed}
								label="legs"
								value={r.legs}
								min={0}
								max={10}
								onSave={(v) => patchRun({ legs: v })}
							/>
						)}
					</Metrics>

					{strength && strength.exercises.length > 0 && (
						<Panel className="mb-4">
							<div className="mb-[0.85rem] flex flex-wrap items-baseline gap-x-[0.85rem] gap-y-[0.45rem]">
								<PanelTitle>Sets</PanelTitle>
								<p className={cn('text-muted', 'text-[0.85rem]')}>weight, reps, or time</p>
							</div>
							<div className="hidden grid-cols-[minmax(6rem,1.4fr)_2fr_auto_auto] items-center gap-x-[0.9rem] gap-y-1.5 border-b border-line py-[0.32rem] pb-1.5 text-[0.72rem] tracking-[0.06em] text-muted uppercase sm:grid">
								<span>Exercise</span>
								<span>Sets</span>
								<span>Top</span>
								<span>Total</span>
							</div>
							{strength.exercises.map((ex, i) => {
								const t = topSet(ex);
								return (
									<div
										className="grid grid-cols-[minmax(6rem,1.4fr)_2fr_auto_auto] items-center gap-x-[0.9rem] gap-y-1.5 border-b border-[rgba(232,240,226,0.06)] py-[0.32rem] text-[0.9rem] last:border-b-0 max-sm:grid-cols-1 max-sm:gap-[0.2rem] max-sm:py-3"
										key={i}
									>
										<span className="min-w-0 wrap-break-word max-sm:font-semibold">{ex.name}</span>
										<span className={cn('text-muted', 'min-w-0 wrap-break-word')}>
											{ex.sets.map((s) => formatSetDisplay(s, ex.kind)).join(', ')}
										</span>
										<span className="font-display font-bold text-accent-fg">
											<span className="mr-1.5 font-sans text-[0.72rem] font-normal tracking-wider text-muted uppercase sm:hidden">
												Top
											</span>
											{t ? formatSetTop(t, ex.kind) : '—'}
										</span>
										<span className={'text-muted'}>
											<span className="mr-1.5 font-sans text-[0.72rem] tracking-wider uppercase sm:hidden">
												Total
											</span>
											{exerciseTotalLabel(ex)}
										</span>
									</div>
								);
							})}
						</Panel>
					)}

					<GpsRepair
						runId={r.id}
						slug={r.slug}
						date={r.date}
						activityType={r.activity_type}
						gps={gps}
						plannedRoute={plannedRoute}
						repairRoutes={repairRoutes}
						contextTracks={gpsContextTracks}
						hasMap={r.has_map}
						routeId={routeId}
						authed={authed}
						groupedSessionId={group?.id}
					/>

					{r.route && routeId && (
						<Panel className="mb-4 overflow-hidden p-0">
							<div className="p-[1.1rem_1.2rem_0.6rem]">
								<PanelTitle className="m-0">Route</PanelTitle>
							</div>
							<Suspense fallback={<p className="p-4 text-sm text-muted">Loading map…</p>}>
								<RouteMap
									routeId={routeId}
									activityType={r.activity_type}
									kmMarkers={analytics?.kmMarkers ?? null}
								/>
							</Suspense>
						</Panel>
					)}

					{bestEfforts && bestEfforts.length > 0 && (
						<Panel className="mb-4">
							<div className="mb-[0.85rem] flex flex-wrap items-baseline gap-x-[0.85rem] gap-y-[0.45rem]">
								<PanelTitle>Best efforts</PanelTitle>
								<p className={cn('text-muted', 'text-[0.85rem]')}>
									Top 3 all-time for this distance
								</p>
							</div>
							<BestEffortBadges highlights={bestEfforts} />
						</Panel>
					)}

					{analytics && (analytics.splits.length || analytics.hrZones) && (
						<SplitsPanel
							analytics={analytics}
							hrMaxManual={hrMaxManual}
							hrMaxAllTime={hrMaxAllTime}
							onSaveHrMax={authed ? onSaveHrMax : undefined}
						/>
					)}

					{fuel.length > 0 && (
						<Panel className="mb-4">
							<div className="mb-[0.6rem] flex flex-wrap items-baseline gap-x-[0.85rem] gap-y-[0.45rem]">
								<PanelTitle>Fuel</PanelTitle>
								<Link to="/fuel" className={cn('text-muted', 'text-[0.85rem]')}>
									Fuel log
								</Link>
							</div>
							{fuel.map((entry) => (
								<FuelTryLine key={entry.id} entry={entry} showItem showPhase />
							))}
						</Panel>
					)}

					<Panel className="mb-4">
						<div className="mb-[0.9rem] flex flex-wrap items-baseline gap-x-[0.85rem] gap-y-[0.45rem]">
							<PanelTitle>Notes &amp; conditions</PanelTitle>
							<p className={cn('text-muted', 'text-[0.85rem]')}>
								{authed ? 'Tap a field to update it' : 'Conditions for this session'}
							</p>
						</div>
						<div className="mb-4 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-3">
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
							{showsField(r.activity_type, 'gear') &&
								viewGearKind &&
								viewGearMeta &&
								(authed ? (
									<GearField
										options={gearPickerOptions(gear[viewGearKind], [r.gear])}
										wear={gearWear[viewGearKind]}
										defaultValue={r.gear || ''}
										label={viewGearMeta.label}
										placeholder={viewGearMeta.customPlaceholder}
										activeHint={viewGearMeta.activeLabel.toLowerCase()}
										immediate
										onChange={(v) => {
											void patchRun({ gear: v });
										}}
									/>
								) : (
									<InlineText
										label={viewGearMeta.label}
										value={r.gear || ''}
										placeholder={viewGearMeta.customPlaceholder}
										editable={false}
										onSave={async () => {}}
									/>
								))}
							{showsFeel(r.activity_type, 'wanted_faster') && (
								<div className="flex min-w-0 flex-col gap-[0.28rem]">
									<span className={fieldLabel}>Wanted faster</span>
									{authed ? (
										<div
											className="flex w-full gap-[0.3rem]"
											role="group"
											aria-label="Wanted faster"
										>
											{(['Y', 'N', ''] as const).map((opt) => {
												const active =
													(opt === 'Y' && r.wanted_faster === true) ||
													(opt === 'N' && r.wanted_faster === false) ||
													(opt === '' && r.wanted_faster == null);
												return (
													<button
														key={opt || 'none'}
														type="button"
														className={cn(
															'font-inherit min-h-11 min-w-0 flex-1 cursor-pointer rounded-lg border p-[0.5rem_0.4rem] text-[0.9rem] hover:border-accent active:border-accent',
															active
																? 'border-accent bg-accent/12 font-semibold text-fg'
																: 'border-line bg-white/3 text-muted'
														)}
														onClick={() => {
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
									) : (
										<span className="text-[0.9rem] text-muted">
											{r.wanted_faster === true ? 'Yes' : r.wanted_faster === false ? 'No' : '—'}
										</span>
									)}
								</div>
							)}
						</div>
						{!strength && (
							<InlineText
								label="Notes & mid-run context"
								value={r.notes || ''}
								multiline
								placeholder="Felt a twinge at 4 km, backed off. Legs opened up after the turnaround…"
								editable={authed}
								onSave={(v) => patchRun({ notes: v })}
							/>
						)}
						<InlineText
							label="Before"
							value={r.before_notes || ritual.before}
							multiline
							placeholder={HABIT_PLACEHOLDERS[normalizeActivityType(r.activity_type)].before}
							editable={authed}
							onSave={(v) => patchRun({ before_notes: v })}
						/>
						<InlineText
							label="After"
							value={r.after_notes || ritual.after}
							multiline
							placeholder={HABIT_PLACEHOLDERS[normalizeActivityType(r.activity_type)].after}
							editable={authed}
							onSave={(v) => patchRun({ after_notes: v })}
						/>
						{r.start_time && (
							<p className={cn('text-muted', 'mt-[0.4rem] mb-0 text-[0.82rem]')}>
								Started {r.start_time}
							</p>
						)}
					</Panel>
				</>
			)}
			<Dialog
				open={groupOpen}
				title="Group with other activities"
				onClose={() => setGroupOpen(false)}
				actions={
					<>
						<button
							type="button"
							className={buttonClass({ variant: 'ghost' })}
							onClick={() => setGroupOpen(false)}
						>
							Cancel
						</button>
						<button
							type="button"
							className={buttonClass()}
							disabled={groupPick.length < 1}
							onClick={async () => {
								try {
									const res = await createActivityGroupFn({
										data: { ids: [r.id, ...groupPick] }
									});
									setGroupOpen(false);
									await router.invalidate();
									await router.navigate({ to: '/groups/$id', params: { id: res.id } });
								} catch (err) {
									snack.error(errorMessage(err, 'Could not group those activities.'));
								}
							}}
						>
							Group
						</button>
					</>
				}
			>
				<p className={cn('text-muted', 'm-0')}>
					Imported GPX files stay as they are. Same calendar day is listed first.
				</p>
				<div className="grid max-h-[50vh] gap-1.5 overflow-y-auto">
					{(groupOptions ?? [])
						.filter((o) => !o.grouped)
						.slice()
						.sort((a, b) => {
							const sameA = a.date === r.date ? 0 : 1;
							const sameB = b.date === r.date ? 0 : 1;
							return sameA - sameB || b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug);
						})
						.map((opt) => {
							const on = groupPick.includes(opt.id);
							return (
								<button
									key={opt.id}
									type="button"
									className={cn(
										'flex min-h-11 items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left',
										on ? 'border-accent bg-accent/10' : 'border-line bg-transparent'
									)}
									aria-pressed={on}
									onClick={() =>
										setGroupPick((prev) =>
											prev.includes(opt.id)
												? prev.filter((id) => id !== opt.id)
												: [...prev, opt.id]
										)
									}
								>
									<span>
										<strong>{opt.date}</strong>
										<span className={cn('text-muted', 'block text-[0.82rem]')}>
											{[
												activityLabel(opt.activity_type),
												opt.start_time || null,
												opt.distance_km != null ? `${opt.distance_km} km` : null
											]
												.filter(Boolean)
												.join(' · ')}
										</span>
									</span>
									<span className="font-bold text-accent-fg">{on ? '✓' : ''}</span>
								</button>
							);
						})}
				</div>
			</Dialog>
			<FeelAiDialog
				open={feelAiOpen}
				run={r}
				gear={gear}
				gearWear={gearWear}
				onClose={() => setFeelAiOpen(false)}
			/>
			{leaveGuard}
			<ConfirmDialog
				open={pendingDelete}
				title="Delete this activity?"
				description={`${r.date}${r.day ? ` · ${r.day}` : ''}. This cannot be undone.`}
				onClose={() => setPendingDelete(false)}
				onConfirm={async () => {
					await deleteRun({ data: r.id });
					await router.invalidate();
					router.navigate({ to: '/timeline' });
				}}
			/>
		</>
	);
}

