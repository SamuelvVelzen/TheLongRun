import { AuthGate } from '$lib/auth';
import { groupedRouteTitle } from '$lib/planned-route-group';
import {
	addToPlannedRouteGroupFn,
	getPlannedRouteGroupDetail,
	removeFromPlannedRouteGroupFn,
	ungroupPlannedRoutesFn
} from '$lib/server/functions';
import { appHead } from '$lib/title';
import { cn } from '$lib/ui';
import { entityNotFound } from '$lib/not-found';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { lazy, Suspense, useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import {
	ConfirmDialog,
	Dialog,
	errorMessage,
	Grid,
	IconLabelButton,
	PageHero,
	Panel,
	PanelTitle,
	SectionTitle,
	useSnackbar
} from '../components/ui';
import { buttonClass } from '../components/ui/Button';
import { runRowClass, runTitleClass } from '../components/ui/Chrome';

const RoutesHeatmap = lazy(() =>
	import('../components/RoutesHeatmap').then((m) => ({ default: m.RoutesHeatmap }))
);

export const Route = createFileRoute('/route-groups/$id')({
	loader: async ({ params }) => {
		const detail = await getPlannedRouteGroupDetail({ data: params.id });
		if (!detail) throw entityNotFound('group');
		return detail;
	},
	head: ({ loaderData }) => appHead(loaderData?.title ?? 'Routes', 'Routes'),
	component: RouteGroupDetail
});

function RouteGroupDetail() {
	const { group, members, stats, tracks, allRoutes, groups } = Route.useLoaderData();
	const router = useRouter();
	const snack = useSnackbar();
	const [pendingUngroup, setPendingUngroup] = useState(false);
	const [removeSlug, setRemoveSlug] = useState<string | null>(null);
	const [addOpen, setAddOpen] = useState(false);
	const [addPick, setAddPick] = useState<string | null>(null);

	const title = groupedRouteTitle(group, members.length);
	const groupedSlugs = new Set(groups.flatMap((g) => g.member_slugs));
	const addOptions = allRoutes.filter((r) => !groupedSlugs.has(r.slug));

	const meta = useMemo(() => {
		const out: Record<string, { slug: string; title: string; sub: string }> = {};
		for (const route of members) {
			const location = [route.place, route.country].filter(Boolean).join(', ');
			out[route.slug] = {
				slug: route.slug,
				title: route.name,
				sub: [route.distance_km != null ? `${route.distance_km} km` : null, location]
					.filter(Boolean)
					.join(' · ')
			};
		}
		return out;
	}, [members]);

	return (
		<>
			<PageHero
				kicker={
					<>
						<Link to="/routes">Routes</Link>
						<span>
							{members.length} routes · saved {stats.saved_on}
						</span>
					</>
				}
				kickerClassName="inline-flex items-center gap-1.5 flex-wrap"
				title={title}
				lead="Compare loops on one map. Each GPX stays separate — this is a grouped view for plan days, live share, and overlap checks."
				actions={
					<AuthGate>
						<>
							<IconLabelButton
								label="Add route"
								size="default"
								icon={<Icon name="plus" size={16} />}
								onClick={() => setAddOpen(true)}
							/>
							<button
								type="button"
								className={buttonClass({ variant: 'ghost' })}
								onClick={() => setPendingUngroup(true)}
							>
								Ungroup
							</button>
						</>
					</AuthGate>
				}
			/>

			<Panel className="mb-4 overflow-hidden p-0">
				<Suspense fallback={<p className="text-muted text-sm py-8 text-center">Loading map…</p>}>
					<RoutesHeatmap
						tracks={tracks}
						meta={meta}
						focusIds={members.map((m) => m.slug)}
						detailPath="/routes/$slug"
						emptyText="No tracks in this group."
					/>
				</Suspense>
			</Panel>

			<Panel className="mb-4">
				<PanelTitle>Combined</PanelTitle>
				<p className="text-muted m-0 text-[0.95rem]">
					{stats.distance_km != null ? `${stats.distance_km} km total` : 'Distance —'}
					{stats.plan_link_count > 0
						? ` · ${stats.plan_link_count} plan link${stats.plan_link_count === 1 ? '' : 's'}`
						: ''}
					{stats.activity_link_count > 0
						? ` · ${stats.activity_link_count} activit${stats.activity_link_count === 1 ? 'y' : 'ies'}`
						: ''}
				</p>
			</Panel>

			<SectionTitle>
				<div>
					<h2>Routes in this group</h2>
					<p>Open any route to edit or attach it to a plan day.</p>
				</div>
			</SectionTitle>
			<Grid>
				{members.map((route) => (
					<div key={route.slug} className="relative group">
						<Link
							className={runRowClass(
								'grid-cols-[1.35fr_0.55fr_0.65fr] pr-[3.25rem]',
								(route.plan_link_count > 0 || route.activity_link_count > 0) &&
									'border-[color-mix(in_srgb,var(--color-accent)_40%,var(--color-line))]'
							)}
							to="/routes/$slug"
							params={{ slug: route.slug }}
						>
							<div>
								<div className={cn(runTitleClass, 'font-[650] mb-[0.15rem]')}>{route.name}</div>
								<div className="text-muted text-[0.9rem]">
									{route.plan_link_count > 0
										? `${route.plan_link_count} plan day${route.plan_link_count === 1 ? '' : 's'}`
										: null}
									{route.plan_link_count > 0 && route.activity_link_count > 0 ? ' · ' : null}
									{route.activity_link_count > 0
										? `${route.activity_link_count} activit${route.activity_link_count === 1 ? 'y' : 'ies'}`
										: null}
								</div>
							</div>
							<div>{route.distance_km ?? '—'} km</div>
							<div>{route.elev_gain != null ? `↑ ${route.elev_gain} m` : '—'}</div>
						</Link>
						<AuthGate>
							<div
								className="absolute top-0 bottom-0 right-[0.55rem] z-[2] my-auto inline-flex"
								onClick={(e) => e.stopPropagation()}
							>
								<button
									type="button"
									className={buttonClass({ variant: 'ghost', size: 'sm' })}
									onClick={() => setRemoveSlug(route.slug)}
								>
									Remove
								</button>
							</div>
						</AuthGate>
					</div>
				))}
			</Grid>

			<Dialog
				open={addOpen}
				title="Add a route"
				onClose={() => {
					setAddOpen(false);
					setAddPick(null);
				}}
				actions={
					<>
						<button
							type="button"
							className={buttonClass({ variant: 'ghost' })}
							onClick={() => {
								setAddOpen(false);
								setAddPick(null);
							}}
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
									await addToPlannedRouteGroupFn({ data: { groupId: group.id, slug: addPick } });
									setAddOpen(false);
									setAddPick(null);
									await router.invalidate();
								} catch (err) {
									snack.error(errorMessage(err, 'Could not add that route.'));
								}
							}}
						>
							Add
						</button>
					</>
				}
			>
				{addOptions.length ? (
					<ul className="list-none m-0 p-0 grid gap-1 max-h-[50vh] overflow-y-auto">
						{addOptions.map((r) => (
							<li key={r.slug}>
								<button
									type="button"
									className={cn(
										'w-full text-left rounded-inset border p-3 cursor-pointer transition-colors',
										addPick === r.slug ? 'border-accent bg-accent/10' : 'border-line bg-inset'
									)}
									onClick={() => setAddPick(r.slug)}
								>
									<strong>{r.name}</strong>
									{r.distance_km != null ? (
										<span className="text-muted"> · {r.distance_km} km</span>
									) : null}
								</button>
							</li>
						))}
					</ul>
				) : (
					<p className="text-muted m-0">No ungrouped routes left to add.</p>
				)}
			</Dialog>

			<ConfirmDialog
				open={pendingUngroup}
				title="Ungroup these routes?"
				description="Routes stay saved — only the grouped view goes away."
				confirmLabel="Ungroup"
				onClose={() => setPendingUngroup(false)}
				onConfirm={async () => {
					await ungroupPlannedRoutesFn({ data: group.id });
					await router.navigate({ to: '/routes' });
				}}
			/>
			<ConfirmDialog
				open={removeSlug != null}
				title="Remove this route from the group?"
				description="The route itself is not deleted."
				confirmLabel="Remove"
				onClose={() => setRemoveSlug(null)}
				onConfirm={async () => {
					if (!removeSlug) return;
					await removeFromPlannedRouteGroupFn({ data: { groupId: group.id, slug: removeSlug } });
					setRemoveSlug(null);
					await router.invalidate();
				}}
			/>
		</>
	);
}
