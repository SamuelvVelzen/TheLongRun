import { Link } from '@tanstack/react-router';
import type { BestEffortBoardRow, EffortHighlight } from '$lib/best-efforts';
import { formatEffortTime } from '$lib/best-efforts';

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
		<ul className={`effort-badges${compact ? ' compact' : ''}`}>
			{shown.map((h) => (
				<li key={h.key}>
					<span className={`effort-badge rank-${h.rank}`}>
						{h.label}
						<span className="effort-badge-time">{formatEffortTime(h.seconds)}</span>
						<span className="effort-badge-rank">{h.rankLabel}</span>
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
		<div className="panel effort-board">
			<div className="splits-head">
				<h3>Best efforts</h3>
				{caption ? <p className="muted splits-sub">{caption}</p> : (
					<p className="muted splits-sub">All-time top 3, like Strava</p>
				)}
			</div>
			<div className="effort-board-table">
				<div className="effort-board-row head">
					<span>Distance</span>
					<span>1st</span>
					<span>2nd</span>
					<span>3rd</span>
				</div>
				{rows.map((row) => (
					<div className="effort-board-row" key={row.key}>
						<strong>{row.label}</strong>
						{[1, 2, 3].map((rank) => {
							const entry = row.entries.find((e) => e.rank === rank);
							if (!entry) return <span key={rank} className="muted">—</span>;
							return (
								<Link
									key={rank}
									className={`effort-board-cell rank-${rank}`}
									to="/runs/$slug"
									params={{ slug: entry.slug }}
								>
									<b>{formatEffortTime(entry.seconds)}</b>
									<span className="muted">
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
