import { useAuthed } from '$lib/auth';
import { formatStraightLineGap } from '$lib/format';
import { samplesFromGeoJson } from '$lib/gps-repair';
import {
	downloadPlannedRouteGpx,
	editablePinsFromPlannedRoute,
	openPlannedRouteInBrouter,
	plannedRouteAppleMapsStartUrl,
	preferredMapsApp,
	type MapsPref
} from '$lib/planned-route-export';
import {
	deletePlannedRoute,
	getPlannedRouteDetail,
	updatePlannedRoute
} from '$lib/server/functions';
import { appHead } from '$lib/title';
import { cn } from '$lib/ui';
import { entityNotFound } from '$lib/not-found';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { EditButton, TrashIcon } from '../components/DeleteButton';
import { Icon } from '../components/Icon';
import { MoreMenu, type MoreMenuItem } from '../components/MoreMenu';
import { OpenRouteBadge } from '../components/OpenRouteBadge';
import { PlannedRouteMap } from '../components/PlannedRouteMap';
import { RouteAttach } from '../components/RouteAttach';
import {
	Actions,
	Button,
	ChangeReporter,
	ConfirmDialog,
	Form,
	Metric,
	Metrics,
	PageHero,
	Panel,
	PanelTitle,
	errorMessage,
	useAppForm,
	useDiscardGuard,
	useLeaveGuard,
	useSnackbar
} from '../components/ui';
import { buttonClass } from '../components/ui/Button';
import { runTitleClass } from '../components/ui/Chrome';
import { WaypointEditor, type WaypointEditorHandle } from '../components/WaypointEditor';

type RouteSearch = { edit?: boolean };

export const Route = createFileRoute('/routes/$slug')({
	validateSearch: (s: Record<string, unknown>): RouteSearch => ({
		edit: s.edit === true || s.edit === 'true' || s.edit === '1' ? true : undefined
	}),
	loader: async ({ params }) => {
		const route = await getPlannedRouteDetail({ data: params.slug });
		if (!route) throw entityNotFound('route');
		return route;
	},
	head: ({ loaderData }) => appHead(loaderData?.name, 'Routes'),
	component: PlannedRouteDetail
});

function PlannedRouteDetail() {
	const route = Route.useLoaderData();
	const { edit: editFromSearch } = Route.useSearch();
	const router = useRouter();
	const authed = useAuthed();
	const snack = useSnackbar();
	const pathRef = useRef<WaypointEditorHandle>(null);
	const [editing, setEditing] = useState(() => authed && Boolean(editFromSearch));
	const [pendingDelete, setPendingDelete] = useState(false);
	/** False until the name/notes form actually differs from its defaults. */
	const [formDirty, setFormDirty] = useState(false);
	/** False until the pins or the follow-roads toggle differ from the saved route. */
	const [pinsDirty, setPinsDirty] = useState(false);
	const editDirty = formDirty || pinsDirty;
	const form = useAppForm({
		defaultValues: { name: route.name, notes: route.notes },
		validators: {
			onSubmit: z.object({ name: z.string(), notes: z.string() })
		},
		onSubmit: async ({ value }) => {
			const trimmed = value.name.trim();
			if (!trimmed) {
				snack.info('Name this route first.');
				return;
			}
			const path = pathRef.current;
			const dirty = path?.isDirty() ?? false;
			const snapshot = path?.snapshot();
			if (dirty && (!snapshot || snapshot.waypoints.length < 2)) {
				snack.info('Drop at least two pins — start and end, plus any turns in between.');
				return;
			}
			try {
				await updatePlannedRoute({
					data: {
						slug: route.slug,
						name: trimmed,
						notes: value.notes,
						...(dirty && snapshot
							? {
									waypoints: snapshot.waypoints,
									follow_network: snapshot.followNetwork,
									network_coords:
										snapshot.followNetwork && snapshot.networkCoords.length >= 2
											? snapshot.networkCoords
											: undefined
								}
							: {})
					}
				});
				snack.success('Route saved.');
				leaveEditing();
				await router.invalidate();
			} catch (error) {
				snack.error(errorMessage(error, 'Save failed'));
			}
		}
	});
	const [requestCancel, discardGuard] = useDiscardGuard({
		dirty: editDirty,
		onDiscard: () => {
			form.reset({ name: route.name, notes: route.notes });
			leaveEditing();
		},
		title: 'Discard these changes?',
		description: 'Your pin and text edits will be lost.'
	});
	const { guard: leaveGuard } = useLeaveGuard({ dirty: editing && editDirty });
	const editPins = useMemo(
		() => editablePinsFromPlannedRoute(route.geojson, route.waypoints),
		[route.geojson, route.waypoints]
	);
	const savedTrack = useMemo(() => {
		const samples = samplesFromGeoJson(route.geojson);
		if (samples.length < 2) return [];
		return [
			{
				slug: route.slug,
				label: 'Saved line',
				coords: samples.map((point) => [point.lat, point.lng] as [number, number])
			}
		];
	}, [route.geojson, route.slug]);

	useEffect(() => {
		if (editing) return;
		form.reset({ name: route.name, notes: route.notes });
		setFormDirty(false);
		setPinsDirty(false);
	}, [editing, route.name, route.notes]);

	useEffect(() => {
		if (!editFromSearch || !authed) return;
		form.reset({ name: route.name, notes: route.notes });
		setEditing(true);
	}, [editFromSearch, authed, route.name, route.notes, form]);

	function startEditing() {
		form.reset({ name: route.name, notes: route.notes });
		setEditing(true);
		void router.navigate({
			to: '/routes/$slug',
			params: { slug: route.slug },
			search: { edit: true },
			replace: true,
			resetScroll: false
		});
	}

	function leaveEditing() {
		setEditing(false);
		if (editFromSearch) {
			void router.navigate({
				to: '/routes/$slug',
				params: { slug: route.slug },
				search: {},
				replace: true,
				resetScroll: false
			});
		}
	}

	function remove() {
		setPendingDelete(true);
	}

	const [mapsPref, setMapsPref] = useState<MapsPref>('desktop');
	const appleMapsUrl = plannedRouteAppleMapsStartUrl(route.geojson, route.name);

	useEffect(() => {
		setMapsPref(preferredMapsApp());
	}, []);

	function openAppleMaps() {
		if (!appleMapsUrl) {
			snack.info('This route has no start point for Apple Maps.');
			return;
		}
		if (mapsPref === 'apple') window.location.assign(appleMapsUrl);
		else window.open(appleMapsUrl, '_blank', 'noopener,noreferrer');
	}

	function openInBrouter() {
		const opened = openPlannedRouteInBrouter(route.geojson, route.waypoints);
		if (!opened) snack.info('This route has too few points for BRouter.');
	}

	const openGap = route.open_gap_m;
	const location = [route.place, route.province, route.country].filter(Boolean).join(', ');
	const elevationRange =
		route.elev_min != null && route.elev_max != null
			? `${route.elev_min}–${route.elev_max} m`
			: null;
	const elevationLabel =
		route.elev_gain != null && route.elev_loss != null
			? `↑${route.elev_gain} ↓${route.elev_loss}`
			: route.elev_gain != null
				? `↑ ${route.elev_gain} m`
				: route.elev_loss != null
					? `↓ ${route.elev_loss} m`
					: elevationRange;
	const viaWaypoints = route.waypoints.filter(
		(point) => point.name !== 'from' && point.name !== 'to'
	);
	const waypointCount = viaWaypoints.length || route.waypoints.length;

	const kicker = (
		<>
			<Link to="/routes">Routes</Link>
			{location ? ` · ${location}` : ''} · saved {route.saved_on}
		</>
	);

	const downloadGpxItem: MoreMenuItem = {
		label: 'Download GPX',
		icon: <Icon name="download" size={16} />,
		onClick: () => downloadPlannedRouteGpx(route.name, route.geojson, route.waypoints)
	};

	const mobileRouteMenuItems: MoreMenuItem[] = [
		{
			label: 'Apple Maps',
			icon: <Icon name="map" size={16} />,
			onClick: openAppleMaps
		},
		{
			label: 'Open in BRouter',
			icon: <Icon name="routes" size={16} />,
			onClick: openInBrouter
		},
		...(authed
			? [
					{
						label: 'Edit route',
						icon: <Icon name="pencil" size={16} />,
						onClick: startEditing
					},
					downloadGpxItem,
					{
						label: 'Delete',
						icon: <TrashIcon className="size-4" />,
						onClick: remove,
						danger: true
					}
				]
			: [])
	];

	const desktopMoreItems: MoreMenuItem[] = authed
		? [
				downloadGpxItem,
				{
					label: 'Delete',
					icon: <TrashIcon className="size-4" />,
					onClick: remove,
					danger: true
				}
			]
		: [];

	return (
		<>
			<form.Subscribe selector={(s) => s.isDirty}>
				{(dirty) => <ChangeReporter value={dirty} onChange={setFormDirty} />}
			</form.Subscribe>
			{editing ? (
				<Form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						void form.handleSubmit();
					}}
				>
					<PageHero
						variant="route"
						kicker={kicker}
						title={
							<form.AppField
								name="name"
								children={(field) => (
									<input
										className="block w-full max-w-[min(28ch,100%)] m-0 px-[0.4rem] py-[0.1rem] border border-dashed border-line rounded-inset bg-transparent text-inherit font-inherit focus:border-solid focus:border-accent focus:outline-none"
										value={field.state.value}
										required
										aria-label="Route name"
										onChange={(event) => field.handleChange(event.target.value)}
										onBlur={field.handleBlur}
									/>
								)}
							/>
						}
					/>

					<Panel className="mb-4 p-[1.1rem_1.2rem_1.15rem]">
						<PanelTitle className="m-0 mb-3">Path</PanelTitle>
						<WaypointEditor
							ref={pathRef}
							embedded
							initialWaypoints={editPins}
							onDirtyChange={setPinsDirty}
							contextTracks={editPins.length >= 2 ? [] : savedTrack}
							emptyHint="Tap to drop pins along the loop"
							hint="Place pins in order. Tap a pin to remove it, or tap the line to add one between. Drag to adjust."
						/>
					</Panel>

					<Panel className="mb-4">
						<form.AppField
							name="notes"
							children={(field) => (
								<field.TextAreaField
									label="Notes"
									rows={4}
									placeholder="Optional — terrain, parking, why you like this loop"
								/>
							)}
						/>
					</Panel>

					<Actions sticky>
						<form.Subscribe selector={(s) => s.isSubmitting}>
							{(busy) => (
								<Button variant="ghost" disabled={busy} onClick={requestCancel}>
									Cancel
								</Button>
							)}
						</form.Subscribe>
						<form.AppForm>
							<form.SubmitButton busyLabel="Saving…" stickyPrimary>
								Save changes
							</form.SubmitButton>
						</form.AppForm>
					</Actions>
				</Form>
			) : (
				<div className="max-sm:flex max-sm:flex-col">
					<PageHero
						variant="route"
						className="max-sm:contents max-sm:mb-0"
						copyClassName="max-sm:mb-3"
						kicker={kicker}
						title={
							<>
								<span className="min-w-0">{route.name}</span>
								{openGap != null && <OpenRouteBadge gapMeters={openGap} size={22} />}
							</>
						}
						titleClassName={runTitleClass}
						titleRowClassName="w-full"
						titleAside={
							<>
								{mobileRouteMenuItems.length > 0 ? (
									<div className="sm:hidden">
										<MoreMenu compact items={mobileRouteMenuItems} />
									</div>
								) : null}
								<div className="hidden items-center gap-2 sm:flex">
									<button
										className={buttonClass({
											variant: mapsPref === 'apple' ? 'primary' : 'ghost',
											size: 'sm'
										})}
										type="button"
										onClick={openAppleMaps}
									>
										<Icon name="map" size={16} />
										Apple Maps
										<Icon name="external" size={13} />
									</button>
									<button
										className={buttonClass({
											variant: mapsPref === 'desktop' ? 'primary' : 'ghost',
											size: 'sm'
										})}
										type="button"
										onClick={openInBrouter}
									>
										<Icon name="routes" size={16} />
										Open in BRouter
										<Icon name="external" size={13} />
									</button>
									{authed ? (
										<>
											<EditButton label="Edit route" onClick={startEditing} />
											{desktopMoreItems.length > 0 ? (
												<MoreMenu items={desktopMoreItems} />
											) : null}
										</>
									) : null}
								</div>
							</>
						}
						lead={
							<>
								<p>{route.notes || 'Planned route.'}</p>
								{openGap != null && (
									<p className="text-warn! font-semibold">
										Start and finish are {formatStraightLineGap(openGap)} apart from each other.
									</p>
								)}
								{appleMapsUrl ? (
									<p className={cn('text-muted', 'mb-0 max-w-[36ch] text-[0.92rem] max-sm:hidden')}>
										Opens a pin at the start. Tap it, then Create a Custom Route, and tap along the
										trail.
									</p>
								) : null}
							</>
						}
					/>

					<Panel className="mb-4 p-0 overflow-hidden max-sm:order-1">
						<div className="hidden sm:block p-[1.1rem_1.2rem_0.65rem]">
							<PanelTitle>Route</PanelTitle>
							<p className={cn('text-muted', 'mt-1')}>
								Kilometres and available GPX waypoints are marked
							</p>
						</div>
						<PlannedRouteMap
							geojson={route.geojson}
							kmMarkers={route.kmMarkers}
							waypoints={route.waypoints}
						/>
					</Panel>

					<Metrics className="mb-4 max-sm:order-2">
						<Metric emph>
							<b>{route.distance_km ?? '—'}</b>
							<span>km</span>
						</Metric>
						{elevationLabel && (
							<Metric>
								<b>{elevationLabel}</b>
								<span>
									{route.elev_gain != null || route.elev_loss != null
										? (elevationRange ?? 'elevation')
										: 'elevation'}
								</span>
							</Metric>
						)}
						{waypointCount > 0 && (
							<Metric>
								<b>{waypointCount}</b>
								<span>{waypointCount === 1 ? 'waypoint' : 'waypoints'}</span>
							</Metric>
						)}
					</Metrics>

					{authed ? (
						<div className="max-sm:order-5">
							<RouteAttach
								slug={route.slug}
								planLinks={route.planLinks}
								activityLinks={route.activityLinks}
								planOptions={route.planOptions}
								activityOptions={route.activityOptions}
							/>
						</div>
					) : null}

					{route.waypoints.length > 0 && (
						<Panel className="mb-4 max-sm:order-6">
							<PanelTitle>Waypoints</PanelTitle>
							<div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-0 mt-3 border-t border-line [&>div]:flex [&>div]:flex-col [&>div]:gap-[0.15rem] [&>div]:py-[0.7rem] [&>div]:pr-4 [&>div]:border-b [&>div]:border-line">
								{route.waypoints.map((waypoint, index) => (
									<div key={`${waypoint.name}-${index}`}>
										<strong>{waypoint.name}</strong>
										<span className={'text-muted'}>
											{waypoint.lat.toFixed(5)}, {waypoint.lng.toFixed(5)}
										</span>
									</div>
								))}
							</div>
						</Panel>
					)}
				</div>
			)}
			<ConfirmDialog
				open={pendingDelete}
				title="Delete this route?"
				description={`“${route.name}” will be removed. This cannot be undone.`}
				onClose={() => setPendingDelete(false)}
				onConfirm={async () => {
					await deletePlannedRoute({ data: route.slug });
					await router.invalidate();
					await router.navigate({ to: '/routes' });
				}}
			/>
			{discardGuard}
			{leaveGuard}
		</>
	);
}
