import { activityLabel } from '$lib/activity';
import { SignInPanel, useAuthed } from '$lib/auth';
import {
	canPinRaceResult,
	formatHorizonLabel,
	formatHorizonShort,
	formatMedalDistanceLine,
	goalUrlHref,
	isHorizonPast,
	isOlderPastRace,
	isUnpinnedPastRace
} from '$lib/goals';
import { daysUntil } from '$lib/plan';
import { clearGoal, getGoalsData } from '$lib/server/functions';
import { appHead } from '$lib/title';
import type { Goal } from '$lib/types';
import { cn } from '$lib/ui';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { DeferredData } from '../components/DeferredData';
import { GoalDialog } from '../components/GoalDialog';
import { Icon } from '../components/Icon';
import { MedalDialog } from '../components/MedalDialog';
import { PinRaceResult } from '../components/PinRaceResult';
import { RouteLine } from '../components/RouteLine';
import {
	Actions,
	ConfirmDialog,
	IconLabelButton,
	IconLabelLink,
	PageHero,
	PageTabs,
	Panel,
	SectionTitle,
	errorMessage,
	useSnackbar
} from '../components/ui';
import { buttonClass } from '../components/ui/Button';
import { panelClass } from '../components/ui/Panel';

type GoalsTab = 'races' | 'medals';
type GoalsSearch = { tab?: GoalsTab };

type OpenGoalDialog =
	| { variant: 'race'; mode: 'add' }
	| { variant: 'race'; mode: 'edit'; goal: Goal }
	| { variant: 'lookahead'; mode: 'add' }
	| { variant: 'lookahead'; mode: 'edit'; goal: Goal };

function parseTab(v: unknown): GoalsTab {
	return v === 'medals' ? 'medals' : 'races';
}

export const Route = createFileRoute('/goals')({
	validateSearch: (s: Record<string, unknown>): GoalsSearch => ({
		tab: parseTab(s.tab)
	}),
	loaderDeps: () => ({}),
	loader: () => ({ page: getGoalsData() }),
	head: () => appHead('Goals'),
	component: GoalsPage
});

type GoalsData = Awaited<ReturnType<typeof getGoalsData>>;

function formatRaceDate(iso: string) {
	const d = new Date(`${iso}T12:00:00`);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleDateString('en-GB', {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	});
}

function goalSummaryLine(
	goal: Pick<
		Goal,
		| 'date'
		| 'horizon'
		| 'distance_km'
		| 'sport'
		| 'time_goal'
		| 'bib_number'
		| 'wave'
		| 'start_time'
	>
) {
	const when = goal.date
		? formatRaceDate(goal.date)
		: goal.horizon
			? formatHorizonLabel(goal.horizon)
			: null;
	return [
		when,
		goal.date ? goal.start_time || null : null,
		`${goal.distance_km} km`,
		activityLabel(goal.sport),
		goal.time_goal ? `goal ${goal.time_goal}` : null,
		goal.date && goal.wave ? `wave ${goal.wave}` : null,
		goal.date && goal.bib_number ? `bib ${goal.bib_number}` : null
	]
		.filter(Boolean)
		.join(' · ');
}

function GoalUrlLinks({ url, itineraryUrl }: { url?: string; itineraryUrl?: string }) {
	const raceHref = goalUrlHref(url ?? '');
	const itineraryHref = goalUrlHref(itineraryUrl ?? '');
	if (!raceHref && !itineraryHref) return null;
	return (
		<div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
			{raceHref && (
				<a
					className="inline-flex items-center gap-1.5 text-accent-fg font-semibold text-[0.9rem]"
					href={raceHref}
					target="_blank"
					rel="noopener noreferrer"
				>
					<Icon name="external" size={13} />
					Race page
				</a>
			)}
			{itineraryHref && (
				<a
					className="inline-flex items-center gap-1.5 text-accent-fg font-semibold text-[0.9rem]"
					href={itineraryHref}
					target="_blank"
					rel="noopener noreferrer"
				>
					<Icon name="external" size={13} />
					Itinerary
				</a>
			)}
		</div>
	);
}

function GoalsPage() {
	const { page } = Route.useLoaderData();
	const search = Route.useSearch();
	const router = useRouter();
	const authed = useAuthed();
	const tab = parseTab(search.tab);

	function setTab(next: GoalsTab) {
		router.navigate({
			to: '/goals',
			search: { tab: next },
			replace: true,
			resetScroll: false
		});
	}

	return (
		<>
			<PageTabs
				aria-label="Goals"
				value={tab}
				onChange={setTab}
				options={[
					{
						value: 'races',
						label: (
							<>
								<Icon name="flag" size={15} />
								Races
							</>
						)
					},
					{
						value: 'medals',
						label: (
							<>
								<Icon name="trophy" size={15} />
								Medals
							</>
						)
					}
				]}
			/>

			<PageHero
				variant="quiet"
				kicker={tab === 'medals' ? 'On the wall' : 'Race on the calendar'}
				title="Goals"
			/>

			{!authed ? <SignInPanel title="Sign in to set races and medals" /> : null}

			<DeferredData promise={page}>
				{(data) => <GoalsBody data={data} authed={authed} tab={tab} />}
			</DeferredData>
		</>
	);
}

function GoalsBody({ data, authed, tab }: { data: GoalsData; authed: boolean; tab: GoalsTab }) {
	const router = useRouter();
	const snack = useSnackbar();
	const [openDialog, setOpenDialog] = useState<OpenGoalDialog | null>(null);
	const [pendingRemove, setPendingRemove] = useState<{
		id: string;
		name: string;
		isActive: boolean;
		isIntention?: boolean;
	} | null>(null);
	const [openMedal, setOpenMedal] = useState<Goal | null>(null);
	const [showOlder, setShowOlder] = useState(false);
	const nextAfterClear = pendingRemove?.isActive ? data.upcoming[0] : undefined;
	const pastOpen = data.upcoming
		.filter((g) => isUnpinnedPastRace(g))
		.slice()
		.sort((a, b) => b.date.localeCompare(a.date));
	const olderPast = data.upcoming
		.filter((g) => isOlderPastRace(g))
		.slice()
		.sort((a, b) => b.date.localeCompare(a.date));
	const later = data.upcoming.filter((g) => {
		const days = daysUntil(g.date);
		return days == null || days >= 0;
	});
	const editingOlderGoal =
		openDialog?.mode === 'edit' &&
		openDialog.goal &&
		olderPast.some((g) => g.id === openDialog.goal.id)
			? openDialog.goal
			: null;
	const olderVisible = olderPast.length > 0 && (showOlder || editingOlderGoal != null);

	function closeDialog() {
		setOpenDialog(null);
	}

	async function onDialogSaved() {
		closeDialog();
		await router.invalidate();
	}

	function toggleOlder() {
		if (olderVisible) {
			setShowOlder(false);
			if (editingOlderGoal) closeDialog();
		} else {
			setShowOlder(true);
		}
	}

	function pastCard(g: Goal) {
		return (
			<UpcomingGoalCard
				key={g.id}
				goal={g}
				candidates={data.candidatesByGoalId[g.id] ?? []}
				authed={authed}
				onEdit={() => setOpenDialog({ variant: 'race', mode: 'edit', goal: g })}
				onRemove={() => setPendingRemove({ id: g.id, name: g.name, isActive: false })}
			/>
		);
	}

	return (
		<>
			{tab === 'races' && (
				<>
					{data.activeGoal ? (
						<ActiveGoalCard
							goal={data.activeGoal}
							weekCount={data.calendar.weekCount}
							candidates={data.candidatesByGoalId[data.activeGoal.id] ?? []}
							authed={authed}
							onEdit={() =>
								setOpenDialog({ variant: 'race', mode: 'edit', goal: data.activeGoal! })
							}
							onClear={() =>
								setPendingRemove({
									id: data.activeGoal!.id,
									name: data.activeGoal!.name,
									isActive: true
								})
							}
						/>
					) : (
						<Panel className="mb-6">
							<p className={cn('text-muted', 'mt-0')}>
								No race on the calendar. Coach still plans this week as base training
								{data.intentions.length
									? `, with ${data.intentions.length === 1 ? 'a look-ahead' : 'look-aheads'} below.`
									: '.'}
							</p>
							{authed && (
								<Actions className="justify-start!">
									<button
										className={buttonClass()}
										type="button"
										onClick={() => setOpenDialog({ variant: 'race', mode: 'add' })}
									>
										<Icon name="flag" size={16} />
										Set a race
									</button>
									<IconLabelButton
										label="Look-ahead"
										size="default"
										icon={<Icon name="calendar" size={16} />}
										onClick={() => setOpenDialog({ variant: 'lookahead', mode: 'add' })}
									/>
								</Actions>
							)}
						</Panel>
					)}

					{authed && (pastOpen.length > 0 || olderVisible) && (
						<>
							<SectionTitle>
								<div>
									<h2>Unpinned</h2>
									<p>
										{pastOpen.length
											? pastOpen.length === 1
												? 'This race already happened. Pin the activity this week to put it on the medal wall.'
												: `${pastOpen.length} races already happened. Pin each activity this week to put them on the medal wall.`
											: olderPast.length === 1
												? 'This race already happened. Pin the activity to put it on the medal wall.'
												: `${olderPast.length} races already happened. Pin each activity to put them on the medal wall.`}
									</p>
								</div>
							</SectionTitle>
							{pastOpen.map(pastCard)}
							{olderVisible && olderPast.map(pastCard)}
						</>
					)}

					{authed && (data.activeGoal || later.length > 0) && (
						<>
							<SectionTitle>
								<div>
									<h2>Up next</h2>
									<p>
										{later.length ? (
											<>
												{`${later.length} later race${later.length === 1 ? '' : 's'}`}
												{olderPast.length > 0 && (
													<>
														{' · '}
														<button
															type="button"
															className="appearance-none bg-transparent border-0 p-0 m-0 text-accent-fg font-semibold font-inherit cursor-pointer hover:underline underline-offset-2"
															aria-expanded={olderVisible}
															onClick={toggleOlder}
														>
															{olderVisible
																? 'Hide older'
																: olderPast.length === 1
																	? '1 older race'
																	: `${olderPast.length} older races`}
														</button>
													</>
												)}
												{' — the soonest date becomes active when this one is done.'}
											</>
										) : olderPast.length > 0 ? (
											<>
												<button
													type="button"
													className="appearance-none bg-transparent border-0 p-0 m-0 text-accent-fg font-semibold font-inherit cursor-pointer hover:underline underline-offset-2"
													aria-expanded={olderVisible}
													onClick={toggleOlder}
												>
													{olderVisible
														? 'Hide older'
														: olderPast.length === 1
															? '1 older race'
															: `${olderPast.length} older races`}
												</button>
												{' — already run.'}
											</>
										) : (
											'Add the races after this one. Closest date stays active.'
										)}
									</p>
								</div>
								{authed && data.activeGoal && (
									<IconLabelButton
										label="Add race"
										variant="primary"
										size="default"
										icon={<Icon name="plus" size={16} />}
										onClick={() => setOpenDialog({ variant: 'race', mode: 'add' })}
									/>
								)}
							</SectionTitle>
							{later.map((g) => (
								<UpcomingGoalCard
									key={g.id}
									goal={g}
									candidates={data.candidatesByGoalId[g.id] ?? []}
									authed={authed}
									onEdit={() => setOpenDialog({ variant: 'race', mode: 'edit', goal: g })}
									onRemove={() => setPendingRemove({ id: g.id, name: g.name, isActive: false })}
								/>
							))}
						</>
					)}

					{(data.intentions.length > 0 || (authed && data.activeGoal)) && (
						<>
							<SectionTitle>
								<div>
									<h2>Look-ahead</h2>
									<p>
										{data.intentions.length
											? 'No race picked yet — month only. Coach sees these when planning. They never set race day or plan length. Fill in a date when you book one.'
											: 'Want a half in April but no race yet? Save the distance and month so planning can look ahead.'}
									</p>
								</div>
								{authed && (
									<IconLabelButton
										label="Add look-ahead"
										variant="primary"
										size="default"
										icon={<Icon name="plus" size={16} />}
										onClick={() => setOpenDialog({ variant: 'lookahead', mode: 'add' })}
									/>
								)}
							</SectionTitle>
							{data.intentions.map((g) => (
								<IntentionGoalCard
									key={g.id}
									goal={g}
									authed={authed}
									onEdit={() => setOpenDialog({ variant: 'lookahead', mode: 'edit', goal: g })}
									onRemove={() =>
										setPendingRemove({
											id: g.id,
											name: g.name,
											isActive: false,
											isIntention: true
										})
									}
								/>
							))}
						</>
					)}
				</>
			)}

			{tab === 'medals' && (
				<>
					{data.medals.length ? (
						<div className="grid gap-3 min-[640px]:grid-cols-2">
							{data.medals.map((g) => {
								const track = data.medalTracks[g.id];
								return (
									<button
										key={g.id}
										type="button"
										className={panelClass(
											'text-left cursor-pointer transition-[border-color,transform] duration-150 hover:border-accent/40 hover:-translate-y-px flex items-stretch justify-between gap-3'
										)}
										onClick={() => setOpenMedal(g)}
									>
										<div className="min-w-0 flex-1">
											<p className="m-0 inline-flex items-center gap-1.5 text-accent-fg font-bold text-[0.72rem] tracking-[0.08em] uppercase">
												<Icon name="trophy" size={14} />
												Medal
											</p>
											<h3 className="font-display text-[1.35rem] tracking-[-0.03em] m-0 mt-1">
												{g.name}
											</h3>
											<p className="font-display font-bold text-[2.1rem] tracking-[-0.04em] text-accent-fg m-0 mt-2 leading-none">
												{g.result?.time || '—'}
											</p>
											<p className={cn('text-muted', 'm-0 mt-2')}>
												{formatRaceDate(g.date)}
												{` · ${formatMedalDistanceLine(g, g.result)}`}
												{g.result?.pace ? ` · ${g.result.pace}/km` : ''}
											</p>
										</div>
										{track && (
											<RouteLine coords={track} className="shrink-0 self-center text-accent/35" />
										)}
									</button>
								);
							})}
						</div>
					) : (
						<Panel>
							<p className={cn('text-muted', 'm-0')}>
								Nothing on the wall yet. Pin a result after you run the race.
							</p>
						</Panel>
					)}
				</>
			)}

			<GoalDialog
				open={openDialog != null}
				variant={openDialog?.variant ?? 'race'}
				mode={openDialog?.mode ?? 'add'}
				initial={openDialog?.mode === 'edit' ? openDialog.goal : null}
				hasActiveGoal={data.activeGoal != null}
				isActiveGoal={openDialog?.mode === 'edit' && openDialog.goal.id === data.activeGoal?.id}
				onClose={closeDialog}
				onSaved={onDialogSaved}
			/>

			<MedalDialog
				open={openMedal != null}
				goal={openMedal}
				track={openMedal ? data.medalTracks[openMedal.id] : undefined}
				activity={openMedal ? data.medalActivities[openMedal.id] : undefined}
				candidates={openMedal ? (data.candidatesByGoalId[openMedal.id] ?? []) : []}
				authed={authed}
				onEditRace={
					authed && openMedal
						? () => {
								setOpenDialog({ variant: 'race', mode: 'edit', goal: openMedal });
								setOpenMedal(null);
							}
						: undefined
				}
				onClose={() => setOpenMedal(null)}
				onSaved={() => router.invalidate()}
			/>

			<ConfirmDialog
				open={pendingRemove != null}
				title={
					pendingRemove?.isActive
						? 'Clear this goal?'
						: `Remove ${pendingRemove?.name ?? (pendingRemove?.isIntention ? 'this look-ahead' : 'this race')}?`
				}
				description={
					pendingRemove?.isActive
						? nextAfterClear
							? `The race leaves the calendar and this week’s plan resets. ${nextAfterClear.name} becomes the training target.`
							: 'The race leaves the calendar. This week’s plan resets. Medals stay.'
						: pendingRemove?.isIntention
							? 'This look-ahead leaves the list. The current plan and active goal stay put.'
							: 'This race leaves the calendar. The current plan and active goal stay put.'
				}
				confirmLabel={
					pendingRemove?.isActive
						? 'Clear goal'
						: pendingRemove?.isIntention
							? 'Remove look-ahead'
							: 'Remove race'
				}
				onClose={() => setPendingRemove(null)}
				onConfirm={async () => {
					if (!pendingRemove) return;
					try {
						await clearGoal({ data: pendingRemove.id });
						setPendingRemove(null);
						closeDialog();
						if (pendingRemove.isActive) {
							snack.success(
								nextAfterClear
									? `Cleared — ${nextAfterClear.name} is now the training target.`
									: 'Goal cleared — Coach will plan base weeks.'
							);
						} else {
							snack.success(`${pendingRemove.name} removed from the calendar.`);
						}
						await router.invalidate();
					} catch (e) {
						snack.error(errorMessage(e, 'Could not remove that race.'));
					}
				}}
			/>
		</>
	);
}

function ActiveGoalCard({
	goal,
	weekCount,
	candidates,
	authed,
	onEdit,
	onClear
}: {
	goal: Goal;
	weekCount: number;
	candidates: GoalsData['candidatesByGoalId'][string];
	authed: boolean;
	onEdit: () => void;
	onClear: () => void;
}) {
	const days = daysUntil(goal.date);
	return (
		<Panel className="mb-6 grid gap-4">
			<div>
				<p className="m-0 inline-flex items-center gap-1.5 text-accent-fg font-bold text-[0.72rem] tracking-[0.08em] uppercase">
					<Icon name="flag" size={14} />
					Active
				</p>
				<h2 className="font-display text-[1.7rem] tracking-[-0.03em] m-0 mt-1">{goal.name}</h2>
				<p className={cn('text-muted', 'm-0 mt-1')}>{goalSummaryLine(goal)}</p>
				<GoalUrlLinks url={goal.url} itineraryUrl={goal.itinerary_url} />
			</div>
			<div className="flex flex-wrap gap-6">
				<div>
					<span className={cn('block text-[0.78rem]', 'text-muted')}>
						{days == null
							? 'Race day'
							: days > 0
								? 'Days to go'
								: days === 0
									? 'Race day'
									: 'Days since'}
					</span>
					<strong className="font-display text-[2.1rem] tracking-[-0.04em] text-accent-fg leading-none">
						{days == null ? '—' : days === 0 ? 'Today' : Math.abs(days)}
					</strong>
				</div>
				<div>
					<span className={cn('block text-[0.78rem]', 'text-muted')}>Plan</span>
					<strong className="font-display text-[1.35rem] tracking-[-0.03em]">
						{weekCount} week{weekCount === 1 ? '' : 's'}
					</strong>
					<p className={cn('text-muted', 'm-0 mt-1 text-[0.85rem]')}>
						Monday {goal.plan_start} through race week
					</p>
				</div>
			</div>
			{goal.primary.length > 0 && (
				<ul className="m-0 pl-[1.1rem]">
					{goal.primary.map((p) => (
						<li key={p}>{p}</li>
					))}
				</ul>
			)}
			{goal.notes ? (
				<p className={cn('text-muted', 'm-0 whitespace-pre-wrap')}>{goal.notes}</p>
			) : null}
			{authed && (
				<Actions className="justify-start!">
					<IconLabelButton
						label="Edit"
						size="default"
						icon={<Icon name="pencil" size={16} />}
						onClick={onEdit}
					/>
					<button className={buttonClass({ variant: 'danger' })} type="button" onClick={onClear}>
						Clear
					</button>
					<Link
						className={buttonClass({ variant: 'ghost', size: 'default' })}
						to="/coach"
						search={{ tab: 'plan' }}
						aria-label="Plan"
						title="Plan"
					>
						<Icon name="board" size={16} />
						<span className="max-sm:hidden">Plan</span>
					</Link>
				</Actions>
			)}
			{authed && canPinRaceResult(goal) && <PinRaceResult goal={goal} candidates={candidates} />}
		</Panel>
	);
}

function UpcomingGoalCard({
	goal,
	candidates,
	authed,
	onEdit,
	onRemove
}: {
	goal: Goal;
	candidates: GoalsData['candidatesByGoalId'][string];
	authed: boolean;
	onEdit: () => void;
	onRemove: () => void;
}) {
	const days = daysUntil(goal.date);
	const past = days != null && days < 0;
	return (
		<Panel className="mb-3 grid gap-3">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<p className="m-0 inline-flex items-center gap-1.5 text-muted font-bold text-[0.72rem] tracking-[0.08em] uppercase">
						<Icon name="calendar" size={14} />
						{past ? 'Past' : 'Upcoming'}
					</p>
					<h3 className="font-display text-[1.35rem] tracking-[-0.03em] m-0 mt-1">{goal.name}</h3>
					<p className={cn('text-muted', 'm-0 mt-1')}>{goalSummaryLine(goal)}</p>
					<GoalUrlLinks url={goal.url} itineraryUrl={goal.itinerary_url} />
				</div>
				<div className="text-right">
					<span className={cn('block text-[0.78rem]', 'text-muted')}>
						{days == null
							? 'Race day'
							: days > 0
								? 'Days to go'
								: days === 0
									? 'Race day'
									: 'Days since'}
					</span>
					<strong className="font-display text-[1.7rem] tracking-[-0.04em] leading-none">
						{days == null ? '—' : days === 0 ? 'Today' : Math.abs(days)}
					</strong>
				</div>
			</div>
			{authed && (
				<Actions className="justify-start!">
					<IconLabelButton
						label="Edit"
						size="default"
						icon={<Icon name="pencil" size={16} />}
						onClick={onEdit}
					/>
					<button className={buttonClass({ variant: 'danger' })} type="button" onClick={onRemove}>
						Remove
					</button>
				</Actions>
			)}
			{authed && canPinRaceResult(goal) && <PinRaceResult goal={goal} candidates={candidates} />}
		</Panel>
	);
}

function IntentionGoalCard({
	goal,
	authed,
	onEdit,
	onRemove
}: {
	goal: Goal;
	authed: boolean;
	onEdit: () => void;
	onRemove: () => void;
}) {
	const past = isHorizonPast(goal.horizon);
	return (
		<Panel className="mb-3 grid gap-3">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<p className="m-0 inline-flex items-center gap-1.5 text-muted font-bold text-[0.72rem] tracking-[0.08em] uppercase">
						<Icon name="calendar" size={14} />
						{past ? 'Window passed' : 'Look-ahead'}
					</p>
					<h3 className="font-display text-[1.35rem] tracking-[-0.03em] m-0 mt-1">{goal.name}</h3>
					<p className={cn('text-muted', 'm-0 mt-1')}>{goalSummaryLine(goal)}</p>
					<GoalUrlLinks url={goal.url} itineraryUrl={goal.itinerary_url} />
				</div>
				<div className="text-right">
					<span className={cn('block text-[0.78rem]', 'text-muted')}>Month</span>
					<strong className="font-display text-[1.7rem] tracking-[-0.04em] leading-none">
						{formatHorizonShort(goal.horizon)}
					</strong>
				</div>
			</div>
			{authed && (
				<Actions className="justify-start!">
					<IconLabelButton
						label="Edit"
						size="default"
						icon={<Icon name="pencil" size={16} />}
						onClick={onEdit}
					/>
					<button className={buttonClass({ variant: 'danger' })} type="button" onClick={onRemove}>
						Remove
					</button>
				</Actions>
			)}
		</Panel>
	);
}
