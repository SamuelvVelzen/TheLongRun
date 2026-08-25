import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { getTimelineRuns, deleteRun } from '$lib/server/functions';
import { filterRunsByRange, parseDateRange } from '$lib/date-range';
import { clearFilterSearch, validateFilterSearch } from '$lib/filter-search';
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
import type { RunWithMap } from '$lib/types';
import { DateRangeFilter } from '../components/DateRangeFilter';
import { FilterSheet, filterSummary } from '../components/FilterSheet';
import { PlaceFilter } from '../components/PlaceFilter';
import { SportFilter } from '../components/SportFilter';
import { TrendsSection } from '../components/TrendsSection';
import { DeferredData } from '../components/DeferredData';
import { BestEffortBadges, BestEffortBoard } from '../components/BestEffortBadges';
import {
	buildBestEffortBoard,
	highlightsForActivity,
	supportsBestEfforts
} from '$lib/best-efforts';

export const Route = createFileRoute('/timeline')({
	validateSearch: validateFilterSearch,
	loader: () => ({ page: getTimelineRuns() }),
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

function Timeline() {
	const { page } = Route.useLoaderData();
	return (
		<>
			<section className="hero">
				<div>
					<p className="muted">Every session in order</p>
					<h1>Timeline</h1>
					<p>Add a file, or open one for notes and full metrics.</p>
				</div>
				<div className="actions">
					<Link className="btn btn-primary" to="/import">
						Add activity
					</Link>
					<Link className="btn btn-ghost" to="/coach" search={{ tab: 'debrief' }}>
						Coach
					</Link>
				</div>
			</section>
			<DeferredData promise={page}>{(allRuns) => <TimelineBody allRuns={allRuns} />}</DeferredData>
		</>
	);
}

function TimelineBody({ allRuns }: { allRuns: RunWithMap[] }) {
	const search = Route.useSearch();
	const router = useRouter();

	const sp = new URLSearchParams();
	if (search.range) sp.set('range', search.range);
	if (search.from) sp.set('from', search.from);
	if (search.to) sp.set('to', search.to);
	const range = parseDateRange(sp);
	const sport = search.sport ?? 'all';
	const country = search.country ?? 'all';
	const province = search.province ?? 'all';
	const place = search.place ?? 'all';
	const availableSports = new Set(allRuns.map((r) => normalizeActivityType(r.activity_type)));

	const scoped = allRuns
		.filter((r) => sport === 'all' || normalizeActivityType(r.activity_type) === sport)
		.filter((r) => country === 'all' || r.country === country)
		.filter((r) => province === 'all' || r.province === province)
		.filter((r) => place === 'all' || r.place === place);
	const runs = filterRunsByRange(scoped, range);
	const groups = groupRuns(runs);
	const trends = buildTrainingTrends(runs, { endDate: range.to, fromDate: range.from });
	const boardSport = sport === 'walk' ? 'walk' : 'run';
	const showBoard = sport === 'all' || sport === 'run' || sport === 'walk';
	const board = showBoard ? buildBestEffortBoard(allRuns, boardSport) : [];
	const highlightsBySlug = new Map(
		allRuns
			.filter((r) => supportsBestEfforts(r.activity_type))
			.map((r) => [r.slug, highlightsForActivity(r.slug, r.activity_type, allRuns)] as const)
	);

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
			<FilterSheet summary={filterSummary(sport, range, { country, province, place })}>
				<SportFilter sport={sport} to="/timeline" defaultSport="all" available={availableSports} />
				<DateRangeFilter range={range} to="/timeline" />
				<PlaceFilter
					to="/timeline"
					runs={allRuns}
					country={country}
					province={province}
					place={place}
				/>
			</FilterSheet>

			{neverLogged ? (
				<div className="panel muted">No activities yet.</div>
			) : filteredEmpty ? (
				<div className="panel muted range-empty">
					<p>
						No {activityPlural(sport)} in {range.label.toLowerCase()}.
					</p>
					<Link className="btn btn-ghost" to="/timeline" search={clearFilterSearch()}>
						Show all time
					</Link>
				</div>
			) : (
				<>
					{trends?.series.length ? (
						<TrendsSection
							trends={trends}
							caption={
								range.kind === 'all'
									? 'Progress over recent weeks and runs'
									: `Within ${range.label.toLowerCase()}`
							}
						/>
					) : null}

					<BestEffortBoard
						rows={board}
						caption={
							boardSport === 'walk'
								? 'All-time top 3 among walks'
								: 'All-time top 3 among runs'
						}
					/>

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
														{hasContext(run) && <FeelBadge />}
													</strong>
													<span className="tag accent">{activityLabel(run.activity_type)}</span>
												</div>
												{(run.day ||
													(run.session && run.session !== 'other') ||
													run.week != null ||
													run.start_time) && (
													<p className="muted timeline-sub">
														{[
															run.day || null,
															run.session && run.session !== 'other' ? run.session : null,
															run.week != null ? `W${run.week}` : null,
															run.start_time || null
														]
															.filter(Boolean)
															.join(' · ')}
													</p>
												)}
												<div className="timeline-metrics">
													{showsField(run.activity_type, 'distance') && (
														<span>{run.distance_km ?? '—'} km</span>
													)}
													<span>{metricText(run)}</span>
													{run.avg_hr != null ? (
														<span>
															HR {run.avg_hr}
															{run.max_hr != null && `/${run.max_hr}`}
														</span>
													) : run.elev_gain != null &&
													  showsField(run.activity_type, 'elevation') ? (
														<span>↑ {run.elev_gain} m</span>
													) : run.time && normalizeActivityType(run.activity_type) !== 'strength' ? (
														<span>{run.time}</span>
													) : null}
												</div>
												<BestEffortBadges
													compact
													highlights={highlightsBySlug.get(run.slug) ?? []}
												/>
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
