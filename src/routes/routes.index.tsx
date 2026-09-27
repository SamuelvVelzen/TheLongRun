import {
	Actions,
	Button,
	buttonClass,
	panelClass,
	fieldClass,
	reqClass,
	gridClass,
	sectionTitleClass,
	dropzoneClass,
	runTitleClass,
	runRowClass,
	tagClass
} from '../components/ui';
import { AuthGate, useAuthed } from '$lib/auth';
import {
    createPlannedRoute,
    deletePlannedRoute,
    getPlannedRoutesData,
    importPlannedRoute
} from '$lib/server/functions';
import { appHead } from '$lib/title';
import type { PlannedRoute } from '$lib/types';
import { cn } from '$lib/ui';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { DeferredData } from '../components/DeferredData';
import { DeleteButton } from '../components/DeleteButton';
import { ConfirmDialog } from '../components/Dialog';
import { Icon } from '../components/Icon';
import { OpenRouteBadge } from '../components/OpenRouteBadge';
import { PageHero } from '../components/PageHero';
import { MapPinIcon } from '../components/RouteChip';
import { RoutesHeatmap, type RouteMeta } from '../components/RoutesHeatmap';
import { errorMessage, useSnackbar } from '../components/Snackbar';
import { WaypointEditor } from '../components/WaypointEditor';

type RoutesSearch = { draw?: boolean };

type PlannedRouteImportResult = {
	name: string;
	status: 'ok' | 'error';
	slug?: string;
	message?: string;
};

function routeImportFiles(list: FileList | null): File[] {
	if (!list) return [];
	return Array.from(list).filter((f) => /\.(gpx|geojson|json)$/i.test(f.name));
}

async function refreshRoutesList(router: ReturnType<typeof useRouter>) {
	await router.invalidate();
	const match = router.state.matches.find((m) => m.routeId === '/routes/');
	const page = (match?.loaderData as { page?: Promise<unknown> } | undefined)?.page;
	if (page) await page;
}

export const Route = createFileRoute('/routes/')({
	validateSearch: (s: Record<string, unknown>): RoutesSearch => ({
		draw: s.draw === true || s.draw === '1' || s.draw === 'true' ? true : undefined
	}),
	loader: () => ({ page: getPlannedRoutesData() }),
	head: () => appHead('Routes'),
	component: PlannedRoutes
});

function PlannedRoutes() {
	const { page } = Route.useLoaderData();
	const { draw } = Route.useSearch();
	const router = useRouter();
	const authed = useAuthed();
	const snack = useSnackbar();
	const [dragOver, setDragOver] = useState(false);
	const [busy, setBusy] = useState(false);
	const [drawing, setDrawing] = useState(() => Boolean(draw));
	const [routeName, setRouteName] = useState('');
	const [files, setFiles] = useState<File[]>([]);
	const [progress, setProgress] = useState('');
	const [results, setResults] = useState<PlannedRouteImportResult[]>([]);
	const [pendingFile, setPendingFile] = useState<string | null>(null);

	useEffect(() => {
		if (draw) setDrawing(true);
	}, [draw]);

	function closeDraw() {
		setDrawing(false);
		if (draw) void router.navigate({ to: '/routes', search: {} });
	}

	function addFiles(list: FileList | null) {
		const tracks = routeImportFiles(list);
		if (!tracks.length && list?.length) {
			snack.error('Use GPX (recommended) or GeoJSON.');
			return;
		}
		setFiles((prev) => {
			const names = new Set(prev.map((f) => f.name));
			return [...prev, ...tracks.filter((f) => !names.has(f.name))];
		});
	}

	function removeFile(name: string) {
		setFiles((prev) => prev.filter((f) => f.name !== name));
	}

	async function runImport() {
		if (!files.length) return;
		setBusy(true);
		setResults([]);
		const out: PlannedRouteImportResult[] = [];
		for (let i = 0; i < files.length; i++) {
			const f = files[i]!;
			setProgress(`Saving ${i + 1} / ${files.length}: ${f.name}`);
			try {
				const result = await importPlannedRoute({
					data: { text: await f.text(), filename: f.name }
				});
				out.push({ name: f.name, status: 'ok', slug: result.slug });
			} catch (error) {
				out.push({
					name: f.name,
					status: 'error',
					message: errorMessage(error, 'Import failed')
				});
			}
			setResults([...out]);
		}
		setProgress('');
		setBusy(false);
		setFiles([]);
		const ok = out.filter((r) => r.status === 'ok');
		const fail = out.filter((r) => r.status === 'error');
		if (ok.length && !fail.length) {
			snack.success(
				ok.length === 1 ? `Saved ${ok[0]!.name}` : `Saved ${ok.length} routes — compare them on the map below`
			);
		} else if (ok.length) {
			snack.info(`Saved ${ok.length} of ${out.length} routes`);
		} else {
			snack.error(fail[0]?.message ?? 'Import failed');
		}
		if (ok.length) {
			await refreshRoutesList(router);
			if (ok.length === 1 && ok[0]?.slug) {
				await router.navigate({ to: '/routes/$slug', params: { slug: ok[0].slug } });
			}
		}
	}

	async function saveDrawn(data: {
		waypoints: { lat: number; lng: number }[];
		followNetwork: boolean;
		networkCoords: { lat: number; lng: number; elev?: number }[];
	}) {
		const name = routeName.trim();
		if (!name) {
			snack.info('Name this route first.');
			return;
		}
		if (data.waypoints.length < 2) {
			snack.info('Drop at least two pins — start and end, plus any turns in between.');
			return;
		}
		setBusy(true);
		try {
			const result = await createPlannedRoute({
				data: {
					name,
					waypoints: data.waypoints,
					follow_network: data.followNetwork,
					network_coords:
						data.followNetwork && data.networkCoords.length >= 2 ? data.networkCoords : undefined
				}
			});
			snack.success(`Saved ${result.name}`);
			setRouteName('');
			setDrawing(false);
			await refreshRoutesList(router);
			await router.navigate({ to: '/routes/$slug', params: { slug: result.slug } });
		} catch (error) {
			snack.error(errorMessage(error, 'Could not save route'));
			setBusy(false);
		}
	}

	return (
		<>
			<PageHero
				variant="quiet"
				kicker="Keep planned routes separate from completed activities"
				title="Routes"
				lead={
					<p>
						Draw a loop with pins, or import a <strong>GPX route</strong>. Open it later to attach
						the same loop to upcoming plan days or a logged activity.
					</p>
				}
			/>

			{authed ? (
			<div className="mb-5 grid gap-3">
				{drawing ? (
					<div className={panelClass()}>
						<WaypointEditor
							emptyHint="Tap to drop pins along the loop"
							hint="Place pins in order. Tap a pin to remove it, or tap the line to add one between. Drag to adjust."
							saveLabel="Save route"
							busy={busy}
							onClose={closeDraw}
							onSave={saveDrawn}
						>
							<label className={fieldClass}>
								<span className={reqClass}>Name</span>
								<input
									value={routeName}
									required
									autoComplete="off"
									placeholder="Saturday loop"
									disabled={busy}
									onChange={(event) => setRouteName(event.target.value)}
								/>
							</label>
						</WaypointEditor>
					</div>
				) : (
					<button
						className={buttonClass({ className: 'justify-self-start' })}
						type="button"
						onClick={() => setDrawing(true)}
					>
						<Icon name="map" size={16} />
						Draw a route
					</button>
				)}
				{drawing ? null : (
					<label
						className={dropzoneClass(dragOver && true)}
						onDragOver={(event) => {
							event.preventDefault();
							setDragOver(true);
						}}
						onDragLeave={() => setDragOver(false)}
						onDrop={(event) => {
							event.preventDefault();
							setDragOver(false);
							addFiles(event.dataTransfer.files);
						}}
					>
						<input
							type="file"
							accept=".gpx,.geojson,.json,application/gpx+xml,application/geo+json"
							multiple
							hidden
							disabled={busy}
							onChange={(event) => {
								addFiles(event.target.files);
								event.target.value = '';
							}}
						/>
						<Icon name="upload" size={34} />
						<strong>{busy ? progress || 'Saving routes…' : 'Choose GPX or GeoJSON'}</strong>
						<span className={'text-muted'}>
							Multiple BRouter exports OK — import them together, then compare overlap on the map
						</span>
						<span className={cn('text-muted', 'hidden [@media(hover:hover)_and_(pointer:fine)]:block')}>
							You can also drop files here
						</span>
					</label>
				)}
				{files.length > 0 && !drawing ? (
					<>
						<ul className="list-none m-0 p-0 grid gap-1.5">
							{files.map((f) => (
								<li
									key={f.name}
									className="flex items-center gap-[0.6rem] p-[0.5rem_0.7rem] border border-line rounded-[10px] bg-inset text-[0.9rem]"
								>
									<code className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
										{f.name}
									</code>
									<span className={'text-muted'}>{(f.size / 1024).toFixed(0)} KB</span>
									<DeleteButton
										label={`Remove ${f.name}`}
										disabled={busy}
										onClick={() => setPendingFile(f.name)}
									/>
								</li>
							))}
						</ul>
						<Actions>
							<Button
								type="button"
								variant="primary"
								disabled={busy || files.length === 0}
								onClick={() => void runImport()}
							>
								<Icon name="upload" size={16} />
								{busy
									? progress || 'Saving…'
									: `Import ${files.length} ${files.length === 1 ? 'route' : 'routes'}`}
							</Button>
						</Actions>
					</>
				) : null}
				{results.length > 0 ? (
					<div className="mt-1">
						<h3 className="m-0 text-[1rem]">
							Saved {results.filter((r) => r.status === 'ok').length} / {results.length}
						</h3>
						<ul className="list-none m-[0.85rem_0_0] p-0 grid gap-2 text-[0.92rem]">
							{results.map((r) => (
								<li
									key={r.name}
									className="flex flex-wrap items-center gap-[0.45rem] py-2 border-b border-line last:border-b-0"
								>
									<span className={tagClass(r.status === 'ok')}>
										<Icon name={r.status === 'ok' ? 'check' : 'close'} size={12} />
										{r.status}
									</span>
									<code>{r.name}</code>
									{r.slug ? (
										<>
											{' → '}
											<Link to="/routes/$slug" params={{ slug: r.slug }}>
												Open
											</Link>
										</>
									) : null}
									{r.message ? <span className={'text-muted'}>— {r.message}</span> : null}
								</li>
							))}
						</ul>
					</div>
				) : null}
				<ConfirmDialog
					open={pendingFile != null}
					title="Remove this file?"
					description={pendingFile ? `“${pendingFile}” will be dropped from the import list.` : null}
					confirmLabel="Remove"
					onClose={() => setPendingFile(null)}
					onConfirm={() => {
						if (pendingFile) removeFile(pendingFile);
					}}
				/>
			</div>
			) : null}
			<DeferredData promise={page}>
				{(data) => <PlannedRoutesList data={data} />}
			</DeferredData>
		</>
	);
}

function PlannedRoutesList({
	data
}: {
	data: Awaited<ReturnType<typeof getPlannedRoutesData>>;
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
				<div className={sectionTitleClass('mt-2')}>
					<div>
						<h2 id="planned-routes-map">Saved route map</h2>
						<p>
							{data.tracks.length
								? `${data.tracks.length} planned route${data.tracks.length === 1 ? '' : 's'} · click a line to open`
								: 'Draw or import a route to see it here'}
						</p>
					</div>
				</div>
				<RoutesHeatmap
					tracks={data.tracks}
					meta={meta}
					focusIds={[]}
					detailPath="/routes/$slug"
					emptyText="No planned routes yet — draw one or import a GPX."
				/>
			</section>

			<div className={sectionTitleClass()}>
				<div>
					<h2>Saved routes</h2>
					<p>{data.routes.length} total · open a route to attach it to a plan day</p>
				</div>
			</div>
			<div className={gridClass()}>
				{data.routes.map((route) => (
					<PlannedRouteRow key={route.slug} route={route} />
				))}
			</div>
		</>
	);
}

function LinkedFlag({
	count,
	kind
}: {
	count: number;
	kind: 'plan' | 'activity';
}) {
	if (count <= 0) return null;
	const noun =
		kind === 'activity'
			? count === 1
				? 'activity'
				: 'activities'
			: count === 1
				? 'plan day'
				: 'plan days';
	return (
		<span className="inline-flex items-center gap-1 text-accent-fg font-bold">
			<MapPinIcon size={13} />
			{count} {noun}
		</span>
	);
}

function linkSummary(route: PlannedRoute) {
	const location = [route.place, route.country].filter(Boolean).join(', ') || `Saved ${route.saved_on}`;
	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
			<span>{location}</span>
			<LinkedFlag count={route.plan_link_count} kind="plan" />
			<LinkedFlag count={route.activity_link_count} kind="activity" />
		</div>
	);
}

function PlannedRouteRow({
	route
}: {
	route: PlannedRoute;
}) {
	const router = useRouter();
	const snack = useSnackbar();
	const [pendingDelete, setPendingDelete] = useState(false);

	async function onDeleteRoute(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		setPendingDelete(true);
	}

	async function confirmDelete() {
		try {
			await deletePlannedRoute({ data: route.slug });
			await router.invalidate();
		} catch (error) {
			snack.error(errorMessage(error, 'Delete failed'));
			throw error;
		}
	}

	return (
		<div className="relative group">
			<div
				className={runRowClass(
					'grid-cols-[1.35fr_0.55fr_0.65fr_0.65fr] pr-[3.25rem] cursor-pointer',
					(route.plan_link_count > 0 || route.activity_link_count > 0) &&
						'border-[color-mix(in_srgb,var(--color-accent)_40%,var(--color-line))]'
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
					<div className={cn(runTitleClass, 'font-[650] mb-[0.15rem]')}>
						<span className="min-w-0">{route.name}</span>
						{route.open_gap_m != null && <OpenRouteBadge gapMeters={route.open_gap_m} />}
					</div>
					<div className={'text-muted'}>{linkSummary(route)}</div>
				</div>
				<div>{route.distance_km ?? '—'} km</div>
				<div>{route.elev_gain != null ? `↑ ${route.elev_gain} m` : 'Elevation —'}</div>
				{route.waypoints.length > 0 ? (
					<div>
						{route.waypoints.length} waypoint{route.waypoints.length === 1 ? '' : 's'}
					</div>
				) : null}
			</div>
			<AuthGate>
			<DeleteButton
				className="absolute top-0 bottom-0 right-[0.55rem] z-[2] my-auto opacity-100 sm:opacity-55 group-hover:opacity-100"
				label={`Delete route ${route.name}`}
				onClick={(event) => void onDeleteRoute(event)}
			/>
			</AuthGate>
			<ConfirmDialog
				open={pendingDelete}
				title="Delete this route?"
				description={`“${route.name}” will be removed. This cannot be undone.`}
				onClose={() => setPendingDelete(false)}
				onConfirm={confirmDelete}
			/>
		</div>
	);
}
