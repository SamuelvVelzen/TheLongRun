import { panelClass } from './ui';
import type { BestEffortBoardRow, EffortHighlight } from '$lib/best-efforts';
import {
	effortBoardHasMixedYears,
	formatEffortDayMonth,
	formatEffortTime,
	formatEffortYear2
} from '$lib/best-efforts';
import { groupIdFromOwnerSlug, isGroupOwnerSlug as isGroupEffortSlug } from '$lib/group';
import { cn } from '$lib/ui';
import { Link } from '@tanstack/react-router';
import { Icon } from './Icon';

const rankBadge: Record<number, string> = {
	1: 'border-[rgba(240,193,74,0.45)] text-[#f0c14a] bg-[rgba(240,193,74,0.08)]',
	2: 'border-[rgba(197,208,220,0.4)] text-[#c5d0dc] bg-[rgba(197,208,220,0.08)]',
	3: 'border-[rgba(212,165,116,0.45)] text-[#d4a574] bg-[rgba(212,165,116,0.08)]'
};
const rankCell: Record<number, string> = {
	1: '[&_b]:text-[#f0c14a]',
	2: '[&_b]:text-[#c5d0dc]',
	3: '[&_b]:text-[#d4a574]'
};

export function BestEffortBadges({
	highlights,
	compact = false
}: {
	highlights: EffortHighlight[];
	compact?: boolean;
}) {
	if (!highlights.length) return null;
	const shown = compact ? highlights.slice(0, 3) : highlights;
	return (
		<ul
			className={cn(
				'flex flex-wrap gap-[0.35rem] m-[0.45rem_0_0] p-0 list-none w-full',
				compact && 'mt-[0.35rem]'
			)}
		>
			{shown.map((h) => (
				<li key={h.key}>
					<span
						className={cn(
							'inline-flex items-baseline gap-[0.35rem] px-2 py-[0.18rem] rounded-full border border-line text-[0.75rem] font-[650]',
							rankBadge[h.rank]
						)}
					>
						{h.label}
						<span className="tabular-nums">{formatEffortTime(h.seconds)}</span>
						<span className="text-muted font-medium lowercase">{h.rankLabel}</span>
					</span>
				</li>
			))}
		</ul>
	);
}

function EffortDate({
	iso,
	pace,
	showYear
}: {
	iso: string;
	pace?: string;
	showYear: boolean;
}) {
	const dayMonth = formatEffortDayMonth(iso);
	const year = showYear ? formatEffortYear2(iso) : '';
	return (
		<span
			className={cn(
				'text-muted',
				'leading-snug',
				'max-[720px]:flex max-[720px]:flex-col max-[720px]:gap-[0.05rem]'
			)}
			title={pace ? `${iso} · ${pace}/km` : iso}
		>
			<span className="whitespace-nowrap">
				{dayMonth}
				{year ? <span className="tabular-nums"> {year}</span> : null}
				{pace ? <span className="hidden min-[721px]:inline">{` · ${pace}/km`}</span> : null}
			</span>
			{pace ? (
				<span className="tabular-nums whitespace-nowrap text-[0.75rem] min-[721px]:hidden">
					{pace}/km
				</span>
			) : null}
		</span>
	);
}

export function BestEffortBoard({
	rows,
	caption
}: {
	rows: BestEffortBoardRow[];
	caption?: string;
}) {
	if (!rows.length) return null;
	const showYear = effortBoardHasMixedYears(rows);
	return (
		<div className={panelClass('mb-5')}>
			<div className="flex flex-wrap items-baseline gap-x-[0.85rem] gap-y-[0.45rem] mb-[0.85rem]">
				<h3 className="inline-flex items-center gap-2 m-0">
					<Icon name="trophy" size={18} />
					Best efforts
				</h3>
				<p className={cn('text-muted', 'text-[0.85rem]')}>
					{caption || 'All-time top 3, like Strava'}
				</p>
			</div>
			<div className="grid gap-[0.15rem]">
				<div className="grid grid-cols-[7.5rem_1fr_1fr_1fr] gap-x-3 gap-y-2 items-start py-[0.45rem] border-b border-line text-[0.72rem] uppercase tracking-[0.06em] text-muted pb-1.5 max-[720px]:grid-cols-[5.5rem_1fr_1fr_1fr] max-[720px]:gap-[0.35rem]">
					<span>Distance</span>
					<span>1st</span>
					<span>2nd</span>
					<span>3rd</span>
				</div>
				{rows.map((row) => (
					<div
						className="grid grid-cols-[7.5rem_1fr_1fr_1fr] gap-x-3 gap-y-2 items-start py-[0.45rem] border-b border-[rgba(232,240,226,0.06)] text-[0.88rem] max-[720px]:grid-cols-[5.5rem_1fr_1fr_1fr] max-[720px]:gap-[0.35rem] max-[720px]:text-[0.8rem]"
						key={row.key}
					>
						<strong>{row.label}</strong>
						{[1, 2, 3].map((rank) => {
							const entry = row.entries.find((e) => e.rank === rank);
							if (!entry)
								return (
									<span key={rank} className={'text-muted'}>
										—
									</span>
								);
							const body = (
								<>
									<b className="tabular-nums">{formatEffortTime(entry.seconds)}</b>
									<EffortDate iso={entry.date} pace={entry.pace} showYear={showYear} />
								</>
							);
							const className = cn(
								'flex flex-col gap-[0.1rem] text-inherit no-underline min-w-0 hover:[&_b]:underline',
								rankCell[rank]
							);
							return isGroupEffortSlug(entry.slug) ? (
								<Link
									key={rank}
									className={className}
									to="/groups/$id"
									params={{ id: groupIdFromOwnerSlug(entry.slug)! }}
								>
									{body}
								</Link>
							) : (
								<Link
									key={rank}
									className={className}
									to="/runs/$slug"
									params={{ slug: entry.slug }}
								>
									{body}
								</Link>
							);
						})}
					</div>
				))}
			</div>
		</div>
	);
}
