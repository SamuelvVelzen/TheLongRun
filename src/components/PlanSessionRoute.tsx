import { ConfirmDialog, Dialog, Field, Select, errorMessage, useSnackbar } from './ui';
import { useAuthed } from '$lib/auth';
import { sessionCanLinkRoute, type WeekSessionView } from '$lib/plan';
import { attachPlannedRoute, detachPlannedRoute } from '$lib/server/functions';
import type { SessionRouteRef } from '$lib/types';
import { cn } from '$lib/ui';
import { Link, useRouter } from '@tanstack/react-router';
import { useMemo, useState, type MouseEvent } from 'react';
import { MapPinIcon, RouteChip } from './RouteChip';

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

function routeLinkLabel(route: { name: string; distance_km?: number | null }) {
	return route.distance_km != null && !/\bkm\b/i.test(route.name)
		? `${route.name} · ${route.distance_km} km`
		: route.name;
}

function optionLabel(route: SessionRouteRef) {
	return routeLinkLabel(route);
}

/** Icon-only open route — sits in the session toolbar next to ⋯. */
export function PlanSessionRouteOpenLink({
	route,
	compact = false,
	onClick
}: {
	route: { slug: string; name: string; distance_km?: number | null };
	compact?: boolean;
	onClick?: (e: MouseEvent) => void;
}) {
	const label = routeLinkLabel(route);
	return (
		<Link
			to="/routes/$slug"
			params={{ slug: route.slug }}
			aria-label={`Open route ${label}`}
			title={label}
			onClick={onClick}
			className={cn(
				compact
					? 'inline-flex items-center justify-center appearance-none size-7 min-h-7 min-w-7 p-0 rounded-full border-0 bg-transparent text-muted cursor-pointer hover:text-accent-fg hover:bg-fg/[0.08]'
					: 'inline-flex items-center justify-center appearance-none size-9 min-h-9 min-w-9 p-0 rounded-full border-0 bg-transparent text-muted cursor-pointer hover:text-accent-fg hover:bg-fg/[0.08]',
				'shrink-0 no-underline'
			)}
		>
			<MapPinIcon size={compact ? 14 : 16} />
		</Link>
	);
}

export function PlanSessionRoute({
	week,
	session,
	routes,
	pickerOpen = false,
	onPickerClose,
	confirmUnlink,
	onConfirmUnlinkChange,
	variant = 'chip'
}: {
	week: number;
	session: WeekSessionView;
	routes: SessionRouteRef[];
	pickerOpen?: boolean;
	onPickerClose?: () => void;
	confirmUnlink?: boolean;
	onConfirmUnlinkChange?: (open: boolean) => void;
	/** Visible link UI; plan rows use `PlanSessionRouteOpenLink` in the toolbar instead. */
	variant?: 'chip' | 'none';
}) {
	const router = useRouter();
	const authed = useAuthed();
	const snack = useSnackbar();
	const [busy, setBusy] = useState(false);
	const [confirmUnlinkLocal, setConfirmUnlinkLocal] = useState(false);
	const setConfirmOpen = onConfirmUnlinkChange ?? setConfirmUnlinkLocal;

	const canLink = sessionCanLinkRoute(session) && !session.done && !session.skipped;
	const linked = session.route && !session.done ? session.route : null;
	const choices = useMemo(
		() => sortRoutesForSession(routes, session.distance_km).filter((r) => r.slug !== linked?.slug),
		[routes, session.distance_km, linked?.slug]
	);
	const showPicker = Boolean(pickerOpen && authed && canLink && !linked);
	const confirmOpen = confirmUnlink ?? confirmUnlinkLocal;

	if (!linked && !showPicker && !confirmOpen) return null;

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

	function closePicker() {
		onPickerClose?.();
	}

	return (
		<>
			{linked && variant === 'chip' ? (
				<RouteChip className="mt-0" slug={linked.slug} name={linked.name} distanceKm={linked.distance_km} />
			) : null}
			<Dialog open={showPicker} title="Add route to plan" onClose={closePicker}>
				{choices.length ? (
					<Field as="label">
						<span>Route</span>
						<Select
							disabled={busy}
							value=""
							aria-label={`Link a route to ${session.label}`}
							placeholder="Link a route…"
							onChange={(slug) => {
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
								).then((ok) => {
									if (ok) closePicker();
								});
							}}
							options={[
								{ value: '', label: 'Link a route…' },
								...choices.map((route) => ({
									value: route.slug,
									label: optionLabel(route)
								}))
							]}
						/>
					</Field>
				) : (
					<p className={cn('text-muted', 'm-0')}>
						<Link className="text-accent-fg font-semibold" to="/routes">
							Save a route
						</Link>{' '}
						to link it here.
					</p>
				)}
			</Dialog>
			<ConfirmDialog
				open={confirmOpen}
				title="Unlink this route?"
				description={
					linked ? `${linked.name} will no longer be attached to ${session.label}.` : null
				}
				confirmLabel="Unlink"
				onClose={() => setConfirmOpen(false)}
				onConfirm={async () => {
					if (!linked?.link_id) return;
					const ok = await run(() =>
						detachPlannedRoute({ data: { slug: linked.slug, id: linked.link_id! } })
					);
					if (!ok) throw new Error('Could not unlink');
				}}
			/>
		</>
	);
}
