import { buttonClass } from './ui';
import type { GpsContextTrack, GpsPoint, GpsWaypoint } from '$lib/gps-repair';
import { previewGpsNetwork } from '$lib/server/functions';
import { cn } from '$lib/ui';
import { type ReactNode, type Ref, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { GpsWaypointMap } from './GpsWaypointMap';
import { Icon } from './Icon';

export type WaypointEditorSave = {
	waypoints: GpsWaypoint[];
	followNetwork: boolean;
	networkCoords: GpsPoint[];
};

export type WaypointEditorHandle = {
	snapshot: () => WaypointEditorSave;
	isDirty: () => boolean;
};

function samePins(a: GpsWaypoint[], b: GpsWaypoint[]) {
	if (a.length !== b.length) return false;
	return a.every((point, i) => {
		const other = b[i];
		return other != null && point.lat === other.lat && point.lng === other.lng;
	});
}

export function WaypointEditor({
	ref,
	initialWaypoints = [],
	contextTracks = [],
	emptyHint,
	hint,
	saveLabel,
	busy = false,
	embedded = false,
	onClose,
	onSave,
	children
}: {
	ref?: Ref<WaypointEditorHandle>;
	initialWaypoints?: GpsWaypoint[];
	contextTracks?: GpsContextTrack[];
	emptyHint?: string;
	hint?: ReactNode;
	saveLabel?: string;
	busy?: boolean;
	embedded?: boolean;
	onClose?: () => void;
	onSave?: (data: WaypointEditorSave) => void | Promise<void>;
	children?: ReactNode;
}) {
	const initialRef = useRef(initialWaypoints.map((point) => ({ lat: point.lat, lng: point.lng })));
	const [waypoints, setWaypoints] = useState<GpsWaypoint[]>(() =>
		initialRef.current.map((point) => ({ lat: point.lat, lng: point.lng }))
	);
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

	useImperativeHandle(
		ref,
		() => ({
			snapshot: () => ({
				waypoints,
				followNetwork,
				networkCoords: followNetwork && routePreview.length >= 2 ? routePreview : []
			}),
			isDirty: () => followNetwork !== true || !samePins(waypoints, initialRef.current)
		}),
		[followNetwork, routePreview, waypoints]
	);

	return (
		<div className="grid gap-3">
			{children}
			{hint ? <p className={cn('text-muted', 'm-0 text-[0.92rem]')}>{hint}</p> : null}
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
					className={buttonClass({ variant: 'ghost', size: 'icon' })}
					type="button"
					disabled={busy || past.length === 0}
					aria-label="Undo pin"
					title="Undo"
					onClick={undo}
				>
					<Icon name="undo" size={16} />
				</button>
				<button
					className={buttonClass({ variant: 'ghost', size: 'icon' })}
					type="button"
					disabled={busy || future.length === 0}
					aria-label="Redo pin"
					title="Redo"
					onClick={redo}
				>
					<Icon name="redo" size={16} />
				</button>
				<button
					className={buttonClass({ variant: 'ghost', size: 'sm' })}
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
			<p className={cn('text-muted', 'm-0 text-[0.78rem] text-right')}>
				BRouter bike/hike network — not trains. Uncheck to keep the line you drew.
			</p>
			{embedded ? null : (
				<div className="flex flex-wrap justify-end gap-2">
					{onClose ? (
						<button className={buttonClass({ variant: 'ghost', size: 'sm' })} type="button" disabled={busy} onClick={onClose}>
							Close
						</button>
					) : null}
					<button
						className={buttonClass({ size: 'sm' })}
						type="button"
						disabled={busy || waypoints.length < 2 || !onSave}
						onClick={() =>
							void onSave?.({
								waypoints,
								followNetwork,
								networkCoords: followNetwork && routePreview.length >= 2 ? routePreview : []
							})
						}
					>
						{busy ? 'Saving…' : saveLabel ?? 'Save'}
					</button>
				</div>
			)}
		</div>
	);
}
