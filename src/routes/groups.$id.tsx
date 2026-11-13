import {
	Actions,
	ConfirmDialog,
	Dialog,
	IconLabelButton,
	Metric,
	Metrics,
	PageHero,
	Panel,
	PanelTitle,
	errorMessage,
	useSnackbar
} from '../components/ui';
import { buttonClass } from '../components/ui/Button';
import { activityLabel, headlineMetric, showsField } from '$lib/activity';
import { saveExportedFile, shareOrDownload } from '$lib/activity-export';
import { AuthGate } from '$lib/auth';
import {
	effortOwnersForBoard,
	groupedSessionTitle,
	groupHighlights,
	groupTypeCaption,
	sortGroupMembers
} from '$lib/group';
import { exportGroupedActivity, getGroupDetail, removeFromActivityGroupFn, ungroupActivitiesFn } from '$lib/server/functions';
import { activityTitlePart, appHead } from '$lib/title';
import { cn } from '$lib/ui';
import { entityNotFound } from '$lib/not-found';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { lazy, Suspense, useMemo, useState } from 'react';
import { BestEffortBadges } from '../components/BestEffortBadges';
import { GroupSessionActions } from '../components/groups/GroupSessionActions';
import { ActivityTag, Icon } from '../components/Icon';
import { SplitsPanel } from '../components/SplitsPanel';

const RouteMap = lazy(() =>
	import('../components/RouteMap').then((m) => ({ default: m.RouteMap }))
);

export const Route = createFileRoute('/groups/$id')({
	loader: async ({ params }) => {
		const detail = await getGroupDetail({ data: params.id });
		if (!detail) throw entityNotFound('group');
		return detail;
	},
	head: ({ loaderData }) => {
		if (!loaderData) return appHead('Timeline');
		const named = loaderData.group.name.trim();
		if (named) return appHead(named, 'Timeline');
		const first = sortGroupMembers(loaderData.members)[0];
		return appHead(first ? activityTitlePart(first) : null, 'Timeline');
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
		groups,
		gear
	} = Route.useLoaderData();
	const router = useRouter();
	const snack = useSnackbar();
	const [removeId, setRemoveId] = useState<number | null>(null);
	const [exporting, setExporting] = useState(false);
	const [pendingUngroupAfterExport, setPendingUngroupAfterExport] = useState(false);

	const title = groupedSessionTitle(group, members.length, stats.date);
	const metric = headlineMetric(stats);
	const metricSub =
		metric.unit === '' ? 'duration' : metric.unit === 'km/h' ? 'avg km/h' : 'pace /km';
	const boardOwners = useMemo(
		() => effortOwnersForBoard(allRuns, groups, new Map(allRuns.map((r) => [r.id, r]))),
		[allRuns, groups]
	);
	const highlights = groupHighlights(group, stats, boardOwners);
	const withTrack = segments.filter((s) => s.has_track);
	const canCombinedExport = !stats.mixed && withTrack.length > 0;
	const canZipExport = withTrack.length > 0;

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
			setPendingUngroupAfterExport(true);
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
						<GroupSessionActions
							layout="inline"
							showEditLink={false}
							group={group}
							members={members}
							stats={stats}
							gear={gear}
							allRuns={allRuns}
							groups={groups}
							segments={segments}
						/>
					</AuthGate>
				}
			/>

			<Metrics className="mb-4">
				{showsField(stats.activity_type, 'distance') && (
					<Metric emph>
						<b>{stats.distance_km ?? '—'}</b>
						<span>km</span>
					</Metric>
				)}
				<Metric emph>
					<b>{metric.value}</b>
					<span>{metricSub}</span>
				</Metric>
				{metric.unit !== '' && (
					<Metric emph>
						<b>{stats.time || '—'}</b>
						<span>
							{stats.elapsed_time && stats.elapsed_time !== stats.time
								? `moving · ${stats.elapsed_time} elapsed`
								: 'time'}
						</span>
					</Metric>
				)}
				{stats.avg_hr != null || stats.max_hr != null ? (
					<Metric>
						<div className="flex items-baseline gap-1">
							<b>{stats.avg_hr ?? '—'}</b>
							<span className="text-[0.95rem] text-muted">/</span>
							<strong className="font-display text-[1.05rem] text-warn">
								{stats.max_hr ?? '—'}
							</strong>
						</div>
						<span>HR avg / max</span>
					</Metric>
				) : null}
				{showsField(stats.activity_type, 'elevation') && (
					<Metric>
						<b>{stats.elev_gain != null ? stats.elev_gain : '—'}</b>
						<span>elev m</span>
					</Metric>
				)}
				{stats.calories != null && (
					<Metric>
						<b>{stats.calories}</b>
						<span>kcal</span>
					</Metric>
				)}
			</Metrics>

			<BestEffortBadges highlights={highlights} />

			{routeIds.length > 0 && (
				<Panel className="mb-4 overflow-hidden p-0">
					<div className="p-[1.1rem_1.2rem_0.6rem]">
						<PanelTitle>Route</PanelTitle>
						<p className={cn('text-muted', 'm-0 mt-1 text-[0.85rem]')}>
							{routeIds.length} GPS parts — pause between files is not drawn as a line
						</p>
					</div>
					<Suspense fallback={<p className="p-4 text-sm text-muted">Loading map…</p>}>
						<RouteMap
							routeIds={routeIds}
							activityTypes={segments.filter((s) => s.route_id).map((s) => s.activity_type)}
							kmMarkers={analytics?.kmMarkers ?? null}
						/>
					</Suspense>
				</Panel>
			)}

			{analytics && !stats.mixed && (
				<SplitsPanel analytics={analytics} hrMaxManual={hrMaxManual} hrMaxAllTime={hrMaxAllTime} />
			)}

			<Panel className="mb-4">
				<div className="mb-[0.85rem] flex flex-wrap items-baseline gap-x-[0.85rem] gap-y-[0.45rem]">
					<PanelTitle>Parts</PanelTitle>
					<p className={cn('text-muted', 'text-[0.85rem]')}>original imported activities</p>
				</div>
				<div className="grid gap-2">
					{members.map((run) => (
						<div
							key={run.slug}
							className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-2 last:border-b-0"
						>
							<Link className="min-w-0 text-inherit" to="/runs/$slug" params={{ slug: run.slug }}>
								<strong>
									{run.date}
									{run.start_time ? ` · ${run.start_time}` : ''}
								</strong>
								<span className={cn('text-muted', 'block text-[0.82rem]')}>
									{[
										activityLabel(run.activity_type),
										showsField(run.activity_type, 'distance') && run.distance_km != null
											? `${run.distance_km} km`
											: null,
										run.time || null,
										!run.has_map ? 'no GPS' : null
									]
										.filter(Boolean)
										.join(' · ')}
								</span>
							</Link>
							<AuthGate>
								<button
									type="button"
									className={buttonClass({ variant: 'ghost', size: 'sm' })}
									onClick={() => setRemoveId(run.id)}
								>
									Remove
								</button>
							</AuthGate>
						</div>
					))}
				</div>
			</Panel>

			<Panel className="mb-4">
				<div className="mb-[0.85rem] flex flex-wrap items-baseline gap-x-[0.85rem] gap-y-[0.45rem]">
					<PanelTitle>Export</PanelTitle>
					<p className={cn('text-muted', 'text-[0.85rem]')}>
						one file for Strava; Apple Health is a hop
					</p>
				</div>
				<Actions className="justify-start!">
					{canCombinedExport && (
						<>
							<IconLabelButton
								label="GPX"
								variant="primary"
								size="default"
								disabled={exporting}
								icon={<Icon name="download" size={16} />}
								onClick={() => void onExport('gpx')}
							/>
							<button
								type="button"
								className={buttonClass({ variant: 'ghost' })}
								disabled={exporting}
								onClick={() => void onExport('tcx')}
							>
								TCX
							</button>
						</>
					)}
					{canZipExport && (
						<IconLabelButton
							label={stats.mixed ? 'Each part (ZIP)' : 'ZIP of parts'}
							variant={canCombinedExport ? 'ghost' : 'primary'}
							size="default"
							disabled={exporting}
							icon={<Icon name="download" size={16} />}
							onClick={() => void onExport('zip')}
						/>
					)}
				</Actions>
				<p className={cn('text-muted', 'mt-3 mb-0 text-[0.82rem]')}>
					{stats.mixed
						? 'Mixed sports cannot be one Strava/Apple activity. Download each part and upload separately.'
						: 'Upload the GPX in Strava (+ → Upload activity). Apple Fitness has no file import — use Strava’s Apple Health sync, or open the file in HealthFit / RunGap. If these parts are already in Health from Apple Watch, uploading again creates a second workout.'}
					{members.some((m) => !m.has_map)
						? ' Parts with no GPS are omitted until you add GPS on that part.'
						: ''}
				</p>
			</Panel>

			<ConfirmDialog
				open={pendingUngroupAfterExport}
				title="Remove grouped view from timeline?"
				description="Your export is saved. Ungroup so each part shows as its own card again? Activities stay in your log."
				confirmLabel="Ungroup"
				cancelLabel="Keep grouped"
				onClose={() => setPendingUngroupAfterExport(false)}
				onConfirm={async () => {
					try {
						await ungroupActivitiesFn({ data: group.id });
						await router.invalidate();
						await router.navigate({ to: '/timeline' });
					} catch (err) {
						snack.error(errorMessage(err, 'Could not ungroup.'));
					}
				}}
			/>
			<ConfirmDialog
				open={removeId != null}
				title="Remove this part?"
				description="It stays in your log as its own activity."
				confirmLabel="Remove"
				onClose={() => setRemoveId(null)}
				onConfirm={async () => {
					if (removeId == null) return;
					const still = members.filter((m) => m.id !== removeId);
					await removeFromActivityGroupFn({ data: { groupId: group.id, id: removeId } });
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
