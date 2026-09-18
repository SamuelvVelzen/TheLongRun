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
import { cn, ui } from '$lib/ui';
import { createFileRoute, Link, notFound, useRouter } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DeleteButton, EditButton } from '../components/DeleteButton';
import { ConfirmDialog } from '../components/Dialog';
import { Icon } from '../components/Icon';
import { OpenRouteBadge } from '../components/OpenRouteBadge';
import { PageHero } from '../components/PageHero';
import { PlannedRouteMap } from '../components/PlannedRouteMap';
import { RouteAttach } from '../components/RouteAttach';
import { errorMessage, useSnackbar } from '../components/Snackbar';
import { Actions, Button, Form, Panel, useAppForm } from '../components/ui';
import { WaypointEditor, type WaypointEditorHandle } from '../components/WaypointEditor';
import { z } from 'zod';

export const Route = createFileRoute('/routes/$slug')({
	loader: async ({ params }) => {
		const route = await getPlannedRouteDetail({ data: params.slug });
		if (!route) throw notFound();
		return route;
	},
	head: ({ loaderData }) => appHead(loaderData?.name, 'Routes'),
	component: PlannedRouteDetail
});

function PlannedRouteDetail() {
	const route = Route.useLoaderData();
	const router = useRouter();
	const authed = useAuthed();
	const snack = useSnackbar();
	const pathRef = useRef<WaypointEditorHandle>(null);
	const [editing, setEditing] = useState(false);
	const [pendingDelete, setPendingDelete] = useState(false);
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
				setEditing(false);
				await router.invalidate();
			} catch (error) {
				snack.error(errorMessage(error, 'Save failed'));
			}
		}
	});
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
	}, [editing, route.name, route.notes]);

	function startEditing() {
		form.reset({ name: route.name, notes: route.notes });
		setEditing(true);
	}

	function cancelEditing() {
		form.reset({ name: route.name, notes: route.notes });
		setEditing(false);
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

	return (
		<>
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
										className="block w-full max-w-[min(28ch,100%)] m-0 px-[0.4rem] py-[0.1rem] border border-dashed border-line rounded-[10px] bg-transparent text-inherit font-inherit focus:border-solid focus:border-accent focus:outline-none"
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

					<div className={cn(ui.panel, 'mb-4 p-[1.1rem_1.2rem_1.15rem]')}>
						<h3 className="m-0 mb-3">Path</h3>
						<WaypointEditor
							ref={pathRef}
							embedded
							initialWaypoints={editPins}
							contextTracks={editPins.length >= 2 ? [] : savedTrack}
							emptyHint="Tap to drop pins along the loop"
							hint="Place pins in order. Tap a pin to remove it, or tap the line to add one between. Drag to adjust."
						/>
					</div>

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
								<Button variant="ghost" disabled={busy} onClick={cancelEditing}>
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
						titleClassName={ui.runTitle}
						lead={
							<>
								<p>{route.notes || 'Planned route.'}</p>
								{openGap != null && (
									<p className="text-warn! font-semibold">
										Start and finish are {formatStraightLineGap(openGap)} apart from each
										other.
									</p>
								)}
							</>
						}
						actionsClassName="justify-start! max-sm:order-3 max-sm:mt-1 max-sm:mb-4"
						actions={
							<>
								<button
									className={mapsPref === 'apple' ? ui.btnPrimary : ui.btnGhost}
									type="button"
									onClick={openAppleMaps}
								>
									<Icon name="map" size={16} />
									Apple Maps
									<Icon name="external" size={13} />
								</button>
								<button
									className={mapsPref === 'desktop' ? ui.btnPrimary : ui.btnGhost}
									type="button"
									onClick={openInBrouter}
								>
									<Icon name="routes" size={16} />
									Open in BRouter
									<Icon name="external" size={13} />
								</button>
								<button
									className={ui.btnGhost}
									type="button"
									onClick={() => downloadPlannedRouteGpx(route.name, route.geojson, route.waypoints)}
								>
									<Icon name="download" size={16} />
									Download GPX
								</button>
								{authed && (
									<>
										<EditButton label="Edit route" onClick={startEditing} />
										<DeleteButton label={`Delete route ${route.name}`} onClick={remove} />
									</>
								)}
								{appleMapsUrl && (
									<p className={cn(ui.muted, 'mt-3 mb-0 max-w-[36ch] text-[0.92rem] basis-full')}>
										Opens a pin at the start. Tap it, then Create a Custom Route, and tap along the
										trail.
									</p>
								)}
							</>
						}
					/>

					<div className={cn(ui.panel, 'mb-4 p-0 overflow-hidden max-sm:order-1')}>
						<div className="hidden sm:block p-[1.1rem_1.2rem_0.65rem]">
							<h3>Route</h3>
							<p className={cn(ui.muted, 'mt-1')}>Kilometres and available GPX waypoints are marked</p>
						</div>
						<PlannedRouteMap
							geojson={route.geojson}
							kmMarkers={route.kmMarkers}
							waypoints={route.waypoints}
						/>
					</div>

					<div className={cn(ui.metrics, 'mb-4 max-sm:order-2')}>
						<div className={cn(ui.metric, ui.metricEmph)}>
							<b>{route.distance_km ?? '—'}</b>
							<span>km</span>
						</div>
						{route.est_time && (
							<div className={cn(ui.metric, ui.metricEmph)}>
								<b>{route.est_time}</b>
								<span>estimated time</span>
							</div>
						)}
						{elevationLabel && (
							<div className={ui.metric}>
								<b>{elevationLabel}</b>
								<span>
									{route.elev_gain != null || route.elev_loss != null
										? (elevationRange ?? 'elevation')
										: 'elevation'}
								</span>
							</div>
						)}
						{waypointCount > 0 && (
							<div className={ui.metric}>
								<b>{waypointCount}</b>
								<span>{waypointCount === 1 ? 'waypoint' : 'waypoints'}</span>
							</div>
						)}
					</div>

					<div className="max-sm:order-5">
						<RouteAttach
							slug={route.slug}
							planLinks={route.planLinks}
							activityLinks={route.activityLinks}
							planOptions={route.planOptions}
							activityOptions={route.activityOptions}
						/>
					</div>

					{route.waypoints.length > 0 && (
						<div className={cn(ui.panel, 'mb-4 max-sm:order-6')}>
							<h3>Waypoints</h3>
							<div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-0 mt-3 border-t border-line [&>div]:flex [&>div]:flex-col [&>div]:gap-[0.15rem] [&>div]:py-[0.7rem] [&>div]:pr-4 [&>div]:border-b [&>div]:border-line">
								{route.waypoints.map((waypoint, index) => (
									<div key={`${waypoint.name}-${index}`}>
										<strong>{waypoint.name}</strong>
										<span className={ui.muted}>
											{waypoint.lat.toFixed(5)}, {waypoint.lng.toFixed(5)}
										</span>
									</div>
								))}
							</div>
						</div>
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
		</>
	);
}
