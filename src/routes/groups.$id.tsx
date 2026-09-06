import { activityLabel, headlineMetric, showsField } from '$lib/activity';
import { saveExportedFile, shareOrDownload } from '$lib/activity-export';
import { AuthGate } from '$lib/auth';
import { effortOwnersForBoard, groupedSessionTitle, groupHighlights, groupTypeCaption } from '$lib/group';
import {
    addToActivityGroupFn,
    exportGroupedActivity,
    getGroupDetail,
    removeFromActivityGroupFn,
    ungroupActivitiesFn
} from '$lib/server/functions';
import { cn, ui } from '$lib/ui';
import { createFileRoute, Link, notFound, useRouter } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { BestEffortBadges } from '../components/BestEffortBadges';
import { ConfirmDialog, Dialog } from '../components/Dialog';
import { ActivityTag, Icon } from '../components/Icon';
import { PageHero } from '../components/PageHero';
import { RouteMap } from '../components/RouteMap';
import { errorMessage, useSnackbar } from '../components/Snackbar';
import { SplitsPanel } from '../components/SplitsPanel';

export const Route = createFileRoute('/groups/$id')({
	loader: async ({ params }) => {
		const detail = await getGroupDetail({ data: params.id });
		if (!detail) throw notFound();
		return detail;
	},
	component: GroupDetail
});

function GroupDetail() {
	const {
		group,
		stats,
		members,
		analytics,
		routeIds,
		segments,
		hrMaxManual,
		hrMaxAllTime,
		allRuns,
		groups
	} = Route.useLoaderData();
	const router = useRouter();
	const snack = useSnackbar();
	const [pendingUngroup, setPendingUngroup] = useState(false);
	const [removeSlug, setRemoveSlug] = useState<string | null>(null);
	const [addOpen, setAddOpen] = useState(false);
	const [addPick, setAddPick] = useState<string | null>(null);
	const [exporting, setExporting] = useState(false);

	const title = groupedSessionTitle(group, members.length, stats.date);
	const metric = headlineMetric(stats);
	const metricSub =
		metric.unit === ''
			? 'duration'
			: metric.unit === 'km/h'
				? 'avg km/h'
				: metric.unit === '/100m'
					? 'pace /100m'
					: 'pace /km';
	const boardOwners = useMemo(
		() => effortOwnersForBoard(allRuns, groups, new Map(allRuns.map((r) => [r.slug, r]))),
		[allRuns, groups]
	);
	const highlights = groupHighlights(group, stats, boardOwners);
	const withTrack = segments.filter((s) => s.has_track);
	const canCombinedExport = !stats.mixed && withTrack.length > 0;
	const canZipExport = withTrack.length > 0;

	const groupedSlugs = new Set(groups.flatMap((g) => g.member_slugs));
	const addOptions = allRuns.filter((r) => !groupedSlugs.has(r.slug));

	async function onExport(kind: 'gpx' | 'tcx' | 'zip') {
		setExporting(true);
		try {
			const file = await exportGroupedActivity({ data: { id: group.id, kind } });
			if (file.encoding === 'utf8' && kind !== 'zip') {
				const blob = new Blob([file.body], { type: file.mime });
				await shareOrDownload({ filename: file.filename, blob, title: file.filename });
			} else {
				saveExportedFile(file);
			}
		} catch (err) {
			snack.error(errorMessage(err, 'Export failed'));
		} finally {
			setExporting(false);
		}
	}

	return (
		<>
			<PageHero
				kicker={
					<>
						{stats.types.map((t) => (
							<ActivityTag key={t} type={t} />
						))}
						<span>
							{[`${members.length} parts`, stats.start_time || null, groupTypeCaption(stats)]
								.filter(Boolean)
								.join(' · ')}
						</span>
					</>
				}
				kickerClassName="inline-flex items-center gap-1.5 flex-wrap"
				title={title}
				lead={`${stats.date}. Source GPX files are unchanged — this is a grouped view.`}
				actions={
					<AuthGate>
						<>
							<button type="button" className={ui.btnGhost} onClick={() => setAddOpen(true)}>
								<Icon name="plus" size={16} />
								Add part
							</button>
							<button
								type="button"
								className={ui.btnGhost}
								onClick={() => setPendingUngroup(true)}
							>
								Ungroup
							</button>
						</>
					</AuthGate>
				}
			/>

			<div className={cn(ui.metrics, 'mb-4')}>
				{showsField(stats.activity_type, 'distance') && (
					<div className={cn(ui.metric, ui.metricEmph)}>
						<b>{stats.distance_km ?? '—'}</b>
						<span>km</span>
					</div>
				)}
				<div className={cn(ui.metric, ui.metricEmph)}>
					<b>{metric.value}</b>
					<span>{metricSub}</span>
				</div>
				{metric.unit !== '' && (
					<div className={cn(ui.metric, ui.metricEmph)}>
						<b>{stats.time || '—'}</b>
						<span>
							{stats.elapsed_time && stats.elapsed_time !== stats.time
								? `moving · ${stats.elapsed_time} elapsed`
								: 'time'}
						</span>
					</div>
				)}
				{stats.avg_hr != null || stats.max_hr != null ? (
					<div className={ui.metric}>
						<div className="flex items-baseline gap-1">
							<b>{stats.avg_hr ?? '—'}</b>
							<span className="text-muted text-[0.95rem]">/</span>
							<strong className="font-display text-[1.05rem] text-warn">{stats.max_hr ?? '—'}</strong>
						</div>
						<span>HR avg / max</span>
					</div>
				) : null}
				{showsField(stats.activity_type, 'elevation') && (
					<div className={ui.metric}>
						<b>{stats.elev_gain != null ? stats.elev_gain : '—'}</b>
						<span>elev m</span>
					</div>
				)}
				{stats.calories != null && (
					<div className={ui.metric}>
						<b>{stats.calories}</b>
						<span>kcal</span>
					</div>
				)}
			</div>

			<BestEffortBadges highlights={highlights} />

			{routeIds.length > 0 && (
				<div className={cn(ui.panel, 'mb-4 p-0 overflow-hidden')}>
					<div className="p-[1.1rem_1.2rem_0.6rem]">
						<h3>Route</h3>
						<p className={cn(ui.muted, 'm-0 mt-1 text-[0.85rem]')}>
							{routeIds.length} GPS parts — pause between files is not drawn as a line
						</p>
					</div>
					<RouteMap routeIds={routeIds} kmMarkers={analytics?.kmMarkers ?? null} />
				</div>
			)}

			{analytics && !stats.mixed && (
				<SplitsPanel analytics={analytics} hrMaxManual={hrMaxManual} hrMaxAllTime={hrMaxAllTime} />
			)}

			<div className={cn(ui.panel, 'mb-4')}>
				<div className="flex flex-wrap items-baseline gap-x-[0.85rem] gap-y-[0.45rem] mb-[0.85rem]">
					<h3>Parts</h3>
					<p className={cn(ui.muted, 'text-[0.85rem]')}>original imported activities</p>
				</div>
				<div className="grid gap-2">
					{members.map((run) => (
						<div
							key={run.slug}
							className="flex flex-wrap items-center justify-between gap-3 py-2 border-b border-line last:border-b-0"
						>
							<Link className="text-inherit min-w-0" to="/runs/$slug" params={{ slug: run.slug }}>
								<strong>
									{run.date}
									{run.start_time ? ` · ${run.start_time}` : ''}
								</strong>
								<span className={cn(ui.muted, 'block text-[0.82rem]')}>
									{[
										activityLabel(run.activity_type),
										showsField(run.activity_type, 'distance') && run.distance_km != null
											? `${run.distance_km} km`
											: null,
										run.time || null
									]
										.filter(Boolean)
										.join(' · ')}
								</span>
							</Link>
							<AuthGate>
								<button
									type="button"
									className={cn(ui.btnGhost, ui.btnSm)}
									onClick={() => setRemoveSlug(run.slug)}
								>
									Remove
								</button>
							</AuthGate>
						</div>
					))}
				</div>
			</div>

			<div className={cn(ui.panel, 'mb-4')}>
				<div className="flex flex-wrap items-baseline gap-x-[0.85rem] gap-y-[0.45rem] mb-[0.85rem]">
					<h3>Export</h3>
					<p className={cn(ui.muted, 'text-[0.85rem]')}>one file for Strava; Apple Health is a hop</p>
				</div>
				<div className={cn(ui.actions, 'justify-start!')}>
					{canCombinedExport && (
						<>
							<button
								type="button"
								className={ui.btnPrimary}
								disabled={exporting}
								onClick={() => void onExport('gpx')}
							>
								<Icon name="download" size={16} />
								GPX
							</button>
							<button
								type="button"
								className={ui.btnGhost}
								disabled={exporting}
								onClick={() => void onExport('tcx')}
							>
								TCX
							</button>
						</>
					)}
					{canZipExport && (
						<button
							type="button"
							className={canCombinedExport ? ui.btnGhost : ui.btnPrimary}
							disabled={exporting}
							onClick={() => void onExport('zip')}
						>
							<Icon name="download" size={16} />
							{stats.mixed ? 'Each part (ZIP)' : 'ZIP of parts'}
						</button>
					)}
				</div>
				<p className={cn(ui.muted, 'mt-3 mb-0 text-[0.82rem]')}>
					{stats.mixed
						? 'Mixed sports cannot be one Strava/Apple activity. Download each part and upload separately.'
						: 'Upload the GPX in Strava (+ → Upload activity). Apple Fitness has no file import — use Strava’s Apple Health sync, or open the file in HealthFit / RunGap. If these parts are already in Health from Apple Watch, uploading again creates a second workout.'}
				</p>
			</div>

			<Dialog
				open={addOpen}
				title="Add a part"
				onClose={() => setAddOpen(false)}
				actions={
					<>
						<button type="button" className={ui.btnGhost} onClick={() => setAddOpen(false)}>
							Cancel
						</button>
						<button
							type="button"
							className={ui.btnPrimary}
							disabled={!addPick}
							onClick={async () => {
								if (!addPick) return;
								try {
									await addToActivityGroupFn({ data: { groupId: group.id, slug: addPick } });
									setAddOpen(false);
									setAddPick(null);
									await router.invalidate();
								} catch (err) {
									snack.error(errorMessage(err, 'Could not add that activity.'));
								}
							}}
						>
							Add
						</button>
					</>
				}
			>
				<div className="grid gap-1.5 max-h-[50vh] overflow-y-auto">
					{addOptions.length ? (
						addOptions.map((opt) => (
							<button
								key={opt.slug}
								type="button"
								className={cn(
									'flex items-center justify-between gap-3 min-h-11 px-3 py-2 rounded-xl border text-left',
									addPick === opt.slug ? 'border-accent bg-accent/10' : 'border-line'
								)}
								aria-pressed={addPick === opt.slug}
								onClick={() => setAddPick(opt.slug)}
							>
								<span>
									<strong>{opt.date}</strong>
									<span className={cn(ui.muted, 'block text-[0.82rem]')}>
										{[
											activityLabel(opt.activity_type),
											opt.start_time || null,
											opt.distance_km != null ? `${opt.distance_km} km` : null
										]
											.filter(Boolean)
											.join(' · ')}
									</span>
								</span>
							</button>
						))
					) : (
						<p className={cn(ui.muted, 'm-0')}>No ungrouped activities left to add.</p>
					)}
				</div>
			</Dialog>

			<ConfirmDialog
				open={pendingUngroup}
				title="Ungroup these activities?"
				description="Each imported file becomes its own timeline card again. Nothing is deleted."
				confirmLabel="Ungroup"
				onClose={() => setPendingUngroup(false)}
				onConfirm={async () => {
					await ungroupActivitiesFn({ data: group.id });
					await router.invalidate();
					await router.navigate({ to: '/timeline' });
				}}
			/>
			<ConfirmDialog
				open={removeSlug != null}
				title="Remove this part?"
				description="It stays in your log as its own activity."
				confirmLabel="Remove"
				onClose={() => setRemoveSlug(null)}
				onConfirm={async () => {
					if (!removeSlug) return;
					const still = members.filter((m) => m.slug !== removeSlug);
					await removeFromActivityGroupFn({ data: { groupId: group.id, slug: removeSlug } });
					if (still.length < 2) {
						await router.navigate({ to: '/timeline' });
						return;
					}
					await router.invalidate();
				}}
			/>
		</>
	);
}
