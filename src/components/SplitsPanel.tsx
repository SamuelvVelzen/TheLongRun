import { formatDuration } from '$lib/format';
import type { KmSplit, RouteAnalytics } from '$lib/splits';
import { cn, ui } from '$lib/ui';
import { useState } from 'react';

const zoneColors: Record<number, string> = {
	1: 'var(--ok)',
	2: 'var(--accent)',
	3: '#e8d45a',
	4: 'var(--warn)',
	5: '#ff5b5b'
};

const splitsRow =
	'grid grid-cols-[2.6rem_3.4rem_3.2rem_2.6rem_minmax(4rem,1fr)] gap-x-[0.65rem] gap-y-[0.45rem] items-center py-[0.28rem] text-[0.92rem] border-b border-line/50 max-[520px]:grid-cols-[2.4rem_3.1rem_2.8rem_2.2rem_minmax(2.5rem,1fr)] max-[520px]:gap-x-1.5 max-[520px]:gap-y-[0.3rem] max-[520px]:text-[0.85rem]';

export function SplitsPanel({
	analytics,
	hrMaxManual = null,
	hrMaxAllTime = null,
	onSaveHrMax
}: {
	analytics: RouteAnalytics;
	hrMaxManual?: number | null;
	hrMaxAllTime?: number | null;
	onSaveHrMax?: (hrMax: number | null) => void;
}) {
	const splits = analytics.splits;
	const zones = analytics.hrZones;
	const [editingMax, setEditingMax] = useState(false);
	const [maxInput, setMaxInput] = useState(String(hrMaxManual ?? zones?.hrMax ?? ''));

	function saveMax() {
		const n = Number(maxInput);
		onSaveHrMax?.(Number.isFinite(n) && n > 0 ? Math.round(n) : null);
		setEditingMax(false);
	}

	const paceSeconds = splits
		.map((s) => (s.pace && s.seconds > 0 ? s.seconds / s.distanceKm : 0))
		.filter((n) => n > 0);
	const paceMin = paceSeconds.length ? Math.min(...paceSeconds) : 0;
	const paceMax = paceSeconds.length ? Math.max(...paceSeconds) : 1;

	function barWidth(split: KmSplit): number {
		if (!split.pace || !split.seconds || !split.distanceKm) return 0;
		const secPerKm = split.seconds / split.distanceKm;
		if (paceMax <= paceMin) return 70;
		const t = (paceMax - secPerKm) / (paceMax - paceMin);
		return Math.round(28 + t * 72);
	}

	if (!splits.length && !zones) return null;

	return (
		<div className={cn(ui.panel, 'p-[1.1rem_1.2rem_1.25rem] mb-4')}>
			{splits.length > 0 && (
				<>
					<div className="flex flex-wrap items-baseline gap-x-[0.85rem] gap-y-[0.45rem] mb-[0.85rem]">
						<h3>Pace per km</h3>
						<p className={cn(ui.muted, 'text-[0.85rem]')}>Computed from GPS + time</p>
					</div>
					<div className="flex flex-col gap-[0.2rem]" role="table" aria-label="Kilometer splits">
						<div
							className={cn(
								splitsRow,
								'text-[0.72rem] uppercase tracking-[0.06em] text-muted border-b-line pb-[0.45rem]'
							)}
							role="row"
						>
							<span role="columnheader">Km</span>
							<span role="columnheader">Pace</span>
							<span role="columnheader">Time</span>
							<span role="columnheader">HR</span>
							<span className="flex items-center min-h-[0.55rem]" role="presentation"></span>
						</div>
						{splits.map((split) => (
							<div
								key={split.km}
								className={cn(splitsRow, split.isPartial && 'opacity-[0.78]')}
								role="row"
							>
								<span role="cell">
									{split.isPartial ? `${split.distanceKm.toFixed(2)}` : split.km}
									<span className="text-[0.75rem] text-muted">{split.isPartial ? ' km' : ''}</span>
								</span>
								<span role="cell" className="font-display font-bold text-accent-fg">
									{split.pace || '—'}
								</span>
								<span role="cell" className={ui.muted}>
									{formatDuration(split.seconds) || '—'}
								</span>
								<span role="cell" className={ui.muted}>
									{split.avgHr ?? '—'}
								</span>
								<span className="flex items-center min-h-[0.55rem]" role="presentation">
									<span
										className="block h-[0.45rem] rounded-full bg-[linear-gradient(90deg,color-mix(in_srgb,var(--accent)_35%,transparent),var(--accent))] min-w-[0.4rem]"
										style={{ width: `${barWidth(split)}%` }}
										title={split.pace ? `${split.pace}/km` : ''}
									></span>
								</span>
							</div>
						))}
					</div>
				</>
			)}

			{zones && (
				<div className={splits.length > 0 ? 'mt-[1.35rem] pt-[1.15rem] border-t border-line' : undefined}>
					<div className="flex items-start justify-between gap-3 mb-[0.85rem] flex-wrap">
						<div>
							<h3>Heart rate zones</h3>
							<p className={cn(ui.muted, 'text-[0.85rem]')}>
								% of HRmax {zones.hrMax}
								{zones.source === 'activity' && ' (from this activity’s max)'}
								{zones.source === 'profile' && ' (your HRmax)'}
								{zones.source === 'alltime' && ' (all-time max)'}
								{zones.avgZone != null && zones.avgHr != null && (
									<> · avg {zones.avgHr} → Z{zones.avgZone}</>
								)}
							</p>
						</div>
						{onSaveHrMax &&
							(editingMax ? (
								<div className="flex items-center gap-[0.35rem] flex-wrap justify-end max-sm:w-full">
									<input
										className="w-[5.5rem] max-sm:flex-1 max-sm:w-auto"
										type="number"
										inputMode="numeric"
										value={maxInput}
										autoFocus
										placeholder="e.g. 190"
										onChange={(e) => setMaxInput(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === 'Enter') saveMax();
											if (e.key === 'Escape') setEditingMax(false);
										}}
									/>
									<button type="button" className={cn(ui.btnPrimary, ui.btnSm, 'max-sm:flex-1')} onClick={saveMax}>
										Save
									</button>
									{hrMaxManual != null && (
										<button
											type="button"
											className={cn(ui.btnGhost, ui.btnSm)}
											title={
												hrMaxAllTime
													? `Use the all-time max (${hrMaxAllTime})`
													: 'Use the dynamic max'
											}
											onClick={() => {
												onSaveHrMax(null);
												setEditingMax(false);
											}}
										>
											Use dynamic
										</button>
									)}
								</div>
							) : (
								<button
									type="button"
									className={cn(ui.btnGhost, ui.btnSm, 'shrink-0')}
									onClick={() => {
										setMaxInput(String(hrMaxManual ?? zones.hrMax ?? ''));
										setEditingMax(true);
									}}
								>
									Set HRmax
								</button>
							))}
					</div>

					{zones.distribution?.some((z) => z.seconds > 0) ? (
						<>
							<div className="flex h-[0.55rem] rounded-full overflow-hidden bg-white/6 mb-[0.85rem]" aria-hidden="true">
								{zones.distribution.map((z) =>
									z.pct > 0 ? (
										<span
											key={z.zone}
											className="min-w-px"
											style={{ flex: Math.max(z.pct, 1), background: zoneColors[z.zone] }}
											title={`Z${z.zone} ${z.label}: ${z.pct}%`}
										></span>
									) : null
								)}
							</div>
							<div className="grid grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] gap-[0.55rem]">
								{zones.distribution.map((z) => (
									<div
										key={z.zone}
										className={cn(
											'p-[0.55rem_0.65rem] rounded-xl border border-line bg-inset',
											z.seconds <= 0 && 'opacity-45'
										)}
									>
										<div className="flex items-center gap-[0.35rem] text-[0.85rem] mb-1">
											<span
												className="size-[0.45rem] rounded-full shrink-0"
												style={{ background: zoneColors[z.zone] }}
											></span>
											<strong>Z{z.zone}</strong>
											<span className={ui.muted}>{z.label}</span>
										</div>
										<div className="flex items-baseline gap-[0.45rem]">
											<b className="font-display text-[1.1rem]">{formatDuration(z.seconds) || '0:00'}</b>
											<span className={cn(ui.muted, 'text-[0.8rem]')}>{z.pct}%</span>
										</div>
										<p className={cn(ui.muted, 'text-[0.75rem] mt-[0.15rem]')}>
											{z.minBpm}–{z.maxBpm} bpm
										</p>
									</div>
								))}
							</div>
						</>
					) : zones.avgZone != null ? (
						<p className="m-0 text-[0.95rem]">
							Average HR sat in <strong>Z{zones.avgZone}</strong>
							{zones.avgHr != null && ` (${zones.avgHr} bpm)`} — no per-point HR for time-in-zone.
						</p>
					) : null}
				</div>
			)}
		</div>
	);
}
