import {
	activityLabel,
	activityPlural,
	activityTally,
	hasContext,
	metricText,
	normalizeActivityType,
	showsField
} from '$lib/activity';
import { AuthGate, useAuthed } from '$lib/auth';
import { buildBestEffortBoard, highlightsForActivity, supportsBestEfforts } from '$lib/best-efforts';
import { filterRunsByRange, isoDateLocal, parseDateRange, type RangeKind } from '$lib/date-range';
import {
	collapseRuns,
	effortOwnersForBoard,
	groupHighlights,
	groupedSessionTitle,
	groupTypeCaption,
	type TimelineItem
} from '$lib/group';
import { createActivityGroupFn, deleteRun, getTimelineRuns } from '$lib/server/functions';
import { formatTimelineClipboard } from '$lib/timeline-copy';
import { buildTrainingTrends } from '$lib/trends';
import type { ActivityGroupInfo, RunWithMap } from '$lib/types';
import { cn, ui } from '$lib/ui';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { ActivityFilters } from '../components/ActivityFilters';
import { BestEffortBadges, BestEffortBoard } from '../components/BestEffortBadges';
import { type RangeSearch } from '../components/DateRangeFilter';
import { DeferredData } from '../components/DeferredData';
import { DeleteButton, EditButton } from '../components/DeleteButton';
import { ConfirmDialog } from '../components/Dialog';
import { filterSummary } from '../components/FilterSheet';
import { FeelBadge } from '../components/FeelBadge';
import { ActivityTag, Icon } from '../components/Icon';
import { PageHero } from '../components/PageHero';
import { errorMessage, useSnackbar } from '../components/Snackbar';
import {
	matchesSportFilter,
	parseSportSearch,
	selectedSports,
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

function itemDate(item: TimelineItem) {
	return item.kind === 'run' ? item.run.date : item.stats.date;
}

function itemKm(item: TimelineItem) {
	return item.kind === 'run' ? (item.run.distance_km ?? 0) : (item.stats.distance_km ?? 0);
}

function groupItems(items: TimelineItem[]) {
	const groupsMap = new Map<string, TimelineItem[]>();
	for (const item of items) {
		const key = monthKey(itemDate(item));
		const list = groupsMap.get(key) ?? [];
		list.push(item);
		groupsMap.set(key, list);
	}
	return [...groupsMap.entries()].map(([key, rows]) => ({
		key,
		label: monthLabel(key),
		items: rows,
		totalKm: Math.round(rows.reduce((acc, item) => acc + itemKm(item), 0) * 10) / 10
	}));
}

function MapPin() {
	return (
		<span className={ui.mapBadge} title="Route map available" aria-label="Has route map">
			<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
				<path
					fill="currentColor"
					d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"
				/>
			</svg>
		</span>
	);
}

function Timeline() {
	const { page } = Route.useLoaderData();
	return (
		<DeferredData promise={page}>
			{(data) => <TimelineBody allRuns={data.runs} groups={data.groups} />}
		</DeferredData>
	);
}

function TimelineBody({
	allRuns,
	groups
}: {
	allRuns: RunWithMap[];
	groups: ActivityGroupInfo[];
}) {
	const search = Route.useSearch();
	const router = useRouter();
	const snack = useSnackbar();
	const authed = useAuthed();
	const [copied, setCopied] = useState(false);
	const [pending, setPending] = useState<RunWithMap | null>(null);
	const [selecting, setSelecting] = useState(false);
	const [picked, setPicked] = useState<string[]>([]);

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
	const items = collapseRuns(runs, allRuns, groups);
	const months = groupItems(items);
	const trends = buildTrainingTrends(runs, { endDate: range.to, fromDate: range.from });
	const selected = selectedSports(sport);
	const boardSport = !selected.includes('run') && selected.includes('walk') ? 'walk' : 'run';
	const showBoard = sportIsAll(sport) || selected.includes('run') || selected.includes('walk');
	const boardOwners = useMemo(
		() => effortOwnersForBoard(allRuns, groups, new Map(allRuns.map((r) => [r.slug, r]))),
		[allRuns, groups]
	);
	const board = showBoard ? buildBestEffortBoard(boardOwners, boardSport) : [];
	const highlightsBySlug = new Map(
		allRuns
			.filter((r) => supportsBestEfforts(r.activity_type))
			.map((r) => [r.slug, highlightsForActivity(r.slug, r.activity_type, allRuns)] as const)
	);

	const totalAllTime = allRuns.length;
	const neverLogged = totalAllTime === 0;
	const filteredEmpty = totalAllTime > 0 && !months.length;
	const summary = filterSummary(sport, range, { country, province, place });

	async function copyTimeline() {
		if (!runs.length) return;
		try {
			await navigator.clipboard.writeText(
				formatTimelineClipboard(runs, {
					summary,
					sport,
					todayIso: isoDateLocal(new Date())
				})
			);
			setCopied(true);
			setTimeout(() => setCopied(false), 1800);
		} catch {
			snack.error('Could not copy — select and copy the text instead.');
		}
	}

	function togglePick(slug: string) {
		setPicked((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));
	}

	async function groupPicked() {
		if (picked.length < 2) return;
		try {
			const res = await createActivityGroupFn({ data: { slugs: picked } });
			setPicked([]);
			setSelecting(false);
			await router.invalidate();
			await router.navigate({ to: '/groups/$id', params: { id: res.id } });
		} catch (err) {
			snack.error(errorMessage(err, 'Could not group those activities.'));
		}
	}

	return (
		<>
			<PageHero
				variant="quiet"
				kicker="Every session in order"
				title="Timeline"
				lead="Add a file, open one for notes, or copy the filtered log into a chat for race-readiness and training overview."
				hideActionsOnMobile
				actionsClassName="justify-start!"
				actions={
					<>
						<Link className={ui.btnPrimary} to="/import">
							<Icon name="plus" size={16} />
							Add activity
						</Link>
						<Link className={ui.btnGhost} to="/coach">
							<Icon name="coach" size={16} />
							Coach
						</Link>
						<button
							className={ui.btnGhost}
							type="button"
							disabled={!runs.length}
							title="Copy the filtered activity log for an AI chat"
							aria-label="Copy the filtered timeline"
							onClick={() => void copyTimeline()}
						>
							<Icon name={copied ? 'check' : 'copy'} size={16} />
							{copied ? (
								'Copied'
							) : (
								<>
									<span className="max-sm:hidden">Copy timeline</span>
									<span className="hidden max-sm:inline">Copy</span>
								</>
							)}
						</button>
						<AuthGate>
							{selecting ? (
								<>
									<button
										className={ui.btnPrimary}
										type="button"
										disabled={picked.length < 2}
										onClick={() => void groupPicked()}
									>
										Group {picked.length || ''}
									</button>
									<button
										className={ui.btnGhost}
										type="button"
										onClick={() => {
											setSelecting(false);
											setPicked([]);
										}}
									>
										Cancel
									</button>
								</>
							) : (
								<button
									className={ui.btnGhost}
									type="button"
									onClick={() => setSelecting(true)}
								>
									<Icon name="grid" size={16} />
									Group
								</button>
							)}
						</AuthGate>
					</>
				}
			/>
			<ActivityFilters
				to="/timeline"
				sport={sport}
				range={range}
				runs={allRuns}
				country={country}
				province={province}
				place={place}
				availableSports={availableSports}
			/>

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

					{months.map((month) => (
						<div key={month.key}>
							<div className={ui.sectionTitle}>
								<div>
									<h2>{month.label}</h2>
									<p>{activityTally(month.items.length, sport, month.totalKm)}</p>
								</div>
							</div>

							<div className="grid gap-[0.35rem] mb-6 max-sm:gap-[0.45rem]">
								{month.items.map((item, i) =>
									item.kind === 'group' ? (
										<div
											key={item.group.id}
											className="group grid grid-cols-[1.4rem_1fr] gap-[0.85rem] items-stretch animate-rise max-sm:grid-cols-[1rem_1fr] max-sm:gap-[0.65rem]"
											style={{ animationDelay: `${i * 35}ms` }}
										>
											<div
												className="relative flex justify-center before:content-[''] before:absolute before:top-0 before:-bottom-[0.35rem] before:w-0.5 before:bg-accent/22 group-last:before:bottom-1/2"
												aria-hidden="true"
											>
												<span className="relative z-[1] size-[0.7rem] mt-5 rounded-full bg-accent shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_12%,transparent)]"></span>
											</div>
											<div className="relative p-4 px-[1.1rem] border border-accent/35 rounded-[14px] bg-accent/4 transition-[border-color,background-color,transform] duration-150 group-hover:border-accent/55 group-hover:-translate-y-px max-sm:p-[0.85rem_0.95rem]">
												<Link
													className="block text-inherit"
													to="/groups/$id"
													params={{ id: item.group.id }}
												>
													<div className="flex flex-wrap items-center gap-x-2 gap-y-[0.35rem]">
														<strong className={ui.runTitle}>
															{groupedSessionTitle(
																item.group,
																item.members.length,
																item.stats.date
															)}
															{item.members.some((m) => m.has_map) && <MapPin />}
														</strong>
														{item.stats.types.map((t) => (
															<ActivityTag key={t} type={t} />
														))}
													</div>
													<p className={cn(ui.muted, 'mt-[0.2rem] text-[0.82rem]')}>
														{[
															`${item.members.length} parts`,
															item.stats.start_time || null,
															groupTypeCaption(item.stats)
														]
															.filter(Boolean)
															.join(' · ')}
													</p>
													<div className="flex flex-wrap gap-x-[0.85rem] gap-y-[0.35rem] mt-[0.4rem] text-muted text-[0.9rem]">
														{showsField(item.stats.activity_type, 'distance') && (
															<span>{item.stats.distance_km ?? '—'} km</span>
														)}
														<span>{metricText(item.stats)}</span>
														{item.stats.avg_hr != null ? (
															<span>
																HR {item.stats.avg_hr}
																{item.stats.max_hr != null && `/${item.stats.max_hr}`}
															</span>
														) : item.stats.time ? (
															<span>{item.stats.time}</span>
														) : null}
													</div>
													<BestEffortBadges
														compact
														highlights={groupHighlights(item.group, item.stats, boardOwners)}
													/>
												</Link>
											</div>
										</div>
									) : (
										<div
											key={item.run.slug}
											className="group grid grid-cols-[1.4rem_1fr] gap-[0.85rem] items-stretch animate-rise max-sm:grid-cols-[1rem_1fr] max-sm:gap-[0.65rem]"
											style={{ animationDelay: `${i * 35}ms` }}
										>
											<div
												className="relative flex justify-center before:content-[''] before:absolute before:top-0 before:-bottom-[0.35rem] before:w-0.5 before:bg-accent/22 group-last:before:bottom-1/2"
												aria-hidden="true"
											>
												{selecting && authed ? (
													<button
														type="button"
														className={cn(
															'relative z-[1] size-6 mt-4 rounded-md border border-line bg-surface text-[0.7rem] font-bold',
															picked.includes(item.run.slug) &&
																'bg-accent text-accent-ink border-accent'
														)}
														aria-pressed={picked.includes(item.run.slug)}
														aria-label={`Select ${item.run.date}`}
														onClick={() => togglePick(item.run.slug)}
													>
														{picked.includes(item.run.slug) ? '✓' : ''}
													</button>
												) : (
													<span className="relative z-[1] size-[0.7rem] mt-5 rounded-full bg-accent shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_12%,transparent)]"></span>
												)}
											</div>
											<div className="relative p-4 px-[1.1rem] border border-line rounded-[14px] bg-white/[0.02] transition-[border-color,background-color,transform] duration-150 group-hover:border-accent/35 group-hover:bg-accent/4 group-hover:-translate-y-px group-active:border-accent/35 group-active:bg-accent/4 group-active:-translate-y-px max-sm:p-[0.85rem_0.95rem]">
												<Link
													className="block text-inherit pr-[5.5rem]"
													to="/runs/$slug"
													params={{ slug: item.run.slug }}
												>
													<div className="flex flex-wrap items-center gap-x-2 gap-y-[0.35rem]">
														<strong className={ui.runTitle}>
															{item.run.date}
															{item.run.has_map && <MapPin />}
															{hasContext(item.run) && <FeelBadge />}
														</strong>
														<ActivityTag type={item.run.activity_type} />
													</div>
													{(item.run.day ||
														(item.run.session && item.run.session !== 'other') ||
														item.run.week != null ||
														item.run.start_time) && (
														<p className={cn(ui.muted, 'mt-[0.2rem] text-[0.82rem]')}>
															{[
																item.run.day || null,
																item.run.session && item.run.session !== 'other'
																	? item.run.session
																	: null,
																item.run.week != null ? `W${item.run.week}` : null,
																item.run.start_time || null
															]
																.filter(Boolean)
																.join(' · ')}
														</p>
													)}
													<div className="flex flex-wrap gap-x-[0.85rem] gap-y-[0.35rem] mt-[0.4rem] text-muted text-[0.9rem]">
														{showsField(item.run.activity_type, 'distance') && (
															<span>{item.run.distance_km ?? '—'} km</span>
														)}
														<span>{metricText(item.run)}</span>
														{item.run.avg_hr != null ? (
															<span>
																HR {item.run.avg_hr}
																{item.run.max_hr != null && `/${item.run.max_hr}`}
															</span>
														) : item.run.elev_gain != null &&
														  showsField(item.run.activity_type, 'elevation') ? (
															<span>↑ {item.run.elev_gain} m</span>
														) : item.run.time &&
														  normalizeActivityType(item.run.activity_type) !== 'strength' ? (
															<span>{item.run.time}</span>
														) : null}
													</div>
													<BestEffortBadges
														compact
														highlights={highlightsBySlug.get(item.run.slug) ?? []}
													/>
													{item.run.notes && (
														<p className={cn(ui.muted, 'mt-[0.35rem] line-clamp-1 overflow-hidden max-sm:mt-[0.28rem]')}>
															{item.run.notes}
														</p>
													)}
												</Link>
												<AuthGate>
													<div className="absolute top-[0.65rem] right-[0.65rem] z-[2] inline-flex items-center gap-1 m-0 opacity-100 sm:opacity-55 hover:opacity-100 group-hover:opacity-100">
														<EditButton
															label={`Edit ${activityLabel(item.run.activity_type).toLowerCase()} ${item.run.date}`}
															onClick={(e) => {
																e.preventDefault();
																e.stopPropagation();
																void router.navigate({
																	to: '/runs/$slug',
																	params: { slug: item.run.slug },
																	search: { edit: true }
																});
															}}
														/>
														<DeleteButton
															label={`Delete ${activityLabel(item.run.activity_type).toLowerCase()} ${item.run.date}`}
															onClick={(e) => {
																e.preventDefault();
																e.stopPropagation();
																setPending(item.run);
															}}
														/>
													</div>
												</AuthGate>
											</div>
										</div>
									)
								)}
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
