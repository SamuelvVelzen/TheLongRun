import type { GpsContextTrack, GpsPoint, GpsWaypoint } from '$lib/gps-repair';
import { previewGpsNetwork } from '$lib/server/functions';
import { cn, ui } from '$lib/ui';
import { type ReactNode, useEffect, useState } from 'react';
import { GpsWaypointMap } from './GpsWaypointMap';
import { Icon } from './Icon';

export type WaypointEditorSave = {
	waypoints: GpsWaypoint[];
	followNetwork: boolean;
	networkCoords: GpsPoint[];
};

export function WaypointEditor({
	contextTracks = [],
	emptyHint,
	hint,
	saveLabel,
	busy = false,
	onClose,
	onSave,
	children
}: {
	contextTracks?: GpsContextTrack[];
	emptyHint?: string;
	hint?: ReactNode;
	saveLabel: string;
	busy?: boolean;
	onClose?: () => void;
	onSave: (data: WaypointEditorSave) => void | Promise<void>;
	children?: ReactNode;
}) {
	const [waypoints, setWaypoints] = useState<GpsWaypoint[]>([]);
	const [past, setPast] = useState<GpsWaypoint[][]>([]);
	const [future, setFuture] = useState<GpsWaypoint[][]>([]);
	const [followNetwork, setFollowNetwork] = useState(true);
	const [routePreview, setRoutePreview] = useState<GpsPoint[]>([]);
	const [routing, setRouting] = useState(false);

	function apply(next: GpsWaypoint[]) {
		setPast((p) => [...p, waypoints].slice(-40));
		setFuture([]);
		setWaypoints(next);
	}

	function undo() {
		if (!past.length) return;
		const prev = past[past.length - 1]!;
		setPast((p) => p.slice(0, -1));
		setFuture((f) => [waypoints, ...f].slice(0, 40));
		setWaypoints(prev);
	}

	function redo() {
		if (!future.length) return;
		const next = future[0]!;
		setFuture((f) => f.slice(1));
		setPast((p) => [...p, waypoints].slice(-40));
		setWaypoints(next);
	}

	useEffect(() => {
		if (!followNetwork || waypoints.length < 2) {
			setRoutePreview([]);
			setRouting(false);
			return;
		}
		let cancelled = false;
		setRouting(true);
		const timer = window.setTimeout(() => {
			void previewGpsNetwork({ data: { waypoints } })
				.then((res) => {
					if (!cancelled) setRoutePreview(res.coords);
				})
				.catch(() => {
					if (!cancelled) setRoutePreview([]);
				})
				.finally(() => {
					if (!cancelled) setRouting(false);
				});
		}, 400);
		return () => {
			cancelled = true;
			window.clearTimeout(timer);
		};
	}, [followNetwork, waypoints]);

	return (
		<div className="grid gap-3">
			{children}
			{hint ? <p className={cn(ui.muted, 'm-0 text-[0.92rem]')}>{hint}</p> : null}
			<GpsWaypointMap
				waypoints={waypoints}
				contextTracks={contextTracks}
				emptyHint={emptyHint}
				previewCoords={
					followNetwork && routePreview.length >= 2
						? routePreview.map((p) => [p.lat, p.lng] as [number, number])
						: undefined
				}
				status={
					routing
						? 'Following roads…'
						: followNetwork && waypoints.length >= 2 && !routePreview.length
							? 'Straight line — roads unavailable'
							: undefined
				}
				onChange={apply}
			/>
			<div className="flex flex-wrap items-center gap-2">
				<button
					className={cn(ui.btnGhost, ui.btnIcon)}
					type="button"
					disabled={busy || past.length === 0}
					aria-label="Undo pin"
					title="Undo"
					onClick={undo}
				>
					<Icon name="undo" size={16} />
				</button>
				<button
					className={cn(ui.btnGhost, ui.btnIcon)}
					type="button"
					disabled={busy || future.length === 0}
					aria-label="Redo pin"
					title="Redo"
					onClick={redo}
				>
					<Icon name="redo" size={16} />
				</button>
				<button
					className={cn(ui.btnGhost, ui.btnSm)}
					type="button"
					disabled={busy || waypoints.length === 0}
					onClick={() => apply([])}
				>
					Clear
				</button>
				<label className="ml-auto flex items-center gap-2.5 text-[0.88rem] text-muted m-0 cursor-pointer select-none">
					<span className="text-right leading-snug">Follow roads</span>
					<input
						className="size-4 shrink-0 accent-[var(--accent,#c8f25a)]"
						type="checkbox"
						checked={followNetwork}
						disabled={busy}
						onChange={(e) => setFollowNetwork(e.target.checked)}
					/>
				</label>
			</div>
			<p className={cn(ui.muted, 'm-0 text-[0.78rem] text-right')}>
				BRouter bike/hike network — not trains. Uncheck to keep the line you drew.
			</p>
			<div className="flex flex-wrap justify-end gap-2">
				{onClose ? (
					<button className={cn(ui.btnGhost, ui.btnSm)} type="button" disabled={busy} onClick={onClose}>
						Close
					</button>
				) : null}
				<button
					className={cn(ui.btnPrimary, ui.btnSm)}
					type="button"
					disabled={busy || waypoints.length < 2}
					onClick={() =>
						void onSave({
							waypoints,
							followNetwork,
							networkCoords: followNetwork && routePreview.length >= 2 ? routePreview : []
						})
					}
				>
					{busy ? 'Saving…' : saveLabel}
				</button>
			</div>
		</div>
	);
}
