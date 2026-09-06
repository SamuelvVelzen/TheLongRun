import { downloadTextFile, memberActivityGpx } from '$lib/activity-export';
import type { GpsContextTrack, GpsHealth, GpsWaypoint } from '$lib/gps-repair';
import { samplesFromGeoJson } from '$lib/gps-repair';
import { getRouteGeoJsonFn, repairRunGps } from '$lib/server/functions';
import type { SessionRouteRef } from '$lib/types';
import { cn, ui } from '$lib/ui';
import { Link, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { GpsWaypointMap } from './GpsWaypointMap';
import { errorMessage, useSnackbar } from './Snackbar';

export type GpsRepairRouteOption = {
	slug: string;
	name: string;
	distance_km: number | null;
};

function writeMemberGpx(date: string, activityType: string, samples: { lat: number; lng: number }[]) {
	downloadTextFile(
		`${date} ${activityType}.gpx`,
		memberActivityGpx({
			name: `${date} ${activityType}`,
			activityType,
			points: samples
		}),
		'application/gpx+xml'
	);
}

export async function exportActivityGpx(date: string, activityType: string, routeId: string) {
	const geo = await getRouteGeoJsonFn({ data: routeId });
	const samples = samplesFromGeoJson(geo);
	if (samples.length < 2) throw new Error('This activity has no GPS points to export.');
	writeMemberGpx(date, activityType, samples);
}

export function GpsRepair({
	slug,
	date,
	activityType,
	gps,
	plannedRoute,
	repairRoutes,
	contextTracks,
	hasMap,
	routeId,
	authed,
	groupedSessionId
}: {
	slug: string;
	date: string;
	activityType: string;
	gps: GpsHealth;
	plannedRoute: SessionRouteRef | null;
	repairRoutes: GpsRepairRouteOption[];
	contextTracks: GpsContextTrack[];
	hasMap: boolean;
	routeId: string;
	authed: boolean;
	groupedSessionId?: string | null;
}) {
	const router = useRouter();
	const snack = useSnackbar();
	const [editing, setEditing] = useState(() => Boolean(groupedSessionId));
	const [busy, setBusy] = useState(false);
	const [waypoints, setWaypoints] = useState<GpsWaypoint[]>([]);
	const [followNetwork, setFollowNetwork] = useState(false);
	const [plannedSlug, setPlannedSlug] = useState(plannedRoute?.slug ?? '');
	const [showPlanned, setShowPlanned] = useState(false);

	const missing = gps.issues.includes('missing');

	async function save(from: 'waypoints' | 'planned') {
		if (busy) return;
		if (from === 'waypoints' && waypoints.length < 2) {
			snack.info('Drop at least two pins — start and end, plus any turns in between.');
			return;
		}
		if (from === 'planned' && !plannedSlug) {
			snack.info('Pick a saved route first.');
			return;
		}
		setBusy(true);
		try {
			const result = await repairRunGps({
				data:
					from === 'waypoints'
						? { slug, waypoints, follow_network: followNetwork }
						: { slug, planned_slug: plannedSlug }
			});
			snack.success(`Saved a ${result.points}-point GPS track.`);
			setWaypoints([]);
			await router.invalidate();
		} catch (error) {
			snack.error(errorMessage(error, 'Could not save GPS'));
		} finally {
			setBusy(false);
		}
	}

	if (!missing && !hasMap) return null;
	if (!missing && hasMap && !authed && !routeId) return null;
	if (!missing) return null;

	return (
		<div className={cn(ui.panel, 'mb-4')}>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					<h3 className="m-0">GPS</h3>
					<p className={cn(ui.muted, 'm-0 mt-[0.3rem]')}>{gps.summary}</p>
				</div>
				<div className="flex flex-wrap gap-2">
					{authed && !editing && (
						<button
							className={cn(ui.btnPrimary, ui.btnSm)}
							type="button"
							onClick={() => setEditing(true)}
						>
							Add GPS
						</button>
					)}
				</div>
			</div>

			{groupedSessionId && (
				<p className={cn(ui.muted, 'm-0 mt-3 text-[0.92rem]')}>
					This is one part of a{' '}
					<Link className="text-accent-fg font-semibold" to="/groups/$id" params={{ id: groupedSessionId }}>
						grouped session
					</Link>
					. GPS is saved on this part only — a combined export keeps separate segments (a pause between files).
					{contextTracks.length > 0
						? ' Other parts with GPS are shown on the map so you can join onto them.'
						: ''}
				</p>
			)}

			{authed && editing ? (
				<div className="mt-4 grid gap-3">
					<p className={cn(ui.muted, 'm-0 text-[0.92rem]')}>
						Place pins in order for how you actually travelled. Drag to adjust, undo the last pin if needed.
						Watch GPS is not smoothed — this only fills a missing track.
					</p>
					<GpsWaypointMap waypoints={waypoints} contextTracks={contextTracks} onChange={setWaypoints} />
					<div className={cn(ui.actions, 'justify-start!')}>
						<button
							className={cn(ui.btnGhost, ui.btnSm)}
							type="button"
							disabled={busy}
							onClick={() => setEditing(false)}
						>
							Close
						</button>
						<button
							className={cn(ui.btnGhost, ui.btnSm)}
							type="button"
							disabled={busy || waypoints.length === 0}
							onClick={() => setWaypoints((w) => w.slice(0, -1))}
						>
							Undo pin
						</button>
						<button
							className={cn(ui.btnGhost, ui.btnSm)}
							type="button"
							disabled={busy || waypoints.length === 0}
							onClick={() => setWaypoints([])}
						>
							Clear
						</button>
						<button
							className={cn(ui.btnPrimary, ui.btnSm)}
							type="button"
							disabled={busy || waypoints.length < 2}
							onClick={() => void save('waypoints')}
						>
							{busy ? 'Saving…' : 'Save GPS'}
						</button>
					</div>
					<label className="flex items-start gap-2 text-[0.88rem] text-muted m-0">
						<input
							className="mt-1"
							type="checkbox"
							checked={followNetwork}
							disabled={busy}
							onChange={(e) => setFollowNetwork(e.target.checked)}
						/>
						<span>
							Follow roads between pins (BRouter bike/hike network — not trains). Leave off to keep the line you
							drew.
						</span>
					</label>
					{repairRoutes.length > 0 && (
						<div>
							<button
								className={cn(ui.btnGhost, ui.btnSm)}
								type="button"
								onClick={() => setShowPlanned((v) => !v)}
							>
								{showPlanned ? 'Hide saved routes' : 'Use a saved planned route instead'}
							</button>
							{showPlanned && (
								<div className="mt-3 grid gap-3">
									<label className={ui.field}>
										<span>Planned route</span>
										<select
											value={plannedSlug}
											disabled={busy}
											onChange={(event) => setPlannedSlug(event.target.value)}
										>
											<option value="">Choose a route…</option>
											{repairRoutes.map((route) => (
												<option key={route.slug} value={route.slug}>
													{route.name}
													{route.distance_km != null ? ` · ${route.distance_km} km` : ''}
												</option>
											))}
										</select>
									</label>
									<button
										className={cn(ui.btnGhost, ui.btnSm)}
										type="button"
										disabled={busy || !plannedSlug}
										onClick={() => void save('planned')}
									>
										Build track from route
									</button>
								</div>
							)}
						</div>
					)}
				</div>
			) : authed ? null : (
				<p className={cn(ui.muted, 'm-0 mt-3 text-[0.92rem]')}>Sign in to add a GPS track with map pins.</p>
			)}
		</div>
	);
}
