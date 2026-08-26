import { deletePlannedRoute, getPlannedRoutesData, importPlannedRoute, updatePlannedRoute } from '$lib/server/functions';
import type { PlannedRoute } from '$lib/types';
import { cn, ui } from '$lib/ui';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { DeferredData } from '../components/DeferredData';
import { RoutesHeatmap, type RouteMeta } from '../components/RoutesHeatmap';

export const Route = createFileRoute('/routes/')({
	loader: () => ({ page: getPlannedRoutesData() }),
	component: PlannedRoutes
});

function PlannedRoutes() {
	const { page } = Route.useLoaderData();
	const router = useRouter();
	const [dragOver, setDragOver] = useState(false);
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState('');

	async function importFile(file: File | undefined) {
		if (!file) return;
		if (!/\.(gpx|geojson|json)$/i.test(file.name)) {
			setMessage('Use GPX (recommended) or GeoJSON.');
			return;
		}
		setBusy(true);
		setMessage('');
		try {
			const result = await importPlannedRoute({
				data: { text: await file.text(), filename: file.name }
			});
			await router.navigate({ to: '/routes/$slug', params: { slug: result.slug } });
		} catch (error) {
			setMessage(error instanceof Error ? error.message : 'Import failed');
			setBusy(false);
		}
	}

	return (
		<>
			<section className={ui.hero}>
				<div>
					<p className={ui.muted}>Keep planned routes separate from completed activities</p>
					<h1>Routes</h1>
					<p>
						Import a <strong>GPX route</strong>, then open it to attach the loop to upcoming plan
						days or a logged activity. The same route can cover more than one day.
					</p>
				</div>
			</section>

			<label
				className={cn(ui.dropzone, 'mb-5', dragOver && ui.dropzoneOver)}
				onDragOver={(event) => {
					event.preventDefault();
					setDragOver(true);
				}}
				onDragLeave={() => setDragOver(false)}
				onDrop={(event) => {
					event.preventDefault();
					setDragOver(false);
					void importFile(event.dataTransfer.files[0]);
				}}
			>
				<input
					type="file"
					accept=".gpx,.geojson,.json,application/gpx+xml,application/geo+json"
					hidden
					disabled={busy}
					onChange={(event) => void importFile(event.target.files?.[0])}
				/>
				<strong>{busy ? 'Saving route…' : 'Choose a GPX'}</strong>
				<span className={ui.muted}>or tap to browse · waypoints are imported when available</span>
				<span className={cn(ui.muted, 'hidden [@media(hover:hover)_and_(pointer:fine)]:block')}>
					You can also drop a GPX or GeoJSON file here
				</span>
			</label>
			{message && <div className={ui.flash}>{message}</div>}
			<DeferredData promise={page}>
				{(data) => <PlannedRoutesList data={data} onMessage={setMessage} />}
			</DeferredData>
		</>
	);
}

function PlannedRoutesList({
	data,
	onMessage
}: {
	data: Awaited<ReturnType<typeof getPlannedRoutesData>>;
	onMessage: (msg: string) => void;
}) {
	const meta = useMemo<RouteMeta>(() => {
		const out: RouteMeta = {};
		for (const route of data.routes) {
			const location = [route.place, route.country].filter(Boolean).join(', ');
			const attached =
				route.plan_link_count > 0
					? `${route.plan_link_count} plan day${route.plan_link_count === 1 ? '' : 's'}`
					: '';
			out[route.slug] = {
				slug: route.slug,
				title: route.name,
				sub: [route.distance_km != null ? `${route.distance_km} km` : null, location, attached]
					.filter(Boolean)
					.join(' · ')
			};
		}
		return out;
	}, [data.routes]);

	return (
		<>
			<section className="mb-1" aria-labelledby="planned-routes-map">
				<div className={cn(ui.sectionTitle, 'mt-2')}>
					<div>
						<h2 id="planned-routes-map">Saved route map</h2>
						<p>
							{data.tracks.length
								? `${data.tracks.length} planned route${data.tracks.length === 1 ? '' : 's'} · click a line to open`
								: 'Import a route to see it here'}
						</p>
					</div>
				</div>
				<RoutesHeatmap
					tracks={data.tracks}
					meta={meta}
					focusIds={[]}
					detailPath="/routes/$slug"
					emptyText="No planned routes yet — drop a GPX route above."
				/>
			</section>

			<div className={ui.sectionTitle}>
				<div>
					<h2>Saved routes</h2>
					<p>{data.routes.length} total · open a route to attach it to a plan day</p>
				</div>
			</div>
			<div className={ui.grid}>
				{data.routes.map((route) => (
					<PlannedRouteRow key={route.slug} route={route} onMessage={onMessage} />
				))}
			</div>
		</>
	);
}

function linkSummary(route: PlannedRoute): string {
	const parts: string[] = [];
	const location = [route.place, route.country].filter(Boolean).join(', ');
	if (location) parts.push(location);
	else parts.push(`Saved ${route.saved_on}`);
	if (route.plan_link_count > 0) {
		parts.push(`${route.plan_link_count} plan day${route.plan_link_count === 1 ? '' : 's'}`);
	}
	if (route.activity_link_count > 0) {
		parts.push(
			`${route.activity_link_count} activit${route.activity_link_count === 1 ? 'y' : 'ies'}`
		);
	}
	return parts.join(' · ');
}

function PlannedRouteRow({
	route,
	onMessage
}: {
	route: PlannedRoute;
	onMessage: (msg: string) => void;
}) {
	const router = useRouter();
	const [name, setName] = useState(route.name);

	useEffect(() => {
		setName(route.name);
	}, [route.name]);

	async function persistName() {
		const trimmed = name.trim();
		if (!trimmed) {
			setName(route.name);
			return;
		}
		if (trimmed === route.name) return;
		try {
			await updatePlannedRoute({ data: { slug: route.slug, name: trimmed } });
			await router.invalidate();
		} catch (error) {
			setName(route.name);
			onMessage(error instanceof Error ? error.message : 'Save failed');
		}
	}

	async function onDeleteRoute(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		if (!confirm(`Delete planned route “${route.name}”?`)) return;
		try {
			await deletePlannedRoute({ data: route.slug });
			await router.invalidate();
		} catch (error) {
			onMessage(error instanceof Error ? error.message : 'Delete failed');
		}
	}

	return (
		<div className="relative group">
			<div
				className={cn(
					ui.runRow,
					'grid-cols-[1.35fr_0.55fr_0.65fr_0.65fr] pr-[3.25rem] cursor-pointer'
				)}
				role="link"
				tabIndex={0}
				title="Open route"
				onClick={() => void router.navigate({ to: '/routes/$slug', params: { slug: route.slug } })}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						void router.navigate({ to: '/routes/$slug', params: { slug: route.slug } });
					}
				}}
			>
				<div>
					<input
						className="block w-full max-w-full m-[-0.05rem_-0.35rem_0.15rem] px-[0.35rem] py-[0.05rem] border border-dashed border-transparent rounded-[10px] bg-transparent text-inherit font-inherit font-[650] cursor-text hover:border-line focus:border-solid focus:border-accent focus:outline-none"
						value={name}
						required
						aria-label={`Route name, currently ${route.name}`}
						onClick={(event) => event.stopPropagation()}
						onMouseDown={(event) => event.stopPropagation()}
						onKeyDown={(event) => {
							event.stopPropagation();
							if (event.key === 'Enter') {
								event.preventDefault();
								(event.target as HTMLInputElement).blur();
							}
							if (event.key === 'Escape') {
								event.preventDefault();
								setName(route.name);
								(event.target as HTMLInputElement).blur();
							}
						}}
						onChange={(event) => setName(event.target.value)}
						onBlur={() => void persistName()}
					/>
					<div className={ui.muted}>{linkSummary(route)}</div>
				</div>
				<div>{route.distance_km ?? '—'} km</div>
				<div>{route.elev_gain != null ? `↑ ${route.elev_gain} m` : 'Elevation —'}</div>
				<div>
					{route.waypoints.length} waypoint{route.waypoints.length === 1 ? '' : 's'}
				</div>
			</div>
			<button
				className={cn(
					ui.btnGhost,
					ui.btnDanger,
					ui.btnIcon,
					'absolute top-0 bottom-0 right-[0.55rem] z-[2] my-auto opacity-100 sm:opacity-55 group-hover:opacity-100'
				)}
				type="button"
				aria-label={`Delete route ${route.name}`}
				title="Delete route"
				onClick={(event) => void onDeleteRoute(event)}
			>
				<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
					<path
						fill="currentColor"
						d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9zm-1 12h12l1-12H5l1 12z"
					/>
				</svg>
			</button>
		</div>
	);
}
