import { useAuthed } from '$lib/auth';
import { sessionCanLinkRoute, type WeekSessionView } from '$lib/plan';
import { attachPlannedRoute, detachPlannedRoute } from '$lib/server/functions';
import type { SessionRouteRef } from '$lib/types';
import { cn, ui } from '$lib/ui';
import { Link, useRouter } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { ConfirmDialog } from './Dialog';
import { RouteChip } from './RouteChip';
import { errorMessage, useSnackbar } from './Snackbar';

function sortRoutesForSession(routes: SessionRouteRef[], targetKm: number | null) {
	return [...routes].sort((a, b) => {
		if (targetKm != null) {
			const da =
				a.distance_km != null ? Math.abs(a.distance_km - targetKm) : Number.POSITIVE_INFINITY;
			const db =
				b.distance_km != null ? Math.abs(b.distance_km - targetKm) : Number.POSITIVE_INFINITY;
			if (da !== db) return da - db;
		}
		return a.name.localeCompare(b.name);
	});
}

function optionLabel(route: SessionRouteRef) {
	return route.distance_km != null && !/\bkm\b/i.test(route.name)
		? `${route.name} · ${route.distance_km} km`
		: route.name;
}

export function PlanSessionRoute({
	week,
	session,
	routes
}: {
	week: number;
	session: WeekSessionView;
	routes: SessionRouteRef[];
}) {
	const router = useRouter();
	const authed = useAuthed();
	const snack = useSnackbar();
	const [busy, setBusy] = useState(false);
	const [confirmUnlink, setConfirmUnlink] = useState(false);

	const canLink = sessionCanLinkRoute(session) && !session.done && !session.skipped;
	const linked = session.route && !session.done ? session.route : null;
	const choices = useMemo(
		() => sortRoutesForSession(routes, session.distance_km).filter((r) => r.slug !== linked?.slug),
		[routes, session.distance_km, linked?.slug]
	);

	if (!linked && !(authed && canLink)) return null;

	async function run(fn: () => Promise<unknown>): Promise<boolean> {
		setBusy(true);
		try {
			await fn();
			await router.invalidate();
			return true;
		} catch (error) {
			snack.error(errorMessage(error, 'Could not update the route'));
			return false;
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="flex flex-col gap-1.5 mt-1 min-w-0">
			{linked && (
				<div className="flex flex-wrap items-center gap-2 min-w-0">
					<RouteChip
						className="mt-0"
						slug={linked.slug}
						name={linked.name}
						distanceKm={linked.distance_km}
					/>
					{authed && linked.link_id != null && (
						<button
							type="button"
							className={cn(
								ui.btnGhost,
								ui.btnDanger,
								'shrink-0 min-h-9 px-[0.8rem] py-1.5 text-[0.82rem]'
							)}
							disabled={busy}
							onClick={() => setConfirmUnlink(true)}
						>
							Unlink
						</button>
					)}
				</div>
			)}
			{authed &&
				canLink &&
				!linked &&
				(choices.length ? (
					<label className={ui.field}>
						<span>Route</span>
						<select
							disabled={busy}
							defaultValue=""
							aria-label={`Link a route to ${session.label}`}
							onChange={(event) => {
								const slug = event.target.value;
								event.target.value = '';
								if (!slug) return;
								void run(() =>
									attachPlannedRoute({
										data: {
											slug,
											week,
											day: session.day,
											label: session.label,
											activity_type: session.activity_type ?? 'run'
										}
									})
								);
							}}
						>
							<option value="">Link a route…</option>
							{choices.map((route) => (
								<option key={route.slug} value={route.slug}>
									{optionLabel(route)}
								</option>
							))}
						</select>
					</label>
				) : (
					<p className={cn(ui.muted, 'm-0 text-[0.82rem]')}>
						<Link className="text-accent-fg font-semibold" to="/routes">
							Save a route
						</Link>{' '}
						to link it here.
					</p>
				))}
			<ConfirmDialog
				open={confirmUnlink}
				title="Unlink this route?"
				description={
					linked ? `${linked.name} will no longer be attached to ${session.label}.` : null
				}
				confirmLabel="Unlink"
				onClose={() => setConfirmUnlink(false)}
				onConfirm={async () => {
					if (!linked?.link_id) return;
					const ok = await run(() =>
						detachPlannedRoute({ data: { slug: linked.slug, id: linked.link_id! } })
					);
					if (!ok) throw new Error('Could not unlink');
				}}
			/>
		</div>
	);
}
