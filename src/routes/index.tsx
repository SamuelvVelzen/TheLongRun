import {
    activityLabel,
    activityPlural,
    hasContext,
    metricText,
    normalizeActivityType,
    showsField
} from '$lib/activity';
import {
    filterRunsByRange,
    parseDateRange,
    routeIdsForRuns,
    type RangeKind
} from '$lib/date-range';
import { buildDashboardStats, type DashboardStats } from '$lib/plan';
import { getDashboardData } from '$lib/server/functions';
import { buildTrainingTrends } from '$lib/trends';
import { cn, ui } from '$lib/ui';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { DateRangeFilter, rangeToSearch, type RangeSearch } from '../components/DateRangeFilter';
import { DeferredData } from '../components/DeferredData';
import { FeelBadge } from '../components/FeelBadge';
import { FilterSheet, filterSummary } from '../components/FilterSheet';
import { PlaceFilter } from '../components/PlaceFilter';
import { RouteChip } from '../components/RouteChip';
import { RoutesHeatmap, type RouteMeta } from '../components/RoutesHeatmap';
import { SportFilter } from '../components/SportFilter';
import { TrendsSection } from '../components/TrendsSection';

type DashSearch = RangeSearch & { sport?: string; country?: string; province?: string; place?: string };
const SPORTS = ['all', 'run', 'walk', 'ride', 'swim', 'strength'];

const nextUpBase =
	'mt-5 p-[1rem_1.1rem_1.05rem] border border-line rounded-xl max-sm:p-[0.85rem_0.9rem_0.9rem] [&_h2]:text-[1.45rem] [&_h2]:font-[750] [&_h2]:tracking-[-0.03em] [&_h2]:m-0 [&_h2]:mb-[0.35rem] [&_h2]:[overflow-wrap:anywhere] [&_p]:m-0 [&_p]:leading-[1.45] max-sm:[&_h2]:text-[1.2rem]';
const nextUp = cn(
	nextUpBase,
	'bg-[color-mix(in_srgb,var(--color-accent)_10%,var(--color-panel))]'
);
const nextUpDone = cn(nextUpBase, 'bg-panel');
const nextUpKicker = 'text-[0.72rem] tracking-[0.08em] uppercase font-bold text-accent m-0 mb-1';
const statsItem =
	'py-[0.15rem] pr-[0.85rem] border-r border-line min-w-0 last:border-r-0 last:pr-0 not-first:pl-[0.85rem] max-sm:[&:nth-child(3n)]:border-r-0 max-sm:[&:nth-child(3n)]:pr-0 max-sm:[&:nth-child(3n+1)]:pl-0 max-sm:[&:nth-child(n+4)]:border-t max-sm:[&:nth-child(n+4)]:pt-3';
const statsLabel = 'block text-[0.78rem] tracking-[0.02em]';
const statsValue = 'block font-display font-bold tracking-[-0.03em] mt-[0.2rem] leading-[1.15]';
const statsUnit = 'text-[0.85rem] font-medium text-muted tracking-normal';
export const Route = createFileRoute('/')({
	validateSearch: (s: Record<string, unknown>): DashSearch => ({
		range: (['7d', '30d', 'all', 'custom'] as const).includes(s.range as RangeKind)
			? (s.range as RangeKind)
			: undefined,
		from: typeof s.from === 'string' ? s.from : undefined,
		to: typeof s.to === 'string' ? s.to : undefined,
		sport: SPORTS.includes(s.sport as string) ? (s.sport as string) : undefined,
		country: typeof s.country === 'string' ? s.country : undefined,
		province: typeof s.province === 'string' ? s.province : undefined,
		place: typeof s.place === 'string' ? s.place : undefined
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
			<section className={cn(ui.hero, ui.heroHome)}>
				<div>
					<p className={ui.muted}>Personal training desk · no accounts</p>
					<h1>The Long Run</h1>
					<p>
						After a run: import the GPX in Coach, paste ChatGPT’s debrief, and the next session
						stays current. Stats and maps live here.
					</p>
				</div>
				<div className={ui.actions}>
					<Link className={ui.btnPrimary} to="/coach" search={{ tab: 'debrief' }}>
						Coach
					</Link>
					<Link className={ui.btnGhost} to="/import">
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
	const country = search.country ?? 'all';
	const province = search.province ?? 'all';
	const place = search.place ?? 'all';

	const allRuns = data.runs;
	const availableSports = new Set(allRuns.map((r) => normalizeActivityType(r.activity_type)));
	const scoped = allRuns
		.filter((r) => sport === 'all' || normalizeActivityType(r.activity_type) === sport)
		.filter((r) => country === 'all' || r.country === country)
		.filter((r) => province === 'all' || r.province === province)
		.filter((r) => place === 'all' || r.place === place);
	const runs = filterRunsByRange(scoped, range);
	const trackIds = routeIdsForRuns(runs);
	const locationActive = country !== 'all' || province !== 'all' || place !== 'all';
	const tracks =
		range.kind === 'all' && sport === 'all' && !locationActive
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
				<section className={nextUp} aria-labelledby="next-up-heading">
					<p className={nextUpKicker}>
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
					{data.weekView.next.route && (
						<RouteChip
							slug={data.weekView.next.route.slug}
							name={data.weekView.next.route.name}
							distanceKm={data.weekView.next.route.distance_km}
						/>
					)}
					<p className={cn(ui.muted, 'mt-[0.4rem]')}>
						Week {data.weekView.week.week} · {data.weekView.week.phase}
						{data.weekView.week.focus ? ` · ${data.weekView.week.focus}` : ''}
					</p>
				</section>
			)}
			{data.weekView && !data.weekView.next && (
				<section className={nextUpDone} aria-labelledby="next-up-heading">
					<p className={nextUpKicker}>This week</p>
					<h2 id="next-up-heading">
						{data.weekView.sessions.some((s) => s.skipped)
							? 'Week complete — some sessions skipped'
							: 'All planned sessions logged'}
					</h2>
					<p className={cn(ui.muted, 'mt-[0.4rem]')}>
						Week {data.weekView.week.week} · {data.weekView.week.phase}. Use Coach to plan next week.
					</p>
				</section>
			)}

			{data.weekView && (
				<section className="mt-[1.35rem] mb-[0.35rem] p-0" aria-labelledby="plan-heading">
					<div className="mb-3 [&_h2]:text-[1.2rem] [&_h2]:font-bold [&_h2]:m-0 [&_p]:mt-1 [&_p]:mb-0 [&_p]:text-[0.92rem]">
						<h2 id="plan-heading">Plan</h2>
						<p className={ui.muted}>
							Week {data.weekView.week.week} · {data.weekView.week.phase}
							{data.weekView.week.focus ? ` · ${data.weekView.week.focus}` : ''}
						</p>
					</div>
					<div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-[0.65rem] items-stretch max-[860px]:grid-cols-1 max-[860px]:gap-2">
						{data.weekView.sessions.map((session, i) => {
							const status = session.done
								? 'done'
								: session.skipped
									? 'skipped'
									: session.isNext
										? 'next'
										: null;
							return (
								<div
									key={`${session.day}-${i}`}
									className={cn(
										'flex flex-col gap-[0.15rem] min-w-0 p-[0.7rem_0.85rem] rounded-[10px]',
										session.isNext
											? 'bg-[color-mix(in_srgb,var(--color-accent)_10%,var(--color-panel))] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-accent)_40%,var(--color-line))]'
											: 'bg-[color-mix(in_srgb,var(--color-panel)_55%,transparent)]',
										session.done && 'opacity-55',
										session.skipped && 'opacity-42'
									)}
								>
									<div className="flex items-baseline justify-between gap-2 min-w-0">
										<span className="text-[0.72rem] tracking-[0.06em] uppercase text-accent font-semibold min-w-0 [overflow-wrap:anywhere]">
											{session.day}
											{` · ${activityLabel(session.activity_type ?? 'run')}`}
											{status ? ` · ${status}` : ''}
										</span>
										{session.distance_km != null && (
											<span className="shrink-0 text-[0.92rem] font-bold tracking-[-0.02em] text-fg whitespace-nowrap">
												{session.distance_km} km
											</span>
										)}
									</div>
									<strong
										className="font-display text-base font-bold tracking-[-0.02em] leading-[1.25] [overflow-wrap:anywhere]"
										title={session.label}
									>
										{session.label}
									</strong>
									<p className="text-[0.92rem] leading-[1.5] mt-[0.35rem] text-fg opacity-90 [overflow-wrap:anywhere]">
										{session.detail}
									</p>
									{session.route && (
										<Link
											className="block mt-auto pt-[0.45rem] text-[0.8rem] font-[650] text-accent overflow-hidden text-ellipsis whitespace-nowrap hover:underline"
											to="/routes/$slug"
											params={{ slug: session.route.slug }}
											title={session.route.name}
										>
											{session.route.name}
										</Link>
									)}
								</div>
							);
						})}
					</div>
				</section>
			)}

			<FilterSheet summary={filterSummary(sport, range, { country, province, place })}>
				<SportFilter sport={sport} to="/" available={availableSports} />
				<DateRangeFilter range={range} to="/" />
				<PlaceFilter to="/" runs={allRuns} country={country} province={province} place={place} />
			</FilterSheet>

			{filteredEmpty ? (
				<div className={cn(ui.panel, ui.muted, 'grid gap-[0.85rem] justify-items-start')}>
					<p>
						No {activityPlural(sport)} in {range.label.toLowerCase()}.
					</p>
					<Link className={ui.btnGhost} to="/" search={{}}>
						Show all time
					</Link>
				</div>
			) : (
				<>
					<section
						className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-0 mb-[0.55rem] py-[0.85rem] border-y border-line max-sm:grid-cols-3 max-sm:gap-y-[0.85rem] max-sm:py-3"
						aria-label="Training stats"
					>
						<div className={statsItem}>
							<span className={cn(statsLabel, 'text-accent font-semibold')}>
								Days to {data.goals.race_name}
							</span>
							<strong className={cn(statsValue, 'text-accent text-[2.1rem] max-sm:text-[1.7rem]')}>
								{stats.daysToRace ?? '—'}
							</strong>
						</div>
						<div className={statsItem}>
							<span className={cn(statsLabel, 'text-muted')}>
								{rangeActive ? range.label : 'Logged'}
							</span>
							<strong className={cn(statsValue, 'text-[1.35rem] max-sm:text-[1.2rem]')}>
								{stats.totalKm}
								<span className={statsUnit}> km</span>
							</strong>
						</div>
						<div className={statsItem}>
							<span className={cn(statsLabel, 'text-muted')}>Sessions</span>
							<strong className={cn(statsValue, 'text-[1.35rem] max-sm:text-[1.2rem]')}>
								{stats.runCount}
							</strong>
						</div>
						<div className={statsItem}>
							<span className={cn(statsLabel, 'text-muted')}>Longest</span>
							<strong className={cn(statsValue, 'text-[1.35rem] max-sm:text-[1.2rem]')}>
								{stats.longestKm ?? '—'}
								{stats.longestKm != null && <span className={statsUnit}> km</span>}
							</strong>
						</div>
						{!rangeActive && (
							<>
								<div className={statsItem}>
									<span className={cn(statsLabel, 'text-muted')}>This month</span>
									<strong className={cn(statsValue, 'text-[1.35rem] max-sm:text-[1.2rem]')}>
										{stats.monthRuns}
										<span className={statsUnit}> · {stats.monthKm} km</span>
									</strong>
								</div>
								<div className={statsItem}>
									<span className={cn(statsLabel, 'text-muted')}>Last 7 days</span>
									<strong className={cn(statsValue, 'text-[1.35rem] max-sm:text-[1.2rem]')}>
										{stats.weekKm}
										<span className={statsUnit}> km</span>
									</strong>
								</div>
							</>
						)}
					</section>
					<p className={cn('mb-7 text-[0.88rem]', ui.muted)}>
						Shins {shinLabel(stats)}
						<span aria-hidden="true"> · </span>
						Session streak {stats.streak || '—'}
						<span aria-hidden="true"> · </span>
						{stats.mappedRuns}/{stats.runCount} mapped
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

					<section className="mb-1" aria-labelledby="routes-heading">
						<div className={cn(ui.sectionTitle, 'mt-2')}>
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

					<div className={ui.sectionTitle}>
						<div>
							<h2>{rangeActive ? 'Runs in range' : 'Recent runs'}</h2>
							<p>
								{stats.runCount} {rangeActive ? `in ${range.label.toLowerCase()}` : 'total'}
							</p>
						</div>
						<div className={ui.actions}>
							<Link className={ui.btnGhost} to="/timeline" search={timelineSearch}>
								Full timeline
							</Link>
							<Link className={ui.btnGhost} to="/import">
								Add
							</Link>
						</div>
					</div>

					<div className={ui.grid}>
						{recent.length ? (
							recent.map((run, i) => (
								<Link
									key={run.slug}
									className={cn(ui.runRow, ui.runRowCompact)}
									to="/runs/$slug"
									params={{ slug: run.slug }}
									style={{ animationDelay: `${i * 40}ms` }}
								>
									<strong className={ui.runTitle}>
										{run.date}
										{run.has_map && (
											<span
												className={ui.mapBadge}
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
									<div className="font-[650] tracking-[-0.02em] max-sm:text-[0.95rem]">
										{showsField(run.activity_type, 'distance')
											? `${run.distance_km ?? '—'} km · ${metricText(run)}`
											: metricText(run)}
									</div>
									<div className={cn(ui.muted, 'text-[0.8rem] max-sm:text-[0.76rem]')}>
										{compactRunSub(run)}
									</div>
								</Link>
							))
						) : (
							<div className={cn(ui.panel, ui.muted)}>
								No runs yet. Import a file or log one manually.
							</div>
						)}
					</div>
				</>
			)}
		</>
	);
}
