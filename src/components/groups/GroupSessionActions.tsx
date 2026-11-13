import { saveExportedFile, shareOrDownload } from '$lib/activity-export';
import { activityLabel } from '$lib/activity';
import { wearByAllGear, type GearContext } from '$lib/gear';
import { sortGroupMembers, type CombinedRunStats } from '$lib/group';
import {
	addToActivityGroupFn,
	deleteActivityGroupWithRunsFn,
	exportGroupedActivity,
	ungroupActivitiesFn
} from '$lib/server/functions';
import type { ActivityGroupInfo, RunWithMap } from '$lib/types';
import { cn } from '$lib/ui';
import { useRouter } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { FeelAiDialog } from '../FeelAiDialog';
import { EditButton, TrashIcon } from '../DeleteButton';
import { MoreMenu } from '../MoreMenu';
import { Icon } from '../Icon';
import { ConfirmDialog, Dialog, errorMessage, useSnackbar } from '../ui';
import { buttonClass } from '../ui/Button';

type Segment = { has_track: boolean };

export function GroupSessionActions({
	group,
	members,
	stats,
	gear,
	allRuns,
	groups,
	segments,
	showEditLink = true,
	layout = 'overlay'
}: {
	group: ActivityGroupInfo;
	members: RunWithMap[];
	stats: CombinedRunStats;
	gear: GearContext;
	allRuns: RunWithMap[];
	groups: ActivityGroupInfo[];
	segments?: Segment[];
	showEditLink?: boolean;
	layout?: 'overlay' | 'inline';
}) {
	const router = useRouter();
	const snack = useSnackbar();
	const [feelAiOpen, setFeelAiOpen] = useState(false);
	const [pendingDeleteAll, setPendingDeleteAll] = useState(false);
	const [pendingUngroup, setPendingUngroup] = useState(false);
	const [pendingUngroupAfterExport, setPendingUngroupAfterExport] = useState(false);
	const [addOpen, setAddOpen] = useState(false);
	const [addPick, setAddPick] = useState<number | null>(null);
	const [exporting, setExporting] = useState(false);

	const sorted = useMemo(() => sortGroupMembers(members), [members]);
	const feelRun = sorted[0];
	const gearWear = useMemo(() => wearByAllGear(allRuns), [allRuns]);

	const withTrack = segments?.filter((s) => s.has_track) ?? members.filter((m) => m.has_map);
	const canCombinedExport = !stats.mixed && withTrack.length > 0;
	const canZipExport = withTrack.length > 0;

	const groupedIds = new Set(groups.flatMap((g) => g.member_ids));
	const addOptions = allRuns.filter((r) => !groupedIds.has(r.id));

	async function onExport(kind: 'gpx' | 'zip') {
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

	const menuItems = [
		{
			label: 'Feel with AI',
			icon: <Icon name="sparkle" size={16} />,
			onClick: () => setFeelAiOpen(true),
			disabled: !feelRun
		},
		...(canCombinedExport
			? [
					{
						label: exporting ? 'Exporting…' : 'Export GPX for Strava',
						icon: <Icon name="download" size={16} />,
						onClick: () => void onExport('gpx'),
						disabled: exporting
					}
				]
			: []),
		...(canZipExport
			? [
					{
						label: exporting ? 'Exporting…' : stats.mixed ? 'Export parts (ZIP)' : 'Export ZIP of parts',
						icon: <Icon name="download" size={16} />,
						onClick: () => void onExport('zip'),
						disabled: exporting
					}
				]
			: []),
		{
			label: 'Add part',
			icon: <Icon name="plus" size={16} />,
			onClick: () => setAddOpen(true)
		},
		{
			label: 'Ungroup',
			icon: <Icon name="grid" size={16} />,
			onClick: () => setPendingUngroup(true)
		},
		{
			label: 'Delete all activities',
			icon: <TrashIcon className="size-4" />,
			onClick: () => setPendingDeleteAll(true),
			danger: true
		}
	];

	const chromeClass =
		layout === 'overlay'
			? 'absolute top-[0.65rem] right-[0.65rem] z-2 m-0 inline-flex items-center gap-1 opacity-100 group-hover:opacity-100 hover:opacity-100 sm:opacity-55'
			: 'inline-flex items-center gap-1';

	return (
		<>
			<div className={chromeClass}>
				{showEditLink ? (
					<EditButton
						compact
						label={`Open grouped session ${stats.date}`}
						onClick={(e) => {
							e.preventDefault();
							e.stopPropagation();
							void router.navigate({ to: '/groups/$id', params: { id: group.id } });
						}}
					/>
				) : null}
				<MoreMenu compact label={`More for grouped session ${stats.date}`} items={menuItems} />
			</div>

			{feelRun ? (
				<FeelAiDialog
					open={feelAiOpen}
					run={feelRun}
					gear={gear}
					gearWear={gearWear}
					onClose={() => setFeelAiOpen(false)}
				/>
			) : null}

			<Dialog
				open={addOpen}
				title="Add a part"
				onClose={() => setAddOpen(false)}
				actions={
					<>
						<button
							type="button"
							className={buttonClass({ variant: 'ghost' })}
							onClick={() => setAddOpen(false)}
						>
							Cancel
						</button>
						<button
							type="button"
							className={buttonClass()}
							disabled={!addPick}
							onClick={async () => {
								if (!addPick) return;
								try {
									await addToActivityGroupFn({ data: { groupId: group.id, id: addPick } });
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
				<div className="grid max-h-[50vh] gap-1.5 overflow-y-auto">
					{addOptions.length ? (
						addOptions.map((opt) => (
							<button
								key={opt.id}
								type="button"
								className={cn(
									'flex min-h-11 items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left',
									addPick === opt.id ? 'border-accent bg-accent/10' : 'border-line'
								)}
								aria-pressed={addPick === opt.id}
								onClick={() => setAddPick(opt.id)}
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
							</button>
						))
					) : (
						<p className={cn('text-muted', 'm-0')}>No ungrouped activities left to add.</p>
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
				open={pendingDeleteAll}
				title="Delete grouped session and all parts?"
				description={`${members.length} activities and this grouped view will be permanently deleted.`}
				confirmLabel="Delete all"
				onClose={() => setPendingDeleteAll(false)}
				onConfirm={async () => {
					try {
						await deleteActivityGroupWithRunsFn({ data: group.id });
						await router.invalidate();
						await router.navigate({ to: '/timeline' });
					} catch (err) {
						snack.error(errorMessage(err, 'Could not delete.'));
					}
				}}
			/>
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
		</>
	);
}
