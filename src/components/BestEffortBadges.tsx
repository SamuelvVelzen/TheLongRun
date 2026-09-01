import type { BestEffortBoardRow, EffortHighlight } from '$lib/best-efforts';
import { formatEffortTime } from '$lib/best-efforts';
import { cn, ui } from '$lib/ui';
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

export function BestEffortBoard({
	rows,
	caption
}: {
	rows: BestEffortBoardRow[];
	caption?: string;
}) {
	if (!rows.length) return null;
	return (
		<div className={cn(ui.panel, 'mb-5')}>
			<div className="flex flex-wrap items-baseline gap-x-[0.85rem] gap-y-[0.45rem] mb-[0.85rem]">
				<h3 className="inline-flex items-center gap-2 m-0">
					<Icon name="trophy" size={18} />
					Best efforts
				</h3>
				<p className={cn(ui.muted, 'text-[0.85rem]')}>
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
									<span key={rank} className={ui.muted}>
										—
									</span>
								);
							return (
								<Link
									key={rank}
									className={cn(
										'flex flex-col gap-[0.1rem] text-inherit no-underline min-w-0 hover:[&_b]:underline',
										rankCell[rank]
									)}
									to="/runs/$slug"
									params={{ slug: entry.slug }}
								>
									<b className="tabular-nums">{formatEffortTime(entry.seconds)}</b>
									<span className={ui.muted}>
										{entry.date}
										{entry.pace ? ` · ${entry.pace}/km` : ''}
									</span>
								</Link>
							);
						})}
					</div>
				))}
			</div>
		</div>
	);
}
