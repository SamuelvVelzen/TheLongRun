import {
	activityLabel,
	activityListHeading,
	activityPlural,
	activitySub,
	hasContext,
	metricText,
	normalizeActivityType,
	showsField
} from '$lib/activity';
import { SignInLink, useAuthed } from '$lib/auth';
import {
	filterRunsByRange,
	parseDateRange,
	routeIdsForRuns,
	type RangeKind
} from '$lib/date-range';
import { formatHorizonShort } from '$lib/goals';
import { collapseRuns, groupedSessionTitle } from '$lib/group';
import { buildDashboardStats, daysUntil, type DashboardStats } from '$lib/plan';
import { getDashboardData } from '$lib/server/functions';
import { appHead } from '$lib/title';
import { buildTrainingTrends } from '$lib/trends';
import { cn } from '$lib/ui';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Fragment, useMemo } from 'react';
import { ActivityFilters } from '../components/ActivityFilters';
import { rangeToSearch, type RangeSearch } from '../components/DateRangeFilter';
import { DeferredData } from '../components/DeferredData';
import { FeelBadge } from '../components/FeelBadge';
import { ActivityMark, Icon } from '../components/Icon';
import { DashboardNextUp } from '../components/DashboardNextUp';
import {
	PageHero,
	Actions,
	EmptyState,
	Grid,
	IconLabelLink,
	MapBadge,
	Panel,
	RunTitle,
	SectionTitle
} from '../components/ui';
import { RoutesHeatmap, type RouteMeta } from '../components/RoutesHeatmap';
import {
	matchesSportFilter,
	parseSportSearch,
	selectedSports,
	sportIsAll
} from '../components/SportFilter';
import { TrendsSection } from '../components/TrendsSection';

import { buttonClass } from '../components/ui/Button';
import { runRowClass } from '../components/ui/Chrome';

type DashSearch = RangeSearch & {
	sport?: string;
	country?: string;
	province?: string;
	place?: string;
};

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
		sport: parseSportSearch(s.sport),
		country: typeof s.country === 'string' ? s.country : undefined,
		province: typeof s.province === 'string' ? s.province : undefined,
		place: typeof s.place === 'string' ? s.place : undefined
	}),
	loader: () => ({ page: getDashboardData() }),
	head: () => appHead('Dashboard'),
	component: Dashboard
});

function fmt(n: number | null, digits = 1) {
	if (n == null) return '—';
	return n.toFixed(digits);
}

function bodyTrendLabel(t: DashboardStats['bodyTrends'][number]) {
	if (t.recent == null) return `${t.area} —`;
	if (t.delta == null) return `${t.area} ${fmt(t.recent)}`;
	if (t.delta === 0) return `${t.area} ${fmt(t.recent)} →`;
	const arrow = t.delta < 0 ? '↓' : '↑';
	return `${t.area} ${fmt(t.recent)} ${arrow}${Math.abs(t.delta)}`;
}

function Dashboard() {
	const { page } = Route.useLoaderData();
	const authed = useAuthed();
	return (
		<DeferredData promise={page}>
			{(data) => <DashboardBody data={data} authed={authed} />}
		</DeferredData>
	);
}

function DashboardBody({
	data,
	authed
}: {
	data: Awaited<ReturnType<typeof getDashboardData>>;
	authed: boolean;
}) {
	const search = Route.useSearch();

	const sp = new URLSearchParams();
	if (search.range) sp.set('range', search.range);
	if (search.from) sp.set('from', search.from);
	if (search.to) sp.set('to', search.to);
	const range = parseDateRange(sp);
	const sport = search.sport ?? 'all';
	const country = search.country ?? 'all';
	const province = search.province ?? 'all';
	const place = search.place ?? 'all';

	const allRuns = data.runs;
	const availableSports = new Set(allRuns.map((r) => normalizeActivityType(r.activity_type)));
	const scoped = allRuns
		.filter((r) => matchesSportFilter(r.activity_type, sport))
		.filter((r) => country === 'all' || r.country === country)
		.filter((r) => province === 'all' || r.province === province)
		.filter((r) => place === 'all' || r.place === place);
	const runs = filterRunsByRange(scoped, range);
	const trackIds = routeIdsForRuns(runs);
	const locationActive = country !== 'all' || province !== 'all' || place !== 'all';
	const sportFilterActive = !sportIsAll(sport);
	const tracks =
		range.kind === 'all' && !sportFilterActive && !locationActive
			? data.tracks
			: data.tracks.filter((t) => trackIds.has(t.id));
	const listItems = collapseRuns(runs, allRuns, data.groups);
	const recent = listItems.slice(0, 8);

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
				sub: showsField(run.activity_type, 'distance')
					? `${run.distance_km ?? '—'} km · ${metricText(run)}`
					: metricText(run),
				activityType: normalizeActivityType(run.activity_type)
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

	const raceDays = data.activeGoal ? daysUntil(data.activeGoal.date) : null;
	const daysToRace = raceDays != null && raceDays >= 0 ? raceDays : null;
	const mappedRuns = runs.filter((r) => r.has_map).length;
	const stats = buildDashboardStats(runs, {
		daysToRace,
		mappedRuns,
		streak: data.streak
	});
	const trends = buildTrainingTrends(runs, {
		endDate: range.to,
		fromDate: range.from,
		calendar: data.calendar
	});

	const totalAllTime = allRuns.length;
	const filteredEmpty = totalAllTime > 0 && stats.runCount === 0;
	const rangeActive = range.kind !== 'all';
	const timelineSearch = rangeToSearch(range.kind, range.from ?? undefined, range.to ?? undefined);
	return (
		<>
			<ActivityFilters
				to="/"
				sport={sport}
				range={range}
				runs={allRuns}
				country={country}
				province={province}
				place={place}
				availableSports={availableSports}
			/>

			<PageHero
				variant="home"
				kicker="Personal training desk"
				title="The Long Run"
				lead={
					<p>
						Stats, maps, and this week’s plan live here.{' '}
						<Link className="text-accent-fg font-semibold" to="/goals">
							Goals
						</Link>{' '}
						hold the race — and the medals after.
					</p>
				}
				actionsClassName="justify-start!"
				actions={
					<>
						<IconLabelLink
							label="Coach"
							variant="primary"
							size="default"
							to="/coach"
							icon={<Icon name="coach" size={16} />}
						/>
						{authed ? (
							<IconLabelLink
								label="Add activity"
								size="default"
								to="/import"
								icon={<Icon name="plus" size={16} />}
							/>
						) : (
							<SignInLink
								className={cn(
									buttonClass({ variant: 'ghost' }),
									'max-sm:min-w-11 max-sm:w-11 max-sm:px-0 max-sm:justify-center max-sm:gap-0'
								)}
								aria-label="Sign in to edit"
								title="Sign in to edit"
							>
								<Icon name="signIn" size={16} />
								<span className="max-sm:hidden">Sign in to edit</span>
							</SignInLink>
						)}
					</>
				}
			/>

			{data.weekView ? (
				<div className="mt-5 max-sm:mt-0">
					<DashboardNextUp
						weekView={data.weekView}
						calendar={data.calendar}
						planRoutes={data.planRoutes}
					/>
				</div>
			) : null}

			{filteredEmpty ? (
				<EmptyState
					action={
						<Link className={buttonClass({ variant: 'ghost' })} to="/" search={{}}>
							Show all time
						</Link>
					}
				>
					No {activityPlural(sport)} in {range.label.toLowerCase()}.
				</EmptyState>
			) : (
				<>
					<section
						className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-0 mb-[0.55rem] py-[0.85rem] border-y border-line max-sm:grid-cols-3 max-sm:gap-y-[0.85rem] max-sm:py-3"
						aria-label="Training stats"
					>
						<div className={statsItem}>
							<span className={cn(statsLabel, 'text-accent-fg font-semibold')}>
								{data.activeGoal
									? raceDays != null && raceDays < 0
										? `Since ${data.activeGoal.name}`
										: `Days to ${data.activeGoal.name}`
									: data.nextIntention
										? 'Look-ahead'
										: data.lastMedal
											? data.lastMedal.name
											: 'Next race'}
							</span>
							<strong
								className={cn(statsValue, 'text-accent-fg text-[2.1rem] max-sm:text-[1.7rem]')}
							>
								{data.activeGoal ? (
									raceDays == null ? (
										'—'
									) : raceDays === 0 ? (
										'Today'
									) : (
										Math.abs(raceDays)
									)
								) : data.nextIntention ? (
									formatHorizonShort(data.nextIntention.horizon)
								) : data.lastMedal?.result?.time ? (
									data.lastMedal.result.time
								) : (
									<Link className="text-accent-fg" to="/goals">
										Set
									</Link>
								)}
							</strong>
							{data.activeGoal || data.nextIntention || data.lastMedal ? (
								<Link className="text-[0.78rem] text-accent-fg font-semibold" to="/goals">
									{data.activeGoal && raceDays != null && raceDays < 0
										? 'Pin result'
										: data.activeGoal && raceDays != null
											? 'Days'
											: data.nextIntention && !data.activeGoal
												? data.nextIntention.name
												: 'Goals'}
								</Link>
							) : null}
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
										{stats.monthKm > 0 && <span className={statsUnit}> · {stats.monthKm} km</span>}
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
					<p className={cn('mb-7 text-[0.88rem]', 'text-muted')}>
						{(sportIsAll(sport) ||
							selectedSports(sport).some((s) => s === 'run' || s === 'walk')) &&
							stats.bodyTrends.map((t) => (
								<Fragment key={t.area}>
									{bodyTrendLabel(t)}
									<span aria-hidden="true"> · </span>
								</Fragment>
							))}
						Session streak {stats.streak || '—'}
						<span aria-hidden="true"> · </span>
						{stats.mappedRuns}/{stats.runCount} mapped
					</p>

					{trends.series.length > 0 && (
						<TrendsSection
							trends={trends}
							caption={
								rangeActive ? `Within ${range.label.toLowerCase()}` : 'Progress over recent weeks'
							}
						/>
					)}

					<section className="mb-1" aria-labelledby="routes-heading">
						<SectionTitle className="mt-2">
							<div>
								<h2 id="routes-heading">
									{rangeActive || sportFilterActive || locationActive
										? 'Routes in view'
										: 'All routes'}
								</h2>
								<p>
									{tracks.length
										? `${tracks.length} tracks overlaid · overlaps glow brighter`
										: rangeActive || sportFilterActive || locationActive
											? 'No GPS routes in this view'
											: 'Heatmap appears when GPS routes are imported'}
								</p>
							</div>
						</SectionTitle>
						<RoutesHeatmap
							tracks={tracks}
							meta={routeMeta}
							focusIds={focusIds}
							planPeek={
								data.weekView
									? {
											weekView: data.weekView,
											calendar: data.calendar,
											planRoutes: data.planRoutes
										}
									: null
							}
						/>
					</section>

					<SectionTitle>
						<div>
							<h2>{activityListHeading(sport, rangeActive ? 'range' : 'recent')}</h2>
							<p>
								{listItems.length} {rangeActive ? `in ${range.label.toLowerCase()}` : 'total'}
							</p>
						</div>
						<Actions className="max-sm:hidden">
							<Link
								className={buttonClass({ variant: 'ghost' })}
								to="/timeline"
								search={{
									...timelineSearch,
									sport: sportFilterActive ? sport : undefined,
									country: country === 'all' ? undefined : country,
									province: province === 'all' ? undefined : province,
									place: place === 'all' ? undefined : place
								}}
							>
								<Icon name="timeline" size={16} />
								Full timeline
							</Link>
							{authed ? (
								<Link className={buttonClass({ variant: 'ghost' })} to="/import">
									<Icon name="plus" size={16} />
									Add
								</Link>
							) : null}
						</Actions>
					</SectionTitle>

					<Grid>
						{recent.length ? (
							recent.map((item, i) =>
								item.kind === 'group' ? (
									<Link
										key={item.group.id}
										className={runRowClass(true)}
										to="/groups/$id"
										params={{ id: item.group.id }}
										style={{ animationDelay: `${i * 40}ms` }}
									>
										<ActivityMark type={item.stats.activity_type} />
										<span className="min-w-0 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-[0.1rem] items-baseline">
											<RunTitle>
												{groupedSessionTitle(item.group, item.members.length, item.stats.date)}
												{item.members.some((m) => m.has_map) && (
													<MapBadge title="Route map available" aria-label="Has route map">
														<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
															<path
																fill="currentColor"
																d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"
															/>
														</svg>
													</MapBadge>
												)}
											</RunTitle>
											<span className="font-[650] tracking-[-0.02em] justify-self-end text-right max-sm:text-[0.95rem]">
												{showsField(item.stats.activity_type, 'distance')
													? `${item.stats.distance_km ?? '—'} km · ${metricText(item.stats)}`
													: metricText(item.stats)}
											</span>
											<span
												className={cn(
													'text-muted',
													'text-[0.8rem] col-span-full max-sm:text-[0.76rem]'
												)}
											>
												{`${item.members.length} parts · ${item.stats.types.map((t) => activityLabel(t)).join(' + ')}`}
											</span>
										</span>
									</Link>
								) : (
									<Link
										key={item.run.slug}
										className={runRowClass(true)}
										to="/runs/$slug"
										params={{ slug: item.run.slug }}
										style={{ animationDelay: `${i * 40}ms` }}
									>
										<ActivityMark type={item.run.activity_type} />
										<span className="min-w-0 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-[0.1rem] items-baseline">
											<RunTitle>
												{item.run.date}
												{item.run.has_map && (
													<MapBadge title="Route map available" aria-label="Has route map">
														<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
															<path
																fill="currentColor"
																d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"
															/>
														</svg>
													</MapBadge>
												)}
												{hasContext(item.run) && <FeelBadge />}
											</RunTitle>
											<span className="font-[650] tracking-[-0.02em] justify-self-end text-right max-sm:text-[0.95rem]">
												{showsField(item.run.activity_type, 'distance')
													? `${item.run.distance_km ?? '—'} km · ${metricText(item.run)}`
													: metricText(item.run)}
											</span>
											<span
												className={cn(
													'text-muted',
													'text-[0.8rem] col-span-full max-sm:text-[0.76rem]'
												)}
											>
												{activitySub(item.run)}
											</span>
										</span>
									</Link>
								)
							)
						) : (
							<Panel className="text-muted">
								No {activityPlural(sport)} yet. Import a file or log one manually.
							</Panel>
						)}
					</Grid>
				</>
			)}
		</>
	);
}
