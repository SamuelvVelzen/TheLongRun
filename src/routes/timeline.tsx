import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { getTimelineRuns, deleteRun } from '$lib/server/functions';
import {
	buildRangeStats,
	filterRunsByRange,
	parseDateRange,
	type RangeKind
} from '$lib/date-range';
import { buildTrainingTrends } from '$lib/trends';
import { activityLabel, metricText } from '$lib/activity';
import type { RunWithMap } from '$lib/types';
import { DateRangeFilter, type RangeSearch } from '../components/DateRangeFilter';
import { TrendsSection } from '../components/TrendsSection';

export const Route = createFileRoute('/timeline')({
	validateSearch: (s: Record<string, unknown>): RangeSearch => ({
		range: (['7d', '30d', 'all', 'custom'] as const).includes(s.range as RangeKind)
			? (s.range as RangeKind)
			: undefined,
		from: typeof s.from === 'string' ? s.from : undefined,
		to: typeof s.to === 'string' ? s.to : undefined
	}),
	loader: () => getTimelineRuns(),
	component: Timeline
});

function monthKey(date: string) {
	return date.slice(0, 7) || 'unknown';
}

function monthLabel(key: string) {
	if (!/^\d{4}-\d{2}$/.test(key)) return key;
	const d = new Date(`${key}-01T00:00:00`);
	return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function groupRuns(runs: RunWithMap[]) {
	const groupsMap = new Map<string, RunWithMap[]>();
	for (const run of runs) {
		const key = monthKey(run.date);
		const list = groupsMap.get(key) ?? [];
		list.push(run);
		groupsMap.set(key, list);
	}
	return [...groupsMap.entries()].map(([key, items]) => ({
		key,
		label: monthLabel(key),
		runs: items,
		totalKm: Math.round(items.reduce((acc, r) => acc + (r.distance_km ?? 0), 0) * 10) / 10
	}));
}

function fmtHr(n: number | null) {
	return n == null ? '—' : Math.round(n).toString();
}

function Timeline() {
	const allRuns = Route.useLoaderData();
	const search = Route.useSearch();
	const router = useRouter();

	const sp = new URLSearchParams();
	if (search.range) sp.set('range', search.range);
	if (search.from) sp.set('from', search.from);
	if (search.to) sp.set('to', search.to);
	const range = parseDateRange(sp);

	const runs = filterRunsByRange(allRuns, range);
	const stats = buildRangeStats(runs);
	const groups = groupRuns(runs);
	const trends =
		range.kind !== 'all'
			? buildTrainingTrends(runs, { endDate: range.to, fromDate: range.from })
			: null;

	const totalAllTime = allRuns.length;
	const neverLogged = totalAllTime === 0;
	const filteredEmpty = totalAllTime > 0 && !groups.length;

	async function onDelete(e: React.MouseEvent, run: RunWithMap) {
		e.preventDefault();
		if (!confirm(`Delete run ${run.date} (${run.day})? This cannot be undone.`)) return;
		await deleteRun({ data: run.slug });
		router.invalidate();
	}

	return (
		<>
			<section className="hero">
				<div>
					<p className="muted">
						{stats.runCount} runs · {stats.totalKm} km
						{stats.avgPace && ` · avg ${stats.avgPace}/km`}
						{stats.avgHr != null && ` · HR ${fmtHr(stats.avgHr)}`}
						{range.kind !== 'all' && ` · ${range.label}`}
					</p>
					<h1>Timeline</h1>
					<p>Every run in order — open one for notes and full metrics.</p>
				</div>
				<div className="actions">
					<Link className="btn btn-primary" to="/log">
						Log a run
					</Link>
				</div>
			</section>

			<DateRangeFilter range={range} to="/timeline" />

			{neverLogged ? (
				<div className="panel muted">No runs yet.</div>
			) : filteredEmpty ? (
				<div className="panel muted range-empty">
					<p>No runs in {range.label.toLowerCase()}.</p>
					<Link className="btn btn-ghost" to="/timeline" search={{}}>
						Show all time
					</Link>
				</div>
			) : (
				<>
					{trends?.series.length ? (
						<TrendsSection trends={trends} caption={`Within ${range.label.toLowerCase()}`} />
					) : null}

					{groups.map((group) => (
						<div key={group.key}>
							<div className="section-title">
								<div>
									<h2>{group.label}</h2>
									<p>
										{group.runs.length} runs · {group.totalKm} km
									</p>
								</div>
							</div>

							<div className="timeline">
								{group.runs.map((run, i) => (
									<div
										key={run.slug}
										className="timeline-item"
										style={{ animationDelay: `${i * 35}ms` }}
									>
										<div className="timeline-rail" aria-hidden="true">
											<span className="timeline-dot"></span>
										</div>
										<div className="timeline-card">
											<Link className="timeline-link" to="/runs/$slug" params={{ slug: run.slug }}>
												<div className="timeline-head">
													<strong className="run-title">
														{run.date}
														{run.has_map && (
															<span
																className="map-badge"
																title="Route map available"
																aria-label="Has route map"
															>
																<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
																	<path
																		fill="currentColor"
																		d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"
																	/>
																</svg>
															</span>
														)}
													</strong>
													<span className="tag">{activityLabel(run.activity_type)}</span>
													<span className="tag">{run.day}</span>
													<span className="tag accent">{run.session}</span>
													{run.week != null && <span className="tag">W{run.week}</span>}
												</div>
												<div className="timeline-metrics">
													<span>{run.distance_km ?? '—'} km</span>
													<span>{metricText(run)}</span>
													{run.start_time && <span>start {run.start_time}</span>}
													{run.time && <span>{run.time}</span>}
													{run.avg_hr != null && (
														<span>
															HR {run.avg_hr}
															{run.max_hr != null && `/${run.max_hr}`}
														</span>
													)}
													{run.elev_gain != null && <span>↑ {run.elev_gain} m</span>}
													<span>Effort {run.effort ?? '—'}</span>
													<span>Shins {run.shins ?? '—'}</span>
													{run.energy != null && <span>Energy {run.energy}</span>}
												</div>
												{run.notes && <p className="muted timeline-notes">{run.notes}</p>}
											</Link>
											<form className="timeline-delete" onSubmit={(e) => e.preventDefault()}>
												<button
													className="btn btn-ghost btn-danger btn-icon"
													type="submit"
													aria-label={`Delete run ${run.date}`}
													title="Delete run"
													onClick={(e) => onDelete(e, run)}
												>
													<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
														<path
															fill="currentColor"
															d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9zm-1 12h12l1-12H5l1 12z"
														/>
													</svg>
												</button>
											</form>
										</div>
									</div>
								))}
							</div>
						</div>
					))}
				</>
			)}
		</>
	);
}
