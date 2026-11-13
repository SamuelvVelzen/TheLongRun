import { emptyActivityHabits } from '$lib/activity-habits';
import { SignInPanel, useAuthed } from '$lib/auth';
import { dateRangeFromSearch, type RangeKind } from '$lib/date-range';
import { composeDebriefPrompt, debriefWriteupUnitsFromCoach } from '$lib/debrief';
import {
	readGenerateDraft,
	scheduleWriteGenerateDraft,
	type GenerateDraft
} from '$lib/generate-draft';
import {
	clearDebriefHabits,
	readDebriefHabits,
	seedDebriefHabits,
	setDebriefHabitField
} from '$lib/debrief-habits';
import {
	clearDebriefWriteups,
	readDebriefWriteups,
	writeDebriefWriteups
} from '$lib/debrief-writeups';
import type { BodySuggestion } from '$lib/body-notes';
import type { FuelEntry } from '$lib/fuel';
import type { GearContext, GearKind, GearWear } from '$lib/gear';
import { formatHorizonShort } from '$lib/goals';
import {
	formatAllWeeksClipboard,
	formatWeekPlanClipboard,
	isoDateLocal,
	planWeekDateRange,
	planWeekDateRangeShort
} from '$lib/plan';
import {
	createActivityGroupFn,
	getCoachBrief,
	getCoachPlan,
	getDebriefPrompt,
	getWeekPattern,
	saveActivityFeel,
	saveDebrief,
	savePlanWeeks,
	saveWeekPattern,
	ungroupActivitiesFn
} from '$lib/server/functions';
import { appHead } from '$lib/title';
import { cn } from '$lib/ui';
import type { ActivityType } from '$lib/activity';
import {
	formatWeekSetupProse,
	weekSetupsEqual,
	weekSetupChangeLines,
	type DayLimit,
	type WeekSetup
} from '$lib/week-mix';
import { createFileRoute, Link, useRouter, getRouteApi  } from '@tanstack/react-router';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DateRangeFilter, type RangeSearch } from '../DateRangeFilter';
import { DebriefActivityTitle } from '../DebriefActivityTitle';
import { DebriefFeelForm, type DebriefDraftClearPick } from '../DebriefFeelForm';
import { DebriefRacePanel } from '../DebriefRacePanel';
import { AiPromptFlow } from '../AiPromptFlow';
import { DeferredData } from '../DeferredData';
import { BodySuggestionsDialog } from '../BodySuggestionsDialog';
import { FuelSuggestionsDialog } from '../FuelSuggestionsDialog';
import { GpxImport } from '../GpxImport';
import { Icon } from '../Icon';
import { JsonPasteForm } from '../JsonPasteForm';
import {
	Actions,
	Button,
	Checkbox,
	ConfirmDialog,
	Field,
	Form,
	IconLabelButton,
	PageSection,
	Panel,
	TabbedPageHeader,
	PanelTitle,
	StatusPill,
	Select,
	Textarea,
	errorMessage,
	useLeaveGuard,
	useSnackbar
} from '../ui';
import { buttonClass } from '../ui/Button';
import {
	rowsFrom,
	toPattern,
	WeekPatternEditor,
	type SlotRow
} from '../WeekPatternEditor';
import { WeekPlanBoard } from '../WeekPlanBoard';
import {
	type CoachTab,
	withCoachSearch
} from '$lib/coach/search';

import { parseCoachDebriefData } from '$lib/coach/debrief-data';
import { parseCoachPlanData } from '$lib/coach/plan-data';
import {
	coachDebriefUnits,
	defaultCoachTab,
	defaultQuestion,
	DEFAULT_BRIEF_RANGE,
	type CoachDebriefUnit,
	type CoachPlanData,
	type DebriefPrompt,
	visibleTab,
	weekTag
} from './coach-utils';
import { PlanWeekPanel } from './PlanWeekPanel';
import { GenerateBriefForm } from './GenerateBriefForm';
const coachRoute = getRouteApi('/coach');

export function CoachPanels({
	debrief: initialDebrief,
	initialSetup,
	planData,
	gear,
	gearWear
}: {
	debrief: DebriefPrompt;
	initialSetup: WeekSetup;
	planData: CoachPlanData;
	gear: GearContext;
	gearWear: Record<GearKind, Record<string, GearWear>>;
}) {
	const plan = parseCoachPlanData(planData);
	const search = coachRoute.useSearch();
	const router = useRouter();
	const snack = useSnackbar();
	const range = dateRangeFromSearch(
		search.range || search.from || search.to ? search : { range: DEFAULT_BRIEF_RANGE }
	);
	const authed = useAuthed();
	const tab = visibleTab(search.tab ?? defaultCoachTab(plan), authed);
	const debriefIds = search.id ?? '';
	const includePlan = search.includePlan === true;

	function setTab(next: CoachTab) {
		router.navigate({
			to: '/coach',
			search: withCoachSearch(search, {
				tab: next,
				id: next === 'debrief' ? search.id : ''
			}),
			replace: true,
			resetScroll: false
		});
	}

	useEffect(() => {
		if (search.tab !== undefined) return;
		router.navigate({
			to: '/coach',
			search: withCoachSearch(search, { tab: defaultCoachTab(plan) }),
			replace: true,
			resetScroll: false
		});
	}, [search.tab, plan.views.length, router, search, plan]);

	const [generateDraft, setGenerateDraft] = useState(readGenerateDraft);

	useLayoutEffect(() => {
		setGenerateDraft(readGenerateDraft());
	}, []);

	function patchGenerateDraft(partial: Partial<GenerateDraft>) {
		setGenerateDraft((prev) => {
			const next = { ...prev, ...partial };
			scheduleWriteGenerateDraft(next);
			return next;
		});
	}

	function patchGenerateText(partial: Partial<Pick<GenerateDraft, 'mixNote' | 'question'>>) {
		setGenerateDraft((prev) => {
			const next = { ...prev, ...partial, brief: '' };
			scheduleWriteGenerateDraft(next);
			return next;
		});
	}

	const [debrief, setDebrief] = useState(() => parseCoachDebriefData(initialDebrief));
	const [writeups, setWriteups] = useState(readDebriefWriteups);
	const [habitDrafts, setHabitDrafts] = useState(readDebriefHabits);
	const [debriefPrompt, setDebriefPrompt] = useState(() =>
		composeDebriefPrompt(
			initialDebrief.prompt,
			debriefWriteupUnitsFromCoach(initialDebrief),
			{},
			{},
			initialDebrief.habits ?? emptyActivityHabits()
		)
	);
	const [fuelSuggestions, setFuelSuggestions] = useState<FuelEntry[]>([]);
	const [bodySuggestions, setBodySuggestions] = useState<BodySuggestion[]>([]);
	const [bodySuggestionsQueued, setBodySuggestionsQueued] = useState<BodySuggestion[]>([]);

	const [usual, setUsual] = useState<SlotRow[]>(() => rowsFrom(initialSetup.pattern));
	const [dayLimits, setDayLimits] = useState<DayLimit[]>(initialSetup.dayLimits);
	const [plannedSports, setPlannedSports] = useState<ActivityType[]>(initialSetup.plannedSports);
	const [savedSetup, setSavedSetup] = useState<WeekSetup>(initialSetup);
	const [mixBusy, setMixBusy] = useState(false);
	const mixBusyRef = useRef(false);
	const [saveSetupOpen, setSaveSetupOpen] = useState(false);
	const [briefBusy, setBriefBusy] = useState(false);
	const briefGenRef = useRef({ structureKey: '', inFlight: false });

	// Fresh loader data (e.g. after save) replaces the debrief prompt.
	useEffect(() => {
		setDebrief(parseCoachDebriefData(initialDebrief));
	}, [initialDebrief]);

	// Soft id updates (e.g. after GPX import) refresh the prompt without remounting the page.
	const debriefIdsHydrated = useRef<string | null>(null);
	useEffect(() => {
		const key = `${debriefIds}|${includePlan ? '1' : '0'}`;
		if (debriefIdsHydrated.current === null) {
			debriefIdsHydrated.current = key;
			return;
		}
		if (debriefIdsHydrated.current === key) return;
		debriefIdsHydrated.current = key;
		let cancelled = false;
		getDebriefPrompt({ data: { id: debriefIds, includePlan } }).then((next) => {
			if (cancelled) return;
			setDebrief(parseCoachDebriefData(next));
		});
		return () => {
			cancelled = true;
		};
	}, [debriefIds, includePlan]);

	const coachUnits = coachDebriefUnits(debrief);
	const writeupUnits = coachUnits.map((u) => ({ slug: u.slug, members: u.members }));

	useEffect(() => {
		const habits = debrief.habits ?? emptyActivityHabits();
		const seeds = writeupUnits.map((u) => {
			const lead = u.members[0]!;
			return {
				slug: u.slug,
				activity_type: lead.activity_type,
				before_notes: lead.before_notes,
				after_notes: lead.after_notes
			};
		});
		setHabitDrafts((prev) => seedDebriefHabits(seeds, habits, prev));
	}, [debrief, writeupUnits]);

	useEffect(() => {
		setDebriefPrompt(
			composeDebriefPrompt(
				debrief.prompt,
				writeupUnits,
				writeups,
				habitDrafts,
				debrief.habits ?? emptyActivityHabits()
			)
		);
	}, [debrief, writeupUnits, writeups, habitDrafts]);

	const sessionCount = writeupUnits.length;
	const many = sessionCount > 1;
	const allWrote =
		sessionCount > 0 && writeupUnits.every((u) => (writeups[u.slug] ?? '').trim() !== '');
	const ungroupedIds = coachUnits
		.filter((u) => u.kind === 'single')
		.flatMap((u) => u.members.map((m) => m.id));
	const canGroupDebrief = ungroupedIds.length >= 2;

	function setWriteup(slugKey: string, text: string) {
		setWriteups((prev) => {
			const next = { ...prev };
			if (text) next[slugKey] = text;
			else delete next[slugKey];
			writeDebriefWriteups(next);
			return next;
		});
	}

	function setHabit(slugKey: string, field: 'before' | 'after', text: string) {
		setHabitDrafts((prev) => setDebriefHabitField(slugKey, field, text, prev));
	}

	function clearDebriefDraft(slugKey: string, pick: DebriefDraftClearPick) {
		if (pick.writeup) {
			setWriteups((prev) => clearDebriefWriteups([slugKey], prev));
		}
		if (pick.before || pick.after) {
			setHabitDrafts((prev) => {
				let next = prev;
				if (pick.before) next = setDebriefHabitField(slugKey, 'before', '', next);
				if (pick.after) next = setDebriefHabitField(slugKey, 'after', '', next);
				const pair = next[slugKey];
				if (pair && !pair.before.trim() && !pair.after.trim()) {
					next = clearDebriefHabits([slugKey], next);
				}
				return next;
			});
		}
	}

	async function groupDebriefSessions() {
		if (!canGroupDebrief) return;
		try {
			await createActivityGroupFn({ data: { ids: ungroupedIds } });
			await refreshDebrief();
			snack.success('Grouped as one session in the debrief.');
		} catch (e) {
			snack.error(errorMessage(e, 'Could not group those activities.'));
		}
	}

	async function ungroupDebriefSession(groupId: string) {
		try {
			await ungroupActivitiesFn({ data: groupId });
			await refreshDebrief();
			snack.success('Sessions ungrouped.');
		} catch (e) {
			snack.error(errorMessage(e, 'Could not ungroup.'));
		}
	}

	async function refreshDebrief() {
		const next = await getDebriefPrompt({ data: { id: debriefIds, includePlan } });
		setDebrief(parseCoachDebriefData(next));
		const nextRuns = next.runs?.length ? next.runs : next.run ? [next.run] : [];
		const nextIds = nextRuns.map((r) => String(r.id)).join(',');
		if (nextIds !== debriefIds) {
			router.navigate({
				to: '/coach',
				search: withCoachSearch(search, {
					tab: 'debrief',
					id: nextIds || undefined,
					slug: ''
				}),
				replace: true,
				resetScroll: false
			});
		}
		await router.invalidate();
	}

	function setIncludePlan(next: boolean) {
		router.navigate({
			to: '/coach',
			search: withCoachSearch(search, { tab: 'debrief', includePlan: next }),
			replace: true,
			resetScroll: false
		});
	}
	const planningNext = plan.generateWeek > plan.currentWeek;
	const weekPhrase = planningNext ? 'next week' : 'this week';
	const weekPhraseCap = planningNext ? 'Next week' : 'This week';
	const defaultQ = defaultQuestion(planningNext);
	const setup: WeekSetup = { pattern: toPattern(usual), dayLimits, plannedSports };
	const mixDirty = !weekSetupsEqual(setup, savedSetup);
	const setupChangeLines = mixDirty ? weekSetupChangeLines(savedSetup, setup) : [];
	const briefStructureKey = useMemo(
		() =>
			JSON.stringify({
				range: range.kind,
				from: range.from,
				to: range.to,
				planningNext,
				pattern: toPattern(usual),
				dayLimits,
				plannedSports
			}),
		[range.kind, range.from, range.to, planningNext, usual, dayLimits, plannedSports]
	);

	// Leaving /coach with a dirty week setup loses the unsaved mix — confirm first.
	// Coach tabs are sequential steps; switching tabs keeps this tree mounted so the
	// draft mix survives — only navigating away from Coach should prompt.
	const { guard: leaveGuard } = useLeaveGuard({
		dirty: authed && mixDirty,
		title: 'Unsaved week setup',
		description: 'Your week setup is unsaved — leaving Coach will lose it.'
	});

	function applySetup(next: WeekSetup) {
		setUsual(rowsFrom(next.pattern));
		setDayLimits(next.dayLimits);
		setPlannedSports(next.plannedSports);
	}

	async function generateBrief(mixNote: string, question: string) {
		try {
			const next = await getCoachBrief({
				data: {
					range: range.kind,
					from: range.from,
					to: range.to,
					setup,
					defaultSetup: savedSetup,
					note: mixNote
				}
			});
			patchGenerateDraft({
				brief: `${next}\n## My question\n${question.trim() || defaultQ}\n`
			});
		} catch (e) {
			snack.error(errorMessage(e, 'Could not build the prompt.'));
		}
	}

	async function rebuildBrief() {
		if (!authed || tab !== 'generate' || briefGenRef.current.inFlight) return;
		briefGenRef.current.inFlight = true;
		setBriefBusy(true);
		patchGenerateDraft({ brief: '' });
		try {
			const question = generateDraft.question ?? defaultQ;
			await generateBrief(generateDraft.mixNote, question);
		} finally {
			briefGenRef.current.structureKey = briefStructureKey;
			briefGenRef.current.inFlight = false;
			setBriefBusy(false);
		}
	}

	useEffect(() => {
		if (tab !== 'generate' || !authed) return;
		if (briefGenRef.current.structureKey === briefStructureKey) return;
		void rebuildBrief();
		// eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild when structure inputs change, not every draft keystroke
	}, [tab, authed, briefStructureKey]);

	function onGenerateFieldsBlur() {
		if (tab !== 'generate' || !authed) return;
		void rebuildBrief();
	}

	async function saveDefaultMix() {
		if (mixBusyRef.current) return;
		mixBusyRef.current = true;
		setMixBusy(true);
		try {
			const saved = await saveWeekPattern({ data: setup });
			setSavedSetup(saved);
			applySetup(saved);
			snack.success('Saved as your default week.');
			router.invalidate();
		} catch (e) {
			snack.error(errorMessage(e, 'Could not save the default week.'));
		} finally {
			mixBusyRef.current = false;
			setMixBusy(false);
		}
	}

	function download() {
		const date = new Date().toISOString().slice(0, 10);
		const blob = new Blob([generateDraft.brief], { type: 'text/markdown;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `the-long-run-context-${date}.md`;
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
	}

	return (
		<>
			<TabbedPageHeader
				kicker="This week"
				title="Coach"
				tabs={{
					'aria-label': 'Coach',
					value: tab,
					onChange: setTab,
					options: [
						{
							value: 'training' as const,
							label: (
								<>
									<Icon name="calendar" size={15} />
									Training
								</>
							)
						},
						...(authed
							? [
									{
										value: 'generate' as const,
										label: (
											<>
												<Icon name="sparkle" size={15} />
												Generate
											</>
										)
									}
								]
							: []),
						{
							value: 'plan' as const,
							label: (
								<>
									<Icon name="board" size={15} />
									Plan
								</>
							)
						},
						...(authed
							? [
									{
										value: 'debrief' as const,
										label: (
											<>
												<Icon name="flag" size={15} />
												<span className="max-sm:hidden">After an activity</span>
												<span className="hidden max-sm:inline">Activity</span>
											</>
										)
									}
								]
							: [])
					]
				}}
			/>

			{tab === 'training' && (
				<>
					{!authed ? (
						<SignInPanel
							title="Sign in to edit your default week"
							body="You can still view the pattern below."
						/>
					) : null}
					<PageSection title="Default week" form>
						{authed ? (
							<p className={cn('text-muted', 'm-0 text-[0.88rem] leading-relaxed')}>
								<span className="font-semibold text-fg">Saved · </span>
								{formatWeekSetupProse(savedSetup)}
							</p>
						) : null}
						<div className={authed ? 'mt-4' : undefined}>
							<WeekPatternEditor
								rows={usual}
								onChange={setUsual}
								dayLimits={dayLimits}
								onDayLimitsChange={setDayLimits}
								plannedSports={plannedSports}
								onPlannedSportsChange={setPlannedSports}
								disabled={mixBusy}
								readOnly={!authed}
							/>
						</div>
					</PageSection>
					{authed && (mixDirty || mixBusy) ? (
						<Actions
							sticky
							className={cn(
								'z-30',
								mixDirty && !mixBusy && '!items-center !justify-between max-sm:!flex-col max-sm:!items-stretch'
							)}
						>
							{mixDirty && !mixBusy ? (
								<p className="m-0 min-w-0 text-[0.85rem] leading-snug text-muted max-sm:mb-0.5">
									<StatusPill className="mr-2 border border-accent/35 bg-accent/10 text-accent-fg">
										Unsaved draft
									</StatusPill>
									Generate uses this setup until you save.
								</p>
							) : null}
							<div className="flex shrink-0 flex-wrap items-center justify-end gap-3 max-sm:w-full max-sm:gap-[0.55rem] max-sm:[&>button]:flex-1 max-sm:[&>button]:min-w-[min(100%,9rem)]">
								<Button
									variant="ghost"
									type="button"
									onClick={() => applySetup(savedSetup)}
									disabled={mixBusy}
								>
									Revert to saved
								</Button>
								<Button
									type="button"
									onClick={() => setSaveSetupOpen(true)}
									disabled={mixBusy || !mixDirty}
									aria-busy={mixBusy}
									stickyPrimary
								>
									<Icon name={mixBusy ? 'calendar' : 'check'} size={16} />
									{mixBusy ? 'Saving…' : 'Save as my default week'}
								</Button>
							</div>
						</Actions>
					) : null}
				</>
			)}

			{tab === 'debrief' && (
				<>
					<PageSection title="1. Import GPX" form>
						{sessionCount > 0 ? (
							<div className="mb-3 font-semibold max-sm:wrap-anywhere">
								<p className="m-0 text-[0.9rem]">
									{many
										? `${sessionCount} sessions in the prompt:`
										: coachUnits[0]?.kind === 'group'
											? 'Grouped session in the prompt:'
											: 'In the prompt:'}
								</p>
								<ul className="m-[0.35rem_0_0] grid list-none gap-1 p-0">
									{coachUnits.map((u) => (
										<li key={u.slug}>
											{u.kind === 'group' && u.members.length > 1 ? (
												<span>
													Grouped · {u.members.length} parts
													{u.run.hasFeel ? '' : ' · no feel yet'}
												</span>
											) : (
												<>
													<DebriefActivityTitle run={u.run} link />
													{u.run.hasFeel ? '' : ' · no feel yet'}
												</>
											)}
										</li>
									))}
								</ul>
								{canGroupDebrief ? (
									<Actions className="mt-2 justify-start max-sm:w-auto max-sm:[&>button]:flex-none">
										<Button
											type="button"
											variant="ghost"
											onClick={() => void groupDebriefSessions()}
										>
											<Icon name="grid" size={16} />
											Group into one session
										</Button>
									</Actions>
								) : null}
							</div>
						) : null}
						{authed ? (
							<GpxImport
								compactList
								onImported={(ok) => {
									const current = (search.id ?? '')
										.split(',')
										.map((s) => s.trim())
										.filter(Boolean);
									const fresh = ok
										.map((r) => (r.id != null ? String(r.id) : ''))
										.filter(Boolean);
									const merged = [...new Set([...current, ...fresh])];
									if (merged.length) {
										router.navigate({
											to: '/coach',
											search: withCoachSearch(search, {
												tab: 'debrief',
												id: merged.join(',')
											}),
											replace: true,
											resetScroll: false
										});
									}
								}}
							/>
						) : (
							<SignInPanel title="Sign in to import a GPX" />
						)}
					</PageSection>

					{sessionCount > 0 ? (
						<>
							<PageSection title="2. How it felt" form>
								<div className="grid gap-4">
									{coachUnits.map((u) => {
									const mirrorIds =
										u.kind === 'group' && u.members.length > 1
											? u.members.map((m) => m.id)
											: [u.run.id];
									return (
										<div key={u.slug}>
											{u.kind === 'group' && u.groupId ? (
												<Actions className="mb-1 justify-start max-sm:w-auto max-sm:[&>button]:flex-none">
													<Button
														type="button"
														variant="ghost"
														onClick={() => void ungroupDebriefSession(u.groupId!)}
													>
														Ungroup session
													</Button>
												</Actions>
											) : null}
											<DebriefFeelForm
												run={u.run}
												parts={u.members.length > 1 ? u.members : undefined}
												mirrorIds={mirrorIds}
												writeup={writeups[u.slug] ?? ''}
												habitDraft={habitDrafts[u.slug] ?? { before: '', after: '' }}
												gear={gear}
												gearWear={gearWear}
												onWriteupChange={(text) => setWriteup(u.slug, text)}
												onHabitChange={(field, text) => setHabit(u.slug, field, text)}
												onClearDrafts={(pick) => clearDebriefDraft(u.slug, pick)}
												onSaved={refreshDebrief}
											/>
											{u.members.map((r) => {
												const raceHint = debrief.raceBySlug[r.slug];
												return raceHint ? (
													<DebriefRacePanel
														key={r.slug}
														hint={raceHint}
														runSlug={r.slug}
														onSaved={refreshDebrief}
													/>
												) : null;
											})}
										</div>
									);
									})}
								</div>
							</PageSection>

							<PageSection title="3. Copy the prompt" form>
						{debrief.error && !debriefPrompt ? (
							<p className={cn('text-muted', 'm-0')}>{debrief.error}</p>
						) : null}
						{debriefPrompt ? (
							<>
								<AiPromptFlow
									prompt={debriefPrompt}
									promptEditable
									onPromptChange={setDebriefPrompt}
									promptRows={14}
								/>
								<Checkbox
									checked={includePlan}
									onChange={setIncludePlan}
									label="New chat — include my plan and standing info"
									hint="On for a new chat; off to keep the prompt small in an ongoing thread."
								/>
							</>
						) : null}
					</PageSection>

					<PageSection title="4. Paste the AI response" form>
						{authed ? (
							<JsonPasteForm
								placeholder={
									includePlan
										? '{ "feelings": { "id": 42, "notes": "…" }, "week": { "week": 3, "sessions": [ … ] } }'
										: '{ "feelings": { "id": 42, "notes": "…" } }'
								}
								submitLabel="Save reply"
								submitIcon="check"
								errorLabel="Could not save debrief."
								onSubmit={async (json) => {
									for (const u of writeupUnits) {
										const h = habitDrafts[u.slug];
										if (!h) continue;
										const ids = u.members.map((m) => m.id);
										for (const id of ids) {
											await saveActivityFeel({
												data: {
													id,
													before_notes: h.before,
													after_notes: h.after
												}
											});
										}
									}
									const res = await saveDebrief({ data: json });
									const bits: string[] = [];
									if (res.feelingsUpdated) {
										bits.push(
											`feelings on ${res.feelingsUpdated} activit${res.feelingsUpdated === 1 ? 'y' : 'ies'}`
										);
									}
									if (res.planUpdated.length)
										bits.push(`week ${res.planUpdated.join(', ')} updated`);
									if (res.fuelSuggestions.length) {
										bits.push('food found — review it');
										setFuelSuggestions(res.fuelSuggestions);
										if (res.bodySuggestions.length) {
											bits.push('body notes next');
											setBodySuggestionsQueued(res.bodySuggestions);
										}
									} else if (res.bodySuggestions.length) {
										bits.push('body notes found — review them');
										setBodySuggestions(res.bodySuggestions);
									}
									const miss = res.feelingsMissing.length
										? ` (${res.feelingsMissing.length} id(s) not found)`
										: '';
									snack.success(`Saved — ${bits.join(' · ') || 'nothing changed'}${miss}.`);
									if (res.feelingsUpdatedSlugs.length) {
										setWriteups((prev) => clearDebriefWriteups(res.feelingsUpdatedSlugs, prev));
										setHabitDrafts((prev) => clearDebriefHabits(res.feelingsUpdatedSlugs, prev));
									}
									await refreshDebrief();
								}}
							/>
						) : (
							<SignInPanel title="Sign in to save the debrief" />
						)}
							</PageSection>
						</>
					) : null}

					<FuelSuggestionsDialog
						suggestions={fuelSuggestions}
						onClose={() => {
							setFuelSuggestions([]);
							if (bodySuggestionsQueued.length) {
								setBodySuggestions(bodySuggestionsQueued);
								setBodySuggestionsQueued([]);
							}
						}}
					/>
					<BodySuggestionsDialog
						suggestions={bodySuggestions}
						onClose={() => setBodySuggestions([])}
					/>
				</>
			)}

			{tab === 'plan' && <PlanWeekPanel planData={plan} />}

			{tab === 'generate' && authed && (
				<>
					<PageSection title="Context" form>
						<Field as="div" label="History window">
							<DateRangeFilter range={range} to="/coach" defaultKind={DEFAULT_BRIEF_RANGE} />
						</Field>
						<p className={cn('text-muted', 'm-0 text-[0.88rem] leading-relaxed')}>
							Activity window: {range.label.toLowerCase()}. Long-term totals always included.
							{plan.activeGoal ? (
								<>
									{' '}
									Week {plan.generateWeek} of {plan.calendar.weekCount} toward{' '}
									{plan.activeGoal.name}.
								</>
							) : null}{' '}
							<Link className="font-semibold text-accent-fg" to="/goals">
								Goals
							</Link>
							{mixDirty ? (
								<>
									{' · '}
									<Link
										className="font-semibold text-accent-fg"
										to="/coach"
										search={withCoachSearch(search, { tab: 'training' })}
									>
										Unsaved week setup
									</Link>
								</>
							) : null}
						</p>
					</PageSection>

					<PageSection title="Your question" form>
						<GenerateBriefForm
							weekPhrase={weekPhrase}
							mixNote={generateDraft.mixNote}
							question={generateDraft.question ?? defaultQ}
							questionPlaceholder={defaultQ}
							briefBusy={briefBusy}
							onMixNoteChange={(mixNote) => patchGenerateText({ mixNote })}
							onQuestionChange={(question) =>
								patchGenerateText({ question: question === defaultQ ? null : question })
							}
							onFieldsBlur={onGenerateFieldsBlur}
						/>
					</PageSection>

					{(generateDraft.brief || briefBusy) && (
						<PageSection title="Prompt for AI" form>
							{briefBusy && !generateDraft.brief ? (
								<p className="m-0 flex items-center gap-2.5 text-[0.9rem] text-muted">
									<Icon
										name="spinner"
										size={20}
										className="animate-spin text-accent-fg"
										aria-hidden
									/>
									Building prompt…
								</p>
							) : (
								<>
									{briefBusy ? (
										<p className="m-0 mb-3 flex items-center gap-2 text-[0.85rem] text-muted">
											<Icon
												name="spinner"
												size={16}
												className="animate-spin text-accent-fg"
												aria-hidden
											/>
											Updating prompt…
										</p>
									) : null}
									<AiPromptFlow
									prompt={generateDraft.brief}
									promptEditable
									onPromptChange={(brief) => patchGenerateDraft({ brief })}
									promptRows={16}
									afterCopy={
										<IconLabelButton
											label="Download .md"
											icon={<Icon name="download" size={16} />}
											onClick={download}
										/>
									}
								/>
								</>
							)}
						</PageSection>
					)}

					<PageSection title={`Save ${weekPhrase}’s plan`} form className="mt-4">
						<JsonPasteForm
							description={
								<p className={cn('text-muted', 'm-0 text-[0.88rem]')}>
									Paste the AI response — merged by week number. Session{' '}
									<code className="text-[0.85em]">fuel</code> /{' '}
									<code className="text-[0.85em]">kit</code> are saved on the plan (not the fuel
									log). Check pinned activities kept their day.
								</p>
							}
							placeholder='{ "week": 3, "dates": "…", "phase": "build", "focus": "…", "sessions": [ … ] }'
							submitLabel="Add to plan"
							errorLabel="Could not save plan."
							onSubmit={async (json) => {
								const res = await savePlanWeeks({ data: json });
								snack.success(
									`Saved — plan now has ${res.weeks} weeks (updated week ${res.updated.join(', ')}).`
								);
								await router.invalidate();
							}}
						/>
					</PageSection>
				</>
			)}
			<ConfirmDialog
				open={saveSetupOpen}
				title="Save as your default week?"
				description={
					setupChangeLines.length ? (
						<ul className="m-0 grid list-disc gap-1.5 pl-5 text-[0.92rem]">
							{setupChangeLines.map((line) => (
								<li key={line}>{line}</li>
							))}
						</ul>
					) : (
						'Replace your saved default week with this setup.'
					)
				}
				confirmLabel="Save"
				cancelLabel="Keep editing"
				onClose={() => setSaveSetupOpen(false)}
				onConfirm={() => {
					setSaveSetupOpen(false);
					void saveDefaultMix();
				}}
			/>
			{leaveGuard}
		</>
	);
}
