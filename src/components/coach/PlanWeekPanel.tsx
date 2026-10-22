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
	type DayLimit,
	type WeekSetup
} from '$lib/week-mix';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
	Field,
	Form,
	IconLabelButton,
	PageHero,
	PageTabs,
	Panel,
	PanelTitle,
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

import { getRouteApi } from '@tanstack/react-router';
const coachRoute = getRouteApi('/coach');
import type { CoachPlanData } from './coach-utils';

export function PlanWeekPanel({ planData }: { planData: CoachPlanData }) {
	const search = coachRoute.useSearch();
	const router = useRouter();
	const authed = useAuthed();
	const snack = useSnackbar();
	const current = planData.currentWeek;
	const weekCount = planData.calendar.weekCount;
	const upcomingWeek = planData.views.find((v) => v.next)?.week.week ?? planData.generateWeek;
	const selected = Math.min(weekCount, search.planWeek ?? upcomingWeek);
	const byWeek = new Map(planData.views.map((v) => [v.week.week, v]));
	const view = byWeek.get(selected) ?? null;
	const [copied, setCopied] = useState<'week' | 'all' | null>(null);

	function setWeek(n: number) {
		const week = Math.min(weekCount, Math.max(1, n));
		router.navigate({
			to: '/coach',
			search: withCoachSearch(search, { tab: 'plan', planWeek: week }),
			replace: true,
			resetScroll: false
		});
	}

	async function copyText(kind: 'week' | 'all', text: string) {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(kind);
			setTimeout(() => setCopied((prev) => (prev === kind ? null : prev)), 1800);
		} catch {
			snack.error('Could not copy — select and copy the text instead.');
		}
	}

	const todayIso = isoDateLocal(new Date());

	return (
		<>
			<Panel form className="mb-4">
				<Field as="div" label="Week">
					<div className="hidden max-sm:flex flex-col gap-[0.35rem]">
						<div className="flex items-stretch gap-2">
							<button
								type="button"
								className={buttonClass({ variant: 'ghost', size: 'icon' })}
								aria-label="Previous week"
								disabled={selected <= 1}
								onClick={() => setWeek(selected - 1)}
							>
								<Icon name="arrow" size={18} className="rotate-180" />
							</button>
							<Select
								aria-label="Plan week"
								className="flex-1"
								value={String(selected)}
								onChange={(next) => setWeek(Number(next))}
								options={Array.from({ length: weekCount }, (_, i) => {
									const n = i + 1;
									const tag = weekTag(n, current, upcomingWeek);
									const dates = planWeekDateRangeShort(n, planData.calendar);
									const planned = byWeek.has(n);
									return {
										value: String(n),
										label: `Week ${n}${tag ? ` · ${tag}` : ''} · ${dates}${planned ? '' : ' · no plan'}`
									};
								})}
							/>
							<button
								type="button"
								className={buttonClass({ variant: 'ghost', size: 'icon' })}
								aria-label="Next week"
								disabled={selected >= weekCount}
								onClick={() => setWeek(selected + 1)}
							>
								<Icon name="arrow" size={18} />
							</button>
						</div>
						<p className={cn('text-muted', 'm-0 text-[0.82rem]')}>
							{planWeekDateRange(selected, planData.calendar)}
							{byWeek.has(selected) ? '' : ' · no plan yet'}
						</p>
					</div>
					<div className="max-sm:hidden" role="group" aria-label="Plan week">
						<div className="flex flex-wrap gap-[0.4rem]">
							{Array.from({ length: weekCount }, (_, i) => {
								const n = i + 1;
								const tag = weekTag(n, current, upcomingWeek);
								const dates = planWeekDateRangeShort(n, planData.calendar);
								const planned = byWeek.has(n);
								const pressed = n === selected;
								return (
									<button
										key={n}
										type="button"
										aria-pressed={pressed}
										aria-label={`Week ${n}, ${dates}${tag ? `, ${tag}` : ''}${planned ? '' : ', no plan yet'}`}
										className={cn(
											'appearance-none inline-flex flex-col items-center justify-center gap-[0.18rem] min-h-[3.35rem] min-w-[4.4rem] px-[0.7rem] py-[0.4rem] rounded-[14px] bg-transparent text-muted cursor-pointer transition-[color,background-color,border-color] duration-150 ease-out hover:text-fg',
											planned
												? 'border border-solid border-line hover:border-accent/35'
												: 'border border-dashed border-line/80 text-muted/80 hover:border-accent/40 hover:text-muted',
											'aria-[pressed=true]:bg-accent! aria-[pressed=true]:text-accent-ink! aria-[pressed=true]:border-solid! aria-[pressed=true]:border-accent! aria-[pressed=true]:hover:text-accent-ink aria-[pressed=true]:hover:border-accent'
										)}
										onClick={() => {
											if (!pressed) setWeek(n);
										}}
									>
										<span className="text-[0.95rem] font-semibold leading-none">
											{tag ? `${n} · ${tag}` : n}
										</span>
										<span className="text-[0.68rem] font-medium leading-[1.15] whitespace-nowrap opacity-80">
											{dates}
										</span>
									</button>
								);
							})}
						</div>
					</div>
				</Field>
				{authed ? (
					<>
						<p className={cn('text-muted', 'm-0 max-sm:hidden')}>
							Copy this week (live status plus JSON) into a new chat, or every week that already has
							sessions. Paste an updated JSON block back below.
						</p>
						<Actions>
							<IconLabelButton
								label={copied === 'week' ? 'Copied' : 'Copy this week'}
								disabled={!view}
								icon={<Icon name={copied === 'week' ? 'check' : 'copy'} size={16} />}
								onClick={() => view && copyText('week', formatWeekPlanClipboard(view, todayIso))}
							/>
							<IconLabelButton
								label={copied === 'all' ? 'Copied' : 'Copy all planned weeks'}
								disabled={!planData.views.length}
								icon={<Icon name={copied === 'all' ? 'check' : 'copy'} size={16} />}
								onClick={() => copyText('all', formatAllWeeksClipboard(planData.views, todayIso))}
							/>
						</Actions>
					</>
				) : null}
			</Panel>
			{view ? (
				<WeekPlanBoard
					view={view}
					routes={planData.routes}
					title={
						selected === current
							? 'This week'
							: selected === upcomingWeek
								? 'Next week'
								: `Week ${selected}`
					}
				/>
			) : (
				<p className={cn('text-muted', 'mt-0 mb-4')}>
					Week {selected} ({planWeekDateRange(selected, planData.calendar)}) is not in the plan yet.
				</p>
			)}
			{authed && (
				<JsonPasteForm
					className="mt-4"
					title="Paste updated JSON"
					description={
						<p className={cn('text-muted', 'mt-[0.3rem]')}>
							Same shape as Generate — per-session <code className="text-[0.85em]">fuel</code> arrays
							and <code className="text-[0.85em]">kit</code> strings on run, walk, and bike rows.
							Merged by week number.
						</p>
					}
					placeholder='{ "week": 5, "sessions": [{ "day": "Sunday", "label": "Long", "fuel": [{ "phase": "during", "item": "Gel", "timing": "every 5 km" }], "kit": "Liner shorts; light jacket until warm." }] }'
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
			)}
		</>
	);
}
