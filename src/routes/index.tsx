import { useMemo } from 'react';
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
import {
	activityLabel,
	activityPlural,
	hasContext,
	metricText,
	normalizeActivityType,
	showsField
} from '$lib/activity';
import { FeelBadge } from '../components/FeelBadge';
import { DateRangeFilter, rangeToSearch, type RangeSearch } from '../components/DateRangeFilter';
import { FilterSheet, filterSummary } from '../components/FilterSheet';
import { SportFilter } from '../components/SportFilter';
import { TrendsSection } from '../components/TrendsSection';
import { RoutesHeatmap, type RouteMeta } from '../components/RoutesHeatmap';
import { DeferredData } from '../components/DeferredData';

type DashSearch = RangeSearch & { sport?: string };
const SPORTS = ['all', 'run', 'walk', 'ride', 'swim', 'strength'];

export const Route = createFileRoute('/')({
	validateSearch: (s: Record<string, unknown>): DashSearch => ({
		range: (['7d', '30d', 'all', 'custom'] as const).includes(s.range as RangeKind)
			? (s.range as RangeKind)
			: undefined,
		from: typeof s.from === 'string' ? s.from : undefined,
		to: typeof s.to === 'string' ? s.to : undefined,
		sport: SPORTS.includes(s.sport as string) ? (s.sport as string) : undefined
	}),
	loader: () => ({ page: getDashboardData() }),
	component: Dashboard
});

function fmt(n: number | null, digits = 1) {
	if (n == null) return '—';
	return n.toFixed(digits);
}

function compactRunSub(run: {
	day: string;
	session: string;
	week: number | null;
	avg_hr: number | null;
	elev_gain: number | null;
	activity_type: string;
}) {
	const parts: string[] = [];
	if (run.day) parts.push(run.day.slice(0, 3));
	if (run.session && run.session !== 'other') parts.push(run.session);
	if (run.week != null) parts.push(`W${run.week}`);
	if (run.avg_hr != null) parts.push(`HR ${run.avg_hr}`);
	if (run.elev_gain != null && showsField(run.activity_type, 'elevation')) {
		parts.push(`↑ ${run.elev_gain} m`);
	}
	return parts.join(' · ');
}

function shinLabel(s: DashboardStats) {
	if (s.shinRecent == null) return '—';
	if (s.shinDelta == null) return fmt(s.shinRecent);
	if (s.shinDelta === 0) return `${fmt(s.shinRecent)} →`;
	const arrow = s.shinDelta < 0 ? '↓' : '↑';
	return `${fmt(s.shinRecent)} ${arrow}${Math.abs(s.shinDelta)}`;
}

function Dashboard() {
	const { page } = Route.useLoaderData();
	return (
		<>
			<section className="hero hero-home">
				<div>
					<p className="muted">Personal training desk · no accounts</p>
					<h1>The Long Run</h1>
					<p>
						After a run: import the GPX in Coach, paste ChatGPT’s debrief, and the next session
						stays current. Stats and maps live here.
					</p>
				</div>
				<div className="actions">
					<Link className="btn btn-primary" to="/coach" search={{ tab: 'debrief' }}>
						Coach
					</Link>
					<Link className="btn btn-ghost" to="/import">
						Add activity
					</Link>
				</div>
			</section>
			<DeferredData promise={page}>{(data) => <DashboardBody data={data} />}</DeferredData>
		</>
	);
}

function DashboardBody({ data }: { data: Awaited<ReturnType<typeof getDashboardData>> }) {
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

	// Map each route track back to its run so heatmap lines can show a tooltip + open the run.
	const routeMeta = useMemo<RouteMeta>(() => {
		const m: RouteMeta = {};
		for (const run of allRuns) {
			const id =
				String(run.route || '')
					.trim()
					.replace(/^.*\//, '')
					.replace(/\.json$/i, '') || String(run.strava_id || '').trim();
			if (!id) continue;
			m[id] = {
				slug: run.slug,
				title: `${run.date} · ${activityLabel(run.activity_type)}`,
				sub: `${run.distance_km ?? '—'} km · ${metricText(run)}`
			};
		}
		return m;
	}, [allRuns]);

	// Route ids of the most recent runs — the heatmap zooms to these by default.
	const focusIds = useMemo(() => {
		const ids: string[] = [];
		for (const run of runs.slice(0, 12)) {
			const id =
				String(run.route || '')
					.trim()
					.replace(/^.*\//, '')
					.replace(/\.json$/i, '') || String(run.strava_id || '').trim();
			if (id) ids.push(id);
		}
		return ids;
	}, [runs]);

	const raceDate = new Date(`${data.goals.race_date}T00:00:00`);
	const daysToRace = Number.isNaN(raceDate.getTime())
		? null
		: Math.ceil((raceDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
	const mappedRuns = runs.filter((r) => r.has_map).length;
	const stats = buildDashboardStats(runs, {
		daysToRace,
		mappedRuns,
		streak: data.streak
	});
	const trends = buildTrainingTrends(runs, { endDate: range.to, fromDate: range.from });

	const totalAllTime = allRuns.length;
	const filteredEmpty = totalAllTime > 0 && stats.runCount === 0;
	const rangeActive = range.kind !== 'all';
	const timelineSearch = rangeToSearch(range.kind, range.from ?? undefined, range.to ?? undefined);

	return (
		<>
			{data.weekView?.next && (
				<section className="next-up" aria-labelledby="next-up-heading">
					<p className="muted next-up-kicker">
						{data.weekView.next.isToday ? 'Today' : 'Next up'}
					</p>
					<h2 id="next-up-heading">
						{data.weekView.next.day}
						{data.weekView.next.date ? ` · ${data.weekView.next.date.slice(5)}` : ''} ·{' '}
						{data.weekView.next.label}
					</h2>
					<p>
						{data.weekView.next.distance_km != null && `${data.weekView.next.distance_km} km · `}
						{data.weekView.next.detail}
					</p>
					<p className="muted">
						Week {data.weekView.week.week} · {data.weekView.week.phase}
						{data.weekView.week.focus ? ` · ${data.weekView.week.focus}` : ''}
					</p>
				</section>
			)}
			{data.weekView && !data.weekView.next && (
				<section className="next-up next-up-done" aria-labelledby="next-up-heading">
					<p className="muted next-up-kicker">This week</p>
					<h2 id="next-up-heading">All planned sessions logged</h2>
					<p className="muted">
						Week {data.weekView.week.week} · {data.weekView.week.phase}. Use Coach to plan next week.
					</p>
				</section>
			)}

			<FilterSheet summary={filterSummary(sport, range)}>
				<SportFilter sport={sport} to="/" available={availableSports} />
				<DateRangeFilter range={range} to="/" />
			</FilterSheet>

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
						<div className="stats-strip-item stats-strip-lead">
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
						<div className="stats-strip-item">
							<span className="stats-strip-label">Sessions</span>
							<strong className="stats-strip-value">{stats.runCount}</strong>
						</div>
						<div className="stats-strip-item">
							<span className="stats-strip-label">Longest</span>
							<strong className="stats-strip-value">
								{stats.longestKm ?? '—'}
								{stats.longestKm != null && <span className="stats-strip-unit"> km</span>}
							</strong>
						</div>
						{!rangeActive && (
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
						)}
					</section>
					<p className="stats-meta muted">
						Shins {shinLabel(stats)}
						<span aria-hidden="true"> · </span>
						Session streak {stats.streak || '—'}
						<span aria-hidden="true"> · </span>
						{stats.mappedRuns}/{stats.runCount} mapped
					</p>

					{data.weekView && (
						<section className="week-strip" aria-labelledby="week-heading">
							<div className="week-strip-head">
								<div>
									<h2 id="week-heading">This week · {data.weekView.week.phase}</h2>
									<p className="muted">
										Week {data.weekView.week.week} · {data.weekView.week.dates} ·{' '}
										{data.weekView.week.focus}
										<span className="week-shoes">
											{' '}
											· Shoes: {data.shoes.active || 'set in Context'}
										</span>
									</p>
								</div>
							</div>
							<div className="week-sessions">
								{data.weekView.sessions.map((session, i) => (
									<div
										key={`${session.day}-${i}`}
										className={`week-session${session.done ? ' is-done' : ''}${session.isNext ? ' is-next' : ''}`}
									>
										<span className="week-day">
											{session.day}
											{session.done ? ' · done' : session.isNext ? ' · next' : ''}
										</span>
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
						<RoutesHeatmap tracks={tracks} meta={routeMeta} focusIds={focusIds} />
					</section>

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
							<Link className="btn btn-ghost" to="/import">
								Add
							</Link>
						</div>
					</div>

					<div className="grid">
						{recent.length ? (
							recent.map((run, i) => (
								<Link
									key={run.slug}
									className="run-row run-row-compact"
									to="/runs/$slug"
									params={{ slug: run.slug }}
									style={{ animationDelay: `${i * 40}ms` }}
								>
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
										{hasContext(run) && <FeelBadge />}
									</strong>
									<div className="run-row-metric">
										{showsField(run.activity_type, 'distance')
											? `${run.distance_km ?? '—'} km · ${metricText(run)}`
											: metricText(run)}
									</div>
									<div className="muted run-row-sub">{compactRunSub(run)}</div>
								</Link>
							))
						) : (
							<div className="panel muted">No runs yet. Import a file or log one manually.</div>
						)}
					</div>
				</>
			)}
		</>
	);
}
