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
		<div className="panel route-attach">
			<h3>Use this route</h3>
			<p className="muted">
				Attach it to upcoming plan days — the same loop can cover Monday and later weeks — or
				link it to a logged activity.
			</p>

			<div className="route-attach-body">
				<section>
					<h4>Plan days</h4>
					{planLinks.length ? (
						<div className="route-attach-list">
							{planLinks.map((link) => (
								<div key={link.id} className="route-attach-row">
									<div>
										<strong>
											Week {link.week} · {link.day}
											{link.date ? ` · ${shortDate(link.date)}` : ''}
										</strong>
										<div className="muted">
											{activityLabel(link.activity_type)} · {link.label}
											{link.distance_km != null ? ` · ${link.distance_km} km` : ''}
										</div>
									</div>
									<button
										className="btn btn-ghost btn-danger"
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
						<p className="muted route-attach-empty">Not on a plan day yet.</p>
					)}
					{planOptions.length > 0 && (
						<label className="field">
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
					<h4>Logged activities</h4>
					{activityLinks.length ? (
						<div className="route-attach-list">
							{activityLinks.map((link) => (
								<div key={link.id} className="route-attach-row">
									<Link to="/runs/$slug" params={{ slug: link.slug }}>
										<strong>
											{link.date} · {link.day || activityLabel(link.activity_type)}
										</strong>
										<div className="muted">
											{activityLabel(link.activity_type)}
											{link.distance_km != null ? ` · ${link.distance_km} km` : ''}
										</div>
									</Link>
									<button
										className="btn btn-ghost btn-danger"
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
						<p className="muted route-attach-empty">Not linked to a logged activity yet.</p>
					)}
					{activityOptions.length > 0 && (
						<div className="route-attach-add">
							<label className="field">
								<span>Find an activity</span>
								<input
									type="search"
									value={query}
									placeholder="Date or sport"
									disabled={busy}
									onChange={(event) => setQuery(event.target.value)}
								/>
							</label>
							<label className="field">
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
			{message && <div className="flash">{message}</div>}
		</div>
	);
}
