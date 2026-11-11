import { useAuthed } from '$lib/auth';
import {
	formatAllWeeksClipboard,
	formatWeekPlanClipboard,
	isoDateLocal,
	planWeekDateRangeShort
} from '$lib/plan';
import { cn } from '$lib/ui';
import { Link, useRouter, getRouteApi } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { MoreMenu } from '../MoreMenu';
import { WeekPlanBoard } from '../WeekPlanBoard';
import { savePlanWeeks } from '$lib/server/functions';
import { Button, Dialog, FormSection, PageSection, Select, useSnackbar } from '../ui';
import { JsonPasteForm } from '../JsonPasteForm';
import { ui } from '../ui/tokens';
import { withCoachSearch } from '$lib/coach/search';
import { weekTag, type CoachPlanData } from './coach-utils';

const coachRoute = getRouteApi('/coach');

function weekPlanStatus(hasPlan: boolean): string {
	return hasPlan ? 'Planned' : 'No plan';
}

function planBlockExplanation(planData: CoachPlanData): string {
	const { calendar, activeGoal } = planData;
	if (calendar.rolling) {
		return 'No race goal — planning one week at a time.';
	}
	if (activeGoal?.date) {
		return `${calendar.weekCount} weeks from plan start to race week · ${activeGoal.name}.`;
	}
	return `${calendar.weekCount}-week plan block.`;
}

const PAGER_WINDOW = 5;

/** Sliding window of 5 weeks + first/last, e.g. `1 2 3 4 5 … 9` or `1 … 3 4 5 6 7 … 9`. */
function weekPagerItems(selected: number, total: number): Array<number | 'gap'> {
	if (total <= PAGER_WINDOW + 1) {
		return Array.from({ length: total }, (_, i) => i + 1);
	}

	let winStart = selected - Math.floor(PAGER_WINDOW / 2);
	winStart = Math.max(1, Math.min(winStart, total - PAGER_WINDOW + 1));
	const winEnd = winStart + PAGER_WINDOW - 1;

	const out: Array<number | 'gap'> = [];

	if (winStart > 1) {
		out.push(1);
		if (winStart > 2) out.push('gap');
	}

	for (let n = winStart; n <= winEnd; n++) out.push(n);

	if (winEnd < total) {
		if (winEnd < total - 1) out.push('gap');
		out.push(total);
	}

	return out;
}

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
	const [importOpen, setImportOpen] = useState(false);
	const [importBusy, setImportBusy] = useState(false);
	const blockHint = planBlockExplanation(planData);
	const scrollRef = useRef<HTMLDivElement>(null);
	const useScrollStrip = weekCount <= 6;

	function setWeek(n: number) {
		const week = Math.min(weekCount, Math.max(1, n));
		router.navigate({
			to: '/coach',
			search: withCoachSearch(search, { tab: 'plan', planWeek: week }),
			replace: true,
			resetScroll: false
		});
	}

	useEffect(() => {
		if (useScrollStrip) return;
		const root = scrollRef.current;
		if (!root) return;
		const el = root.querySelector<HTMLElement>(`[data-week="${selected}"]`);
		el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
	}, [selected, useScrollStrip, weekCount]);

	async function copyText(kind: 'week' | 'all', text: string) {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(kind);
			setTimeout(() => setCopied((prev) => (prev === kind ? null : prev)), 1800);
			snack.success(kind === 'week' ? 'Week copied' : 'All planned weeks copied');
		} catch {
			snack.error('Could not copy — select and copy the text instead.');
		}
	}

	const todayIso = isoDateLocal(new Date());
	const boardTitle =
		selected === current ? 'This week' : selected === upcomingWeek ? 'Next week' : `Week ${selected}`;

	const planMenu =
		authed && (view || planData.views.length)
			? [
					{
						label: copied === 'week' ? 'Copied this week' : 'Copy this week',
						icon: <Icon name={copied === 'week' ? 'check' : 'copy'} size={16} />,
						disabled: !view,
						onClick: () => view && void copyText('week', formatWeekPlanClipboard(view, todayIso))
					},
					{
						label: copied === 'all' ? 'Copied all weeks' : 'Copy all planned weeks',
						icon: <Icon name={copied === 'all' ? 'check' : 'copy'} size={16} />,
						disabled: !planData.views.length,
						onClick: () => void copyText('all', formatAllWeeksClipboard(planData.views, todayIso))
					},
					{
						label: 'Import updated plan',
						icon: <Icon name="upload" size={16} />,
						onClick: () => setImportOpen(true)
					}
				]
			: [];

	const planMenuButton =
		planMenu.length > 0 ? <MoreMenu compact items={planMenu} label="Plan" /> : null;

	const weekOptions = Array.from({ length: weekCount }, (_, i) => {
		const n = i + 1;
		const tag = weekTag(n, current, upcomingWeek);
		const dates = planWeekDateRangeShort(n, planData.calendar);
		const hasPlan = byWeek.has(n);
		const status = weekPlanStatus(hasPlan);
		const tagBit = tag ? ` · ${tag}` : '';
		const full = `Week ${n}${tagBit} · ${dates} · ${status}`;
		return {
			value: String(n),
			label: `${n}${tagBit} · ${dates} · ${status}`,
			text: full
		};
	});

	const pager = weekPagerItems(selected, weekCount);

	function weekChip(n: number) {
		const tag = weekTag(n, current, upcomingWeek);
		const dates = planWeekDateRangeShort(n, planData.calendar);
		const hasPlan = byWeek.has(n);
		const pressed = n === selected;
		return (
			<button
				key={n}
				type="button"
				data-week={n}
				aria-pressed={pressed}
				aria-label={`Week ${n}, ${dates}, ${weekPlanStatus(hasPlan)}`}
				className={cn(
					ui.segItem,
					'snap-center shrink-0 flex-col gap-0.5 min-h-[3.25rem] min-w-[5rem] px-2 py-2.5 leading-tight',
					!hasPlan && 'opacity-75'
				)}
				onClick={() => {
					if (!pressed) setWeek(n);
				}}
			>
				<span className="text-[0.82rem] font-semibold tabular-nums whitespace-nowrap">
					{tag ? `${n} · ${tag}` : n} · {weekPlanStatus(hasPlan)}
				</span>
				<span className="text-[0.68rem] font-medium opacity-90 whitespace-nowrap">{dates}</span>
			</button>
		);
	}

	return (
		<PageSection form>
			<FormSection title="Pick a week" action={planMenuButton ?? undefined}>
				{/* Narrow / tablet: one select — no second row */}
				<div className="flex min-w-0 items-stretch gap-1.5 sm:gap-2 lg:hidden">
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="shrink-0"
						aria-label="Previous week"
						disabled={selected <= 1}
						onClick={() => setWeek(selected - 1)}
					>
						<Icon name="arrow" size={18} className="rotate-180" />
					</Button>
					<Select
						aria-label="Plan week"
						className="min-w-0 flex-1 [&_button]:min-h-12 [&_button]:gap-1 [&_button]:py-2.5 [&_button]:text-[0.82rem] sm:[&_button]:text-[0.88rem] [&_button_span]:truncate"
						value={String(selected)}
						onChange={(next) => setWeek(Number(next))}
						options={weekOptions}
					/>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="shrink-0"
						aria-label="Next week"
						disabled={selected >= weekCount}
						onClick={() => setWeek(selected + 1)}
					>
						<Icon name="arrow" size={18} />
					</Button>
				</div>

				{/* Wide: scroll strip (≤6 weeks) or paginated chips (7+) — never alongside select */}
				<div className="hidden min-w-0 items-stretch gap-2 lg:flex">
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="shrink-0"
						aria-label="Previous week"
						disabled={selected <= 1}
						onClick={() => setWeek(selected - 1)}
					>
						<Icon name="arrow" size={18} className="rotate-180" />
					</Button>
					{useScrollStrip ? (
						<div
							ref={scrollRef}
							className={cn(
								ui.segToggle,
								'min-w-0 flex-1 snap-x snap-mandatory scroll-smooth overflow-x-auto'
							)}
						>
							{Array.from({ length: weekCount }, (_, i) => weekChip(i + 1))}
						</div>
					) : (
						<div
							ref={scrollRef}
							className="flex min-w-0 flex-1 flex-nowrap items-stretch justify-center gap-0.5"
						>
							{pager.map((item, i) =>
								item === 'gap' ? (
									<span
										key={`gap-${i}`}
										className="flex shrink-0 items-center px-0.5 text-[0.9rem] font-semibold tabular-nums text-muted"
										aria-hidden
									>
										…
									</span>
								) : (
									weekChip(item)
								)
							)}
						</div>
					)}
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="shrink-0"
						aria-label="Next week"
						disabled={selected >= weekCount}
						onClick={() => setWeek(selected + 1)}
					>
						<Icon name="arrow" size={18} />
					</Button>
				</div>

				<p className={cn('text-muted', 'm-0 mt-2 text-[0.76rem] leading-snug opacity-80')}>
					{blockHint}
				</p>

				{view?.week.focus ? (
					<p className={cn('text-muted', 'm-0 mt-2 text-[0.84rem] leading-snug')}>
						{view.week.focus}
					</p>
				) : null}
			</FormSection>

			<div className="mt-4 border-t border-line pt-4">
				{view ? (
					<WeekPlanBoard embedded view={view} routes={planData.routes} title={boardTitle} />
				) : (
					<p className={cn('text-muted', 'm-0 text-[0.9rem]')}>
						Nothing scheduled for week {selected} yet.{' '}
						<Link
							className="font-semibold text-accent-fg"
							to="/coach"
							search={withCoachSearch(search, { tab: 'generate' })}
						>
							Generate a plan
						</Link>{' '}
						to fill it in.
					</p>
				)}
			</div>

			<Dialog
				open={importOpen}
				title="Import updated plan"
				className="sm:max-w-[38rem]"
				onClose={importBusy ? () => {} : () => setImportOpen(false)}
			>
				<JsonPasteForm
					description={
						<p className={cn('text-muted', 'm-0 text-[0.88rem]')}>
							Paste the AI response — merged by week number. Session{' '}
							<code className="text-[0.85em]">fuel</code> /{' '}
							<code className="text-[0.85em]">kit</code> are saved on the plan. Include{' '}
							<code className="text-[0.85em]">start</code> when the week is not on the race
							calendar yet.
						</p>
					}
					placeholder='{ "week": 7, "dates": "09 Nov–15 Nov 2026", "start": "2026-11-09", "sessions": [ … ] }'
					submitLabel="Merge into plan"
					errorLabel="Could not save plan."
					onSubmit={async (json) => {
						setImportBusy(true);
						try {
							const res = await savePlanWeeks({ data: json });
							snack.success(
								`Saved — plan now has ${res.weeks} weeks (updated week ${res.updated.join(', ')}).`
							);
							setImportOpen(false);
							await router.invalidate();
						} finally {
							setImportBusy(false);
						}
					}}
				/>
			</Dialog>
		</PageSection>
	);
}
