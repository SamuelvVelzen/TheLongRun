import { activityLabel } from '$lib/activity';
import { attachPlannedRoute, detachPlannedRoute } from '$lib/server/functions';
import type {
	ActivityAttachOption,
	PlannedRouteActivityLink,
	PlannedRoutePlanLink,
	PlanAttachOption
} from '$lib/types';
import { Link, useRouter } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { cn, ui } from '$lib/ui';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function shortDate(iso: string | null): string {
	if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
	const month = MONTHS[Number(iso.slice(5, 7)) - 1];
	return `${Number(iso.slice(8, 10))} ${month}`;
}

function planKey(week: number, day: string) {
	return `${week}|${day}`;
}

export function RouteAttach({
	slug,
	planLinks,
	activityLinks,
	planOptions,
	activityOptions
}: {
	slug: string;
	planLinks: PlannedRoutePlanLink[];
	activityLinks: PlannedRouteActivityLink[];
	planOptions: PlanAttachOption[];
	activityOptions: ActivityAttachOption[];
}) {
	const router = useRouter();
	const [query, setQuery] = useState('');
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState('');

	const filteredActivities = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return activityOptions;
		return activityOptions.filter((a) =>
			`${a.date} ${a.day} ${activityLabel(a.activity_type)} ${a.distance_km ?? ''}`
				.toLowerCase()
				.includes(q)
		);
	}, [activityOptions, query]);

	async function run(fn: () => Promise<unknown>) {
		setBusy(true);
		setMessage('');
		try {
			await fn();
			await router.invalidate();
		} catch (error) {
			setMessage(error instanceof Error ? error.message : 'Could not update links');
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className={cn(ui.panel, 'mb-4 [&_>h3]:m-0')}>
			<h3>Use this route</h3>
			<p className={cn(ui.muted, 'mt-[0.3rem] m-0')}>
				Attach it to upcoming plan days — the same loop can cover Monday and later weeks — or
				link it to a logged activity.
			</p>

			<div className="grid gap-5 mt-4">
				<section>
					<h4 className="m-0 mb-[0.45rem] text-[0.92rem] tracking-[0.04em] uppercase text-muted">
						Plan days
					</h4>
					{planLinks.length ? (
						<div className="grid gap-2 mb-3">
							{planLinks.map((link) => (
								<div
									key={link.id}
									className="flex items-center justify-between gap-3 p-[0.7rem_0.85rem] border border-line rounded-xl bg-white/[0.02]"
								>
									<div className="min-w-0">
										<strong>
											Week {link.week} · {link.day}
											{link.date ? ` · ${shortDate(link.date)}` : ''}
										</strong>
										<div className={ui.muted}>
											{activityLabel(link.activity_type)} · {link.label}
											{link.distance_km != null ? ` · ${link.distance_km} km` : ''}
										</div>
									</div>
									<button
										className={cn(ui.btnGhost, ui.btnDanger, 'shrink-0 min-h-9 px-[0.8rem] py-1.5')}
										type="button"
										disabled={busy}
										onClick={() =>
											void run(() => detachPlannedRoute({ data: { slug, id: link.id } }))
										}
									>
										Remove
									</button>
								</div>
							))}
						</div>
					) : (
						<p className={cn(ui.muted, 'm-0 mb-[0.65rem] text-[0.92rem]')}>Not on a plan day yet.</p>
					)}
					{planOptions.length > 0 && (
						<label className={ui.field}>
							<span>Add a plan day</span>
							<select
								disabled={busy}
								defaultValue=""
								onChange={(event) => {
									const value = event.target.value;
									event.target.value = '';
									if (!value) return;
									const [week, day] = value.split('|');
									void run(() =>
										attachPlannedRoute({
											data: { slug, week: Number(week), day }
										})
									);
								}}
							>
								<option value="">Upcoming session…</option>
								{planOptions.map((opt) => (
									<option key={planKey(opt.week, opt.day)} value={planKey(opt.week, opt.day)}>
										{`W${opt.week} · ${opt.day}${opt.date ? ` ${shortDate(opt.date)}` : ''} · ${opt.label}${opt.distance_km != null ? ` ${opt.distance_km} km` : ''}${opt.taken_by ? ` · now ${opt.taken_by.name}` : ''}`}
									</option>
								))}
							</select>
						</label>
					)}
				</section>

				<section>
					<h4 className="m-0 mb-[0.45rem] text-[0.92rem] tracking-[0.04em] uppercase text-muted">
						Logged activities
					</h4>
					{activityLinks.length ? (
						<div className="grid gap-2 mb-3">
							{activityLinks.map((link) => (
								<div
									key={link.id}
									className="flex items-center justify-between gap-3 p-[0.7rem_0.85rem] border border-line rounded-xl bg-white/[0.02]"
								>
									<Link className="min-w-0" to="/runs/$slug" params={{ slug: link.slug }}>
										<strong>
											{link.date} · {link.day || activityLabel(link.activity_type)}
										</strong>
										<div className={ui.muted}>
											{activityLabel(link.activity_type)}
											{link.distance_km != null ? ` · ${link.distance_km} km` : ''}
										</div>
									</Link>
									<button
										className={cn(ui.btnGhost, ui.btnDanger, 'shrink-0 min-h-9 px-[0.8rem] py-1.5')}
										type="button"
										disabled={busy}
										onClick={() =>
											void run(() => detachPlannedRoute({ data: { slug, id: link.id } }))
										}
									>
										Remove
									</button>
								</div>
							))}
						</div>
					) : (
						<p className={cn(ui.muted, 'm-0 mb-[0.65rem] text-[0.92rem]')}>
							Not linked to a logged activity yet.
						</p>
					)}
					{activityOptions.length > 0 && (
						<div className="grid gap-[0.65rem]">
							<label className={ui.field}>
								<span>Find an activity</span>
								<input
									type="search"
									value={query}
									placeholder="Date or sport"
									disabled={busy}
									onChange={(event) => setQuery(event.target.value)}
								/>
							</label>
							<label className={ui.field}>
								<span>Link an activity</span>
								<select
									disabled={busy || !filteredActivities.length}
									defaultValue=""
									onChange={(event) => {
										const activity_slug = event.target.value;
										event.target.value = '';
										if (!activity_slug) return;
										void run(() => attachPlannedRoute({ data: { slug, activity_slug } }));
									}}
								>
									<option value="">
										{filteredActivities.length ? 'Choose an activity…' : 'No matches'}
									</option>
									{filteredActivities.map((opt) => (
										<option key={opt.slug} value={opt.slug}>
											{`${opt.date} · ${activityLabel(opt.activity_type)}${opt.distance_km != null ? ` · ${opt.distance_km} km` : ''}${opt.taken_by ? ` · now ${opt.taken_by.name}` : ''}`}
										</option>
									))}
								</select>
							</label>
						</div>
					)}
				</section>
			</div>
			{message && <div className={cn(ui.flash, 'mt-[0.85rem]')}>{message}</div>}
		</div>
	);
}
