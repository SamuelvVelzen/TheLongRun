import {
    activityLabel,
    activityPlural,
    activityTally,
    hasContext,
    metricText,
    normalizeActivityType,
    showsField
} from '$lib/activity';
import { AuthGate } from '$lib/auth';
import {
    buildBestEffortBoard,
    highlightsForActivity,
    supportsBestEfforts
} from '$lib/best-efforts';
import { filterRunsByRange, parseDateRange, type RangeKind } from '$lib/date-range';
import { deleteRun, getTimelineRuns } from '$lib/server/functions';
import { buildTrainingTrends } from '$lib/trends';
import type { RunWithMap } from '$lib/types';
import { cn, ui } from '$lib/ui';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { BestEffortBadges, BestEffortBoard } from '../components/BestEffortBadges';
import { DateRangeFilter, type RangeSearch } from '../components/DateRangeFilter';
import { DeferredData } from '../components/DeferredData';
import { DeleteButton } from '../components/DeleteButton';
import { ConfirmDialog } from '../components/Dialog';
import { FeelBadge } from '../components/FeelBadge';
import { FilterSheet, filterSummary } from '../components/FilterSheet';
import { ActivityTag, Icon } from '../components/Icon';
import { PlaceFilter } from '../components/PlaceFilter';
import {
    matchesSportFilter,
    parseSportSearch,
    selectedSports,
    SportFilter,
    sportIsAll
} from '../components/SportFilter';
import { TrendsSection } from '../components/TrendsSection';

type TimelineSearch = RangeSearch & {
	sport?: string;
	country?: string;
	province?: string;
	place?: string;
};

export const Route = createFileRoute('/timeline')({
	validateSearch: (s: Record<string, unknown>): TimelineSearch => ({
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
			<section className={cn(ui.hero, ui.heroQuiet)}>
				<div>
					<p className={ui.muted}>Every session in order</p>
					<h1>Timeline</h1>
					<p>Add a file, or open one for notes and full metrics.</p>
				</div>
				<div className={cn(ui.actions, 'max-sm:hidden')}>
					<Link className={ui.btnPrimary} to="/import">
						<Icon name="plus" size={16} />
						Add activity
					</Link>
					<Link className={ui.btnGhost} to="/coach">
						<Icon name="coach" size={16} />
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
		.filter((r) => matchesSportFilter(r.activity_type, sport))
		.filter((r) => country === 'all' || r.country === country)
		.filter((r) => province === 'all' || r.province === province)
		.filter((r) => place === 'all' || r.place === place);
	const runs = filterRunsByRange(scoped, range);
	const groups = groupRuns(runs);
	const trends = buildTrainingTrends(runs, { endDate: range.to, fromDate: range.from });
	const selected = selectedSports(sport);
	const boardSport = !selected.includes('run') && selected.includes('walk') ? 'walk' : 'run';
	const showBoard = sportIsAll(sport) || selected.includes('run') || selected.includes('walk');
	const board = showBoard ? buildBestEffortBoard(allRuns, boardSport) : [];
	const highlightsBySlug = new Map(
		allRuns
			.filter((r) => supportsBestEfforts(r.activity_type))
			.map((r) => [r.slug, highlightsForActivity(r.slug, r.activity_type, allRuns)] as const)
	);

	const totalAllTime = allRuns.length;
	const neverLogged = totalAllTime === 0;
	const filteredEmpty = totalAllTime > 0 && !groups.length;
	const [pending, setPending] = useState<RunWithMap | null>(null);

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
				<div className={cn(ui.panel, ui.muted)}>No activities yet.</div>
			) : filteredEmpty ? (
				<div className={cn(ui.panel, ui.muted, 'grid gap-[0.85rem] justify-items-start')}>
					<p>
						No {activityPlural(sport)} in {range.label.toLowerCase()}.
					</p>
					<Link className={ui.btnGhost} to="/timeline" search={{}}>
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
									? 'Progress over recent weeks'
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
							<div className={ui.sectionTitle}>
								<div>
									<h2>{group.label}</h2>
									<p>{activityTally(group.runs.length, sport, group.totalKm)}</p>
								</div>
							</div>

							<div className="grid gap-[0.35rem] mb-6 max-sm:gap-[0.45rem]">
								{group.runs.map((run, i) => (
									<div
										key={run.slug}
										className="group grid grid-cols-[1.4rem_1fr] gap-[0.85rem] items-stretch animate-rise max-sm:grid-cols-[1rem_1fr] max-sm:gap-[0.65rem]"
										style={{ animationDelay: `${i * 35}ms` }}
									>
										<div
											className="relative flex justify-center before:content-[''] before:absolute before:top-0 before:-bottom-[0.35rem] before:w-0.5 before:bg-[rgba(200,242,90,0.22)] group-last:before:bottom-1/2"
											aria-hidden="true"
										>
											<span className="relative z-[1] size-[0.7rem] mt-5 rounded-full bg-accent shadow-[0_0_0_4px_rgba(200,242,90,0.12)]"></span>
										</div>
										<div className="relative p-4 px-[1.1rem] border border-line rounded-[14px] bg-white/[0.02] transition-[border-color,background-color,transform] duration-150 group-hover:border-[rgba(200,242,90,0.35)] group-hover:bg-[rgba(200,242,90,0.04)] group-hover:-translate-y-px group-active:border-[rgba(200,242,90,0.35)] group-active:bg-[rgba(200,242,90,0.04)] group-active:-translate-y-px max-sm:p-[0.85rem_0.95rem]">
											<Link
												className="block text-inherit pr-[2.4rem]"
												to="/runs/$slug"
												params={{ slug: run.slug }}
											>
												<div className="flex flex-wrap items-center gap-x-2 gap-y-[0.35rem]">
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
													<ActivityTag type={run.activity_type} />
												</div>
												{(run.day ||
													(run.session && run.session !== 'other') ||
													run.week != null ||
													run.start_time) && (
													<p className={cn(ui.muted, 'mt-[0.2rem] text-[0.82rem]')}>
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
												<div className="flex flex-wrap gap-x-[0.85rem] gap-y-[0.35rem] mt-[0.4rem] text-muted text-[0.9rem]">
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
												{run.notes && (
													<p className={cn(ui.muted, 'mt-[0.35rem] line-clamp-1 overflow-hidden max-sm:mt-[0.28rem]')}>
														{run.notes}
													</p>
												)}
											</Link>
											<AuthGate>
											<form
												className="absolute top-[0.65rem] right-[0.65rem] inline-flex items-center m-0 opacity-100 sm:opacity-55 hover:opacity-100 group-hover:opacity-100"
												onSubmit={(e) => e.preventDefault()}
											>
												<DeleteButton
													label={`Delete ${activityLabel(run.activity_type).toLowerCase()} ${run.date}`}
													onClick={(e) => {
														e.preventDefault();
														setPending(run);
													}}
												/>
											</form>
											</AuthGate>
										</div>
									</div>
								))}
							</div>
						</div>
					))}
				</>
			)}
			<ConfirmDialog
				open={pending != null}
				title="Delete this activity?"
				description={
					pending
						? `${pending.date}${pending.day ? ` · ${pending.day}` : ''}. This cannot be undone.`
						: null
				}
				onClose={() => setPending(null)}
				onConfirm={async () => {
					if (!pending) return;
					await deleteRun({ data: pending.slug });
					await router.invalidate();
				}}
			/>
		</>
	);
}
