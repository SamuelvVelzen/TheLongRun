import { createFileRoute, Link } from '@tanstack/react-router';
import { getDashboardData } from '$lib/server/functions';
import {
	filterRunsByRange,
	parseDateRange,
	routeIdsForRuns,
	type RangeKind
} from '$lib/date-range';
import { buildDashboardStats, type DashboardStats } from '$lib/plan';
import { buildTrainingTrends } from '$lib/trends';
import { activityPlural, metricText, normalizeActivityType } from '$lib/activity';
import { DateRangeFilter, rangeToSearch, type RangeSearch } from '../components/DateRangeFilter';
import { SportFilter } from '../components/SportFilter';
import { TrendsSection } from '../components/TrendsSection';
import { RoutesHeatmap } from '../components/RoutesHeatmap';

type DashSearch = RangeSearch & { sport?: string };
const SPORTS = ['all', 'run', 'walk', 'ride', 'swim'];

export const Route = createFileRoute('/')({
	validateSearch: (s: Record<string, unknown>): DashSearch => ({
		range: (['7d', '30d', 'all', 'custom'] as const).includes(s.range as RangeKind)
			? (s.range as RangeKind)
			: undefined,
		from: typeof s.from === 'string' ? s.from : undefined,
		to: typeof s.to === 'string' ? s.to : undefined,
		sport: SPORTS.includes(s.sport as string) ? (s.sport as string) : undefined
	}),
	loader: () => getDashboardData(),
	component: Dashboard
});

function fmt(n: number | null, digits = 1) {
	if (n == null) return '—';
	return n.toFixed(digits);
}

function shinLabel(s: DashboardStats) {
	if (s.shinRecent == null) return '—';
	if (s.shinDelta == null) return fmt(s.shinRecent);
	if (s.shinDelta === 0) return `${fmt(s.shinRecent)} →`;
	const arrow = s.shinDelta < 0 ? '↓' : '↑';
	return `${fmt(s.shinRecent)} ${arrow}${Math.abs(s.shinDelta)}`;
}

function Dashboard() {
	const data = Route.useLoaderData();
	const search = Route.useSearch();

	const sp = new URLSearchParams();
	if (search.range) sp.set('range', search.range);
	if (search.from) sp.set('from', search.from);
	if (search.to) sp.set('to', search.to);
	const range = parseDateRange(sp);
	const sport = search.sport ?? 'run';

	const allRuns = data.runs;
	const availableSports = new Set(allRuns.map((r) => normalizeActivityType(r.activity_type)));
	const scoped =
		sport === 'all'
			? allRuns
			: allRuns.filter((r) => normalizeActivityType(r.activity_type) === sport);
	const runs = filterRunsByRange(scoped, range);
	const trackIds = routeIdsForRuns(runs);
	const tracks =
		range.kind === 'all' && sport === 'all'
			? data.tracks
			: data.tracks.filter((t) => trackIds.has(t.id));
	const recent = runs.slice(0, 8);

	const raceDate = new Date(`${data.goals.race_date}T00:00:00`);
	const daysToRace = Number.isNaN(raceDate.getTime())
		? null
		: Math.ceil((raceDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
	const mappedRuns = runs.filter((r) => r.has_map).length;
	const stats = buildDashboardStats(runs, { daysToRace, mappedRuns });
	const trends = buildTrainingTrends(runs, { endDate: range.to, fromDate: range.from });

	const totalAllTime = allRuns.length;
	const filteredEmpty = totalAllTime > 0 && stats.runCount === 0;
	const rangeActive = range.kind !== 'all';
	const timelineSearch = rangeToSearch(range.kind, range.from ?? undefined, range.to ?? undefined);

	return (
		<>
			<section className="hero">
				<div>
					<p className="muted">Personal training desk · no accounts</p>
					<h1>The Long Run</h1>
					<p>
						Log Tue / Fri / Sun runs and keep profile, plan, and gear notes in Context for your own
						reference.
					</p>
				</div>
				<div className="actions">
					<Link className="btn btn-primary" to="/log">
						Log an activity
					</Link>
					<Link className="btn btn-ghost" to="/context">
						Context
					</Link>
				</div>
			</section>

			<div className="filter-bar">
				<SportFilter sport={sport} to="/" available={availableSports} />
				<DateRangeFilter range={range} to="/" />
			</div>

			{filteredEmpty ? (
				<div className="panel muted range-empty">
					<p>
						No {activityPlural(sport)} in {range.label.toLowerCase()}.
					</p>
					<Link className="btn btn-ghost" to="/" search={{}}>
						Show all time
					</Link>
				</div>
			) : (
				<>
					<section className="stats-strip" aria-label="Training stats">
						<div className="stats-strip-item">
							<span className="stats-strip-label">Days to {data.goals.race_name}</span>
							<strong className="stats-strip-value">{stats.daysToRace ?? '—'}</strong>
						</div>
						<div className="stats-strip-item">
							<span className="stats-strip-label">{rangeActive ? range.label : 'Logged'}</span>
							<strong className="stats-strip-value">
								{stats.totalKm}
								<span className="stats-strip-unit"> km</span>
							</strong>
						</div>
						{!rangeActive ? (
							<>
								<div className="stats-strip-item">
									<span className="stats-strip-label">This month</span>
									<strong className="stats-strip-value">
										{stats.monthRuns}
										<span className="stats-strip-unit"> · {stats.monthKm} km</span>
									</strong>
								</div>
								<div className="stats-strip-item">
									<span className="stats-strip-label">Last 7 days</span>
									<strong className="stats-strip-value">
										{stats.weekKm}
										<span className="stats-strip-unit"> km</span>
									</strong>
								</div>
							</>
						) : (
							<div className="stats-strip-item">
								<span className="stats-strip-label">Runs</span>
								<strong className="stats-strip-value">{stats.runCount}</strong>
							</div>
						)}
						<div className="stats-strip-item">
							<span className="stats-strip-label">Longest</span>
							<strong className="stats-strip-value">
								{stats.longestKm ?? '—'}
								{stats.longestKm != null && <span className="stats-strip-unit"> km</span>}
							</strong>
						</div>
						<div className="stats-strip-item">
							<span className="stats-strip-label">Avg pace</span>
							<strong className="stats-strip-value">
								{stats.avgPace || '—'}
								{stats.avgPace && <span className="stats-strip-unit">/km</span>}
							</strong>
						</div>
						<div className="stats-strip-item">
							<span className="stats-strip-label">Avg HR</span>
							<strong className="stats-strip-value">{fmt(stats.avgHr, 0)}</strong>
						</div>
						<div className="stats-strip-item">
							<span className="stats-strip-label">Elev gain</span>
							<strong className="stats-strip-value">
								{stats.elevGain}
								<span className="stats-strip-unit"> m</span>
							</strong>
						</div>
					</section>
					<p className="stats-meta muted">
						Shins {shinLabel(stats)}
						<span aria-hidden="true"> · </span>
						Tue/Fri/Sun streak {stats.streak || '—'}
						<span aria-hidden="true"> · </span>
						{stats.mappedRuns}/{stats.runCount} mapped
						<span aria-hidden="true"> · </span>
						Effort {fmt(stats.avgEffort)} / shins {fmt(stats.avgShins)} avg
					</p>

					{trends.series.length > 0 && (
						<TrendsSection
							trends={trends}
							caption={
								rangeActive
									? `Within ${range.label.toLowerCase()}`
									: 'Progress over recent weeks and runs'
							}
						/>
					)}

					<section className="map-section" aria-labelledby="routes-heading">
						<div className="section-title map-section-head">
							<div>
								<h2 id="routes-heading">{rangeActive ? 'Routes in range' : 'All routes'}</h2>
								<p>
									{tracks.length
										? `${tracks.length} tracks overlaid · overlaps glow brighter`
										: rangeActive
											? 'No GPS routes in this range'
											: 'Heatmap appears when GPS routes are imported'}
								</p>
							</div>
						</div>
						<RoutesHeatmap tracks={tracks} />
					</section>

					{data.week && (
						<section className="week-strip" aria-labelledby="week-heading">
							<div className="week-strip-head">
								<div>
									<h2 id="week-heading">This week · {data.week.phase}</h2>
									<p className="muted">
										Week {data.week.week} · {data.week.dates} · {data.week.focus}
										<span className="week-shoes">
											{' '}
											· Shoes: {data.shoes.active || 'set in Context'}
										</span>
									</p>
								</div>
							</div>
							<div className="week-sessions">
								{data.week.sessions.map((session, i) => (
									<div key={i} className="week-session">
										<span className="week-day">{session.day}</span>
										<strong className="week-label">{session.label}</strong>
										{session.distance_km != null && (
											<span className="week-km">{session.distance_km} km</span>
										)}
										<p className="muted week-detail">{session.detail}</p>
									</div>
								))}
							</div>
						</section>
					)}

					<div className="section-title">
						<div>
							<h2>{rangeActive ? 'Runs in range' : 'Recent runs'}</h2>
							<p>
								{stats.runCount} {rangeActive ? `in ${range.label.toLowerCase()}` : 'total'}
							</p>
						</div>
						<div className="actions">
							<Link className="btn btn-ghost" to="/timeline" search={timelineSearch}>
								Full timeline
							</Link>
							<Link className="btn btn-ghost" to="/log">
								Add activity
							</Link>
						</div>
					</div>

					<div className="grid">
						{recent.length ? (
							recent.map((run, i) => (
								<Link
									key={run.slug}
									className="run-row"
									to="/runs/$slug"
									params={{ slug: run.slug }}
									style={{ animationDelay: `${i * 40}ms` }}
								>
									<div>
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
										<div className="muted">
											{run.day} · {run.session}
											{run.week != null && ` · W${run.week}`}
											{run.start_time && ` · ${run.start_time}`}
										</div>
									</div>
									<div>
										{run.distance_km ?? '—'} km · {metricText(run)}
									</div>
									<div>
										{run.avg_hr != null ? (
											<>
												HR {run.avg_hr}
												{run.max_hr != null && `/${run.max_hr}`}
											</>
										) : (
											<>Effort {run.effort ?? '—'}/10</>
										)}
									</div>
									<div>
										{run.elev_gain != null ? (
											<>↑ {run.elev_gain} m</>
										) : (
											<>Shins {run.shins ?? '—'}/10</>
										)}
									</div>
								</Link>
							))
						) : (
							<div className="panel muted">No runs yet. Log your first one.</div>
						)}
					</div>
				</>
			)}
		</>
	);
}
