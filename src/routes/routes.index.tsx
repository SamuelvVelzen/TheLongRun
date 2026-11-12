import { AuthGate, useAuthed } from '$lib/auth';
import {
	collapsePlannedRoutes,
	groupedRouteTitle,
	type PlannedRouteListItem
} from '$lib/planned-route-group';
import {
	createPlannedRouteGroupFn,
	deletePlannedRoute,
	deletePlannedRoutesFn,
	getPlannedRoutesData,
	importPlannedRoute
} from '$lib/server/functions';
import { appHead } from '$lib/title';
import type { PlannedRoute } from '$lib/types';
import { cn } from '$lib/ui';
import { createFileRoute, Link, useNavigate, useRouter } from '@tanstack/react-router';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { DeferredData } from '../components/DeferredData';
import { DeleteButton, EditButton, TrashIcon } from '../components/DeleteButton';
import { Icon } from '../components/Icon';
import { MoreMenu } from '../components/MoreMenu';
import { OpenRouteBadge } from '../components/OpenRouteBadge';
import { MapPinIcon } from '../components/RouteChip';
import type { RouteMeta } from '../components/RoutesHeatmap';
import {
	Actions,
	Button,
	ConfirmDialog,
	errorMessage,
	Grid,
	IconLabelButton,
	PageHero,
	SectionTitle,
	Tag,
	useSnackbar
} from '../components/ui';
import { dropzoneClass, runRowClass, runTitleClass } from '../components/ui/Chrome';

const RoutesHeatmap = lazy(() =>
	import('../components/RoutesHeatmap').then((m) => ({ default: m.RoutesHeatmap }))
);

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
		draw:
			s.draw === true || s.draw === '1' || s.draw === 'true' ? true : undefined
	}),
	loader: () => ({ page: getPlannedRoutesData() }),
	head: () => appHead('Routes'),
	component: PlannedRoutes
});

function PlannedRoutes() {
	const { page } = Route.useLoaderData();
	const { draw } = Route.useSearch();
	const router = useRouter();
	const navigate = useNavigate();
	const authed = useAuthed();
	const snack = useSnackbar();
	const [dragOver, setDragOver] = useState(false);
	const [busy, setBusy] = useState(false);
	const [files, setFiles] = useState<File[]>([]);
	const [progress, setProgress] = useState('');
	const [results, setResults] = useState<PlannedRouteImportResult[]>([]);
	const [pendingFile, setPendingFile] = useState<string | null>(null);

	useEffect(() => {
		if (draw) void navigate({ to: '/routes/draw', replace: true });
	}, [draw, navigate]);

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
				ok.length === 1
					? `Saved ${ok[0]!.name}`
					: `Saved ${ok.length} routes — compare them on the map below`
			);
		} else if (ok.length) {
			snack.info(`Saved ${ok.length} of ${out.length} routes`);
		} else {
			snack.error(fail[0]?.message ?? 'Import failed');
		}
		if (ok.length) {
			await refreshRoutesList(router);
			if (ok.length === 1 && ok[0]?.slug) {
				await router.navigate({
					to: '/routes/$slug',
					params: { slug: ok[0].slug },
					resetScroll: true
				});
			}
		}
	}

	return (
		<>
			<PageHero
				variant="quiet"
				className="grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2"
				kicker="Keep planned routes separate from completed activities"
				title="Routes"
				lead={
					<p>
						Draw a loop with pins, or import a <strong>GPX route</strong>. Open it later to attach
						the same loop to upcoming plan days or a logged activity.
					</p>
				}
				actionsClassName="justify-end! self-start max-sm:w-auto max-sm:[&>button]:flex-none max-sm:[&>button]:min-w-11"
				actions={
					authed ? (
						<IconLabelButton
							label="Draw a route"
							variant="primary"
							size="default"
							icon={<Icon name="map" size={16} />}
							onClick={() => void navigate({ to: '/routes/draw' })}
						/>
					) : null
				}
			/>

			{authed ? (
				<div className="mb-5 grid gap-3">
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
							<span
								className={cn(
									'text-muted',
									'hidden [@media(hover:hover)_and_(pointer:fine)]:block'
								)}
							>
								You can also drop files here
							</span>
						</label>
					{files.length > 0 ? (
						<>
							<ul className="list-none m-0 p-0 grid gap-1.5">
								{files.map((f) => (
									<li
										key={f.name}
										className="flex items-center gap-[0.6rem] p-[0.5rem_0.7rem] border border-line rounded-inset bg-inset text-[0.9rem]"
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
										<Tag accent>
											<Icon name={r.status === 'ok' ? 'check' : 'close'} size={12} />
											{r.status}
										</Tag>
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
						description={
							pendingFile ? `“${pendingFile}” will be dropped from the import list.` : null
						}
						confirmLabel="Remove"
						onClose={() => setPendingFile(null)}
						onConfirm={() => {
							if (pendingFile) removeFile(pendingFile);
						}}
					/>
				</div>
			) : null}
			<DeferredData promise={page}>{(data) => <PlannedRoutesList data={data} />}</DeferredData>
		</>
	);
}

function RoutesSelectCheck({ on }: { on: boolean }) {
	return (
		<span
			className={cn(
				'inline-flex size-6 shrink-0 items-center justify-center rounded-[6px] border',
				on ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-canvas text-muted'
			)}
			aria-hidden
		>
			{on ? <Icon name="check" size={14} /> : null}
		</span>
	);
}

function RoutesMore({
	canGroup,
	onGroup,
	onDelete
}: {
	canGroup: boolean;
	onGroup: () => void;
	onDelete: () => void;
}) {
	return (
		<MoreMenu
			items={[
				{
					label: 'Group',
					icon: <Icon name="grid" size={16} />,
					onClick: onGroup,
					disabled: !canGroup
				},
				{
					label: 'Delete',
					icon: <TrashIcon className="size-4" />,
					onClick: onDelete,
					danger: true
				}
			]}
		/>
	);
}

function PlannedRoutesList({ data }: { data: Awaited<ReturnType<typeof getPlannedRoutesData>> }) {
	const router = useRouter();
	const snack = useSnackbar();
	const authed = useAuthed();
	const [selectMode, setSelectMode] = useState<'group' | 'delete' | null>(null);
	const [picked, setPicked] = useState<string[]>([]);
	const [pendingMass, setPendingMass] = useState(false);
	const selecting = selectMode != null;
	const groups = data.groups ?? [];
	const items = useMemo(
		() => collapsePlannedRoutes(data.routes, groups),
		[data.routes, groups]
	);
	const groupedSlugs = useMemo(() => new Set(groups.flatMap((g) => g.member_slugs)), [groups]);
	const ungroupedCount = data.routes.filter((r) => !groupedSlugs.has(r.slug)).length;
	const canGroup = ungroupedCount >= 2;

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

	function togglePick(slug: string) {
		setPicked((prev) => (prev.includes(slug) ? prev.filter((x) => x !== slug) : [...prev, slug]));
	}

	function toggleGroupPick(slugs: string[]) {
		setPicked((prev) => {
			const allOn = slugs.every((s) => prev.includes(s));
			if (allOn) return prev.filter((s) => !slugs.includes(s));
			return [...new Set([...prev, ...slugs])];
		});
	}

	function clearSelect() {
		setSelectMode(null);
		setPicked([]);
	}

	async function groupPicked() {
		if (picked.length < 2) return;
		try {
			const res = await createPlannedRouteGroupFn({ data: { slugs: picked } });
			clearSelect();
			await router.invalidate();
			await router.navigate({ to: '/route-groups/$id', params: { id: res.id } });
		} catch (err) {
			snack.error(errorMessage(err, 'Could not group those routes.'));
		}
	}

	async function deletePicked() {
		if (!picked.length) return;
		try {
			await deletePlannedRoutesFn({ data: picked });
			clearSelect();
			await router.invalidate();
		} catch (err) {
			snack.error(errorMessage(err, 'Could not delete those routes.'));
			throw err;
		}
	}

	return (
		<>
			<section className="mb-1" aria-labelledby="planned-routes-map">
				<SectionTitle className="mt-2">
					<div>
						<h2 id="planned-routes-map">Saved route map</h2>
						<p>
							{data.tracks.length
								? `${data.tracks.length} planned route${data.tracks.length === 1 ? '' : 's'} · click a line to open`
								: 'Draw or import a route to see it here'}
						</p>
					</div>
				</SectionTitle>
				<Suspense fallback={<p className="text-muted text-sm py-8 text-center">Loading map…</p>}>
					<RoutesHeatmap
						tracks={data.tracks}
						meta={meta}
						focusIds={[]}
						detailPath="/routes/$slug"
						emptyText="No planned routes yet — draw one or import a GPX."
					/>
				</Suspense>
			</section>

			{authed && selecting ? (
				<p className="text-muted text-[0.92rem] mb-3">
					{selectMode === 'delete'
						? 'Tap routes to delete. Grouped sets select every route in the group.'
						: 'Tap routes to combine them. Already grouped sets stay together.'}
				</p>
			) : null}

			<SectionTitle>
				<div>
					<h2>Saved routes</h2>
					<p>
						{data.routes.length} total
						{groups.length ? ` · ${groups.length} group${groups.length === 1 ? '' : 's'}` : ''} · open
						a route to attach it to a plan day
					</p>
				</div>
				{authed && items.length ? (
					<Actions className="max-sm:self-start">
						<RoutesMore
							canGroup={canGroup}
							onGroup={() => setSelectMode('group')}
							onDelete={() => setSelectMode('delete')}
						/>
					</Actions>
				) : null}
			</SectionTitle>
			<div className={selecting && authed ? 'pb-24' : undefined}>
				<Grid>
					{items.map((item) => (
						<PlannedRouteListItem
							key={item.kind === 'group' ? item.group.id : item.route.slug}
							item={item}
							selecting={selecting && authed}
							picked={picked}
							onTogglePick={togglePick}
							onToggleGroupPick={toggleGroupPick}
						/>
					))}
				</Grid>
			</div>
			{authed && selecting ? (
				<Actions sticky>
					<Button variant="ghost" type="button" onClick={clearSelect}>
						Cancel
					</Button>
					{selectMode === 'delete' ? (
						<Button
							variant="danger"
							stickyPrimary
							type="button"
							disabled={!picked.length}
							onClick={() => setPendingMass(true)}
						>
							Delete {picked.length || ''}
						</Button>
					) : (
						<Button
							stickyPrimary
							type="button"
							disabled={picked.length < 2}
							onClick={() => void groupPicked()}
						>
							Group {picked.length || ''}
						</Button>
					)}
				</Actions>
			) : null}
			<ConfirmDialog
				open={pendingMass}
				title={picked.length === 1 ? 'Delete this route?' : `Delete ${picked.length} routes?`}
				description="This cannot be undone."
				onClose={() => setPendingMass(false)}
				onConfirm={deletePicked}
			/>
		</>
	);
}

function PlannedRouteListItem({
	item,
	selecting,
	picked,
	onTogglePick,
	onToggleGroupPick
}: {
	item: PlannedRouteListItem;
	selecting: boolean;
	picked: string[];
	onTogglePick: (slug: string) => void;
	onToggleGroupPick: (slugs: string[]) => void;
}) {
	if (item.kind === 'group') {
		const slugs = item.members.map((m) => m.slug);
		const allOn = slugs.every((s) => picked.includes(s));
		if (selecting) {
			return (
				<button
					type="button"
					className={cn(
						runRowClass(
							'grid-cols-[auto_1fr_0.55fr_0.65fr] text-left w-full cursor-pointer',
							allOn && 'border-accent bg-accent/8'
						)
					)}
					aria-pressed={allOn}
					onClick={() => onToggleGroupPick(slugs)}
				>
					<RoutesSelectCheck on={allOn} />
					<PlannedRouteGroupBody item={item} />
				</button>
			);
		}
		return (
			<Link
				className={runRowClass(
					'grid-cols-[1.35fr_0.55fr_0.65fr_0.65fr] border-[color-mix(in_srgb,var(--color-accent)_35%,var(--color-line))] bg-accent/4'
				)}
				to="/route-groups/$id"
				params={{ id: item.group.id }}
			>
				<PlannedRouteGroupBody item={item} />
			</Link>
		);
	}

	if (selecting) {
		const on = picked.includes(item.route.slug);
		return (
			<button
				type="button"
				className={cn(
					runRowClass(
						'grid-cols-[auto_1fr_0.55fr_0.65fr_0.65fr] text-left w-full cursor-pointer pr-[0.55rem]',
						on && 'border-accent bg-accent/8'
					)
				)}
				aria-pressed={on}
				onClick={() => onTogglePick(item.route.slug)}
			>
				<RoutesSelectCheck on={on} />
				<PlannedRouteRowBody route={item.route} hideActions />
			</button>
		);
	}

	return <PlannedRouteRow route={item.route} />;
}

function PlannedRouteGroupBody({ item }: { item: Extract<PlannedRouteListItem, { kind: 'group' }> }) {
	const title = groupedRouteTitle(item.group, item.members.length);
	return (
		<>
			<div className="col-span-1 min-w-0">
				<div className={cn(runTitleClass, 'font-[650] mb-[0.15rem]')}>
					<Icon name="grid" size={14} className="inline mr-1 opacity-70" />
					{title}
				</div>
				<div className="text-muted text-[0.9rem]">
					{item.members.length} routes
					{item.stats.plan_link_count > 0
						? ` · ${item.stats.plan_link_count} plan link${item.stats.plan_link_count === 1 ? '' : 's'}`
						: ''}
				</div>
			</div>
			<div>{item.stats.distance_km ?? '—'} km</div>
			<div>combined</div>
			<div className="text-muted text-[0.85rem]">open group</div>
		</>
	);
}

function LinkedFlag({ count, kind }: { count: number; kind: 'plan' | 'activity' }) {
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
	const location =
		[route.place, route.country].filter(Boolean).join(', ') || `Saved ${route.saved_on}`;
	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
			<span>{location}</span>
			<LinkedFlag count={route.plan_link_count} kind="plan" />
			<LinkedFlag count={route.activity_link_count} kind="activity" />
		</div>
	);
}

function PlannedRouteRowBody({
	route,
	hideActions
}: {
	route: PlannedRoute;
	hideActions?: boolean;
}) {
	return (
		<>
			<div className={hideActions ? 'min-w-0' : undefined}>
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
		</>
	);
}

function PlannedRouteRow({ route }: { route: PlannedRoute }) {
	const router = useRouter();
	const snack = useSnackbar();
	const [pendingDelete, setPendingDelete] = useState(false);

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
				onClick={() =>
					void router.navigate({
						to: '/routes/$slug',
						params: { slug: route.slug },
						resetScroll: true
					})
				}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						void router.navigate({
							to: '/routes/$slug',
							params: { slug: route.slug },
							resetScroll: true
						});
					}
				}}
			>
				<PlannedRouteRowBody route={route} />
			</div>
			<AuthGate>
				<div
					className="absolute top-0 bottom-0 right-[0.55rem] z-[2] my-auto inline-flex items-center gap-1 opacity-100 sm:opacity-55 group-hover:opacity-100"
					onClick={(e) => e.stopPropagation()}
				>
					<EditButton
						compact
						label={`Edit route ${route.name}`}
						onClick={(event) => {
							event.preventDefault();
							event.stopPropagation();
							void router.navigate({
								to: '/routes/$slug',
								params: { slug: route.slug },
								search: { edit: true },
								resetScroll: true
							});
						}}
					/>
					<MoreMenu
						compact
						label={`More for route ${route.name}`}
						items={[
							{
								label: 'Delete',
								icon: <TrashIcon className="size-4" />,
								onClick: () => setPendingDelete(true),
								danger: true
							}
						]}
					/>
				</div>
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
