import { useState } from 'react';
import { formatDuration } from '$lib/format';
import type { KmSplit, RouteAnalytics } from '$lib/splits';

const zoneColors: Record<number, string> = {
	1: '#7dffa8',
	2: '#c8f25a',
	3: '#e8d45a',
	4: '#ff8a5b',
	5: '#ff5b5b'
};

export function SplitsPanel({
	analytics,
	hrMaxManual = null,
	hrMaxAllTime = null,
	onSaveHrMax
}: {
	analytics: RouteAnalytics;
	/** User-set HRmax (null = using the dynamic all-time max). */
	hrMaxManual?: number | null;
	/** All-time max HR across activities, shown as the dynamic option. */
	hrMaxAllTime?: number | null;
	/** Persist a new HRmax (null clears back to dynamic). Enables the inline editor. */
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
		<div className="panel splits-panel" style={{ marginBottom: '1rem' }}>
			{splits.length > 0 && (
				<>
					<div className="splits-head">
						<h3>Pace per km</h3>
						<p className="muted splits-sub">Computed from GPS + time</p>
					</div>
					<div className="splits-list" role="table" aria-label="Kilometer splits">
						<div className="splits-row splits-row-head" role="row">
							<span role="columnheader">Km</span>
							<span role="columnheader">Pace</span>
							<span role="columnheader">Time</span>
							<span role="columnheader">HR</span>
							<span className="splits-bar-col" role="presentation"></span>
						</div>
						{splits.map((split) => (
							<div
								key={split.km}
								className={`splits-row${split.isPartial ? ' partial' : ''}`}
								role="row"
							>
								<span role="cell">
									{split.isPartial ? `${split.distanceKm.toFixed(2)}` : split.km}
									<span className="splits-unit">{split.isPartial ? ' km' : ''}</span>
								</span>
								<span role="cell" className="splits-pace">
									{split.pace || '—'}
								</span>
								<span role="cell" className="muted">
									{formatDuration(split.seconds) || '—'}
								</span>
								<span role="cell" className="muted">
									{split.avgHr ?? '—'}
								</span>
								<span className="splits-bar-col" role="presentation">
									<span
										className="splits-bar"
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
				<div className={`zones-block${splits.length > 0 ? ' zones-spaced' : ''}`}>
					<div className="splits-head zones-head">
						<div>
							<h3>Heart rate zones</h3>
							<p className="muted splits-sub">
								% of HRmax {zones.hrMax}
								{zones.source === 'activity' && ' (from this run’s max)'}
								{zones.source === 'profile' && ' (your HRmax)'}
								{zones.source === 'alltime' && ' (all-time max)'}
								{zones.avgZone != null && zones.avgHr != null && (
									<> · avg {zones.avgHr} → Z{zones.avgZone}</>
								)}
							</p>
						</div>
						{onSaveHrMax &&
							(editingMax ? (
								<div className="hrmax-edit">
									<input
										type="number"
										value={maxInput}
										autoFocus
										placeholder="e.g. 190"
										onChange={(e) => setMaxInput(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === 'Enter') saveMax();
											if (e.key === 'Escape') setEditingMax(false);
										}}
									/>
									<button type="button" className="btn btn-primary btn-sm" onClick={saveMax}>
										Save
									</button>
									{hrMaxManual != null && (
										<button
											type="button"
											className="btn btn-ghost btn-sm"
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
									className="btn btn-ghost btn-sm hrmax-btn"
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
							<div className="zone-stack" aria-hidden="true">
								{zones.distribution.map((z) =>
									z.pct > 0 ? (
										<span
											key={z.zone}
											className="zone-stack-seg"
											style={{ flex: Math.max(z.pct, 1), background: zoneColors[z.zone] }}
											title={`Z${z.zone} ${z.label}: ${z.pct}%`}
										></span>
									) : null
								)}
							</div>
							<div className="zone-grid">
								{zones.distribution.map((z) => (
									<div key={z.zone} className={`zone-card${z.seconds <= 0 ? ' empty' : ''}`}>
										<div className="zone-card-top">
											<span className="zone-dot" style={{ background: zoneColors[z.zone] }}></span>
											<strong>Z{z.zone}</strong>
											<span className="muted">{z.label}</span>
										</div>
										<div className="zone-card-vals">
											<b>{formatDuration(z.seconds) || '0:00'}</b>
											<span className="muted zone-pct">{z.pct}%</span>
										</div>
										<p className="muted zone-bpm">
											{z.minBpm}–{z.maxBpm} bpm
										</p>
									</div>
								))}
							</div>
						</>
					) : zones.avgZone != null ? (
						<p className="zone-avg-only">
							Average HR sat in <strong>Z{zones.avgZone}</strong>
							{zones.avgHr != null && ` (${zones.avgHr} bpm)`} — no per-point HR for time-in-zone.
						</p>
					) : null}
				</div>
			)}
		</div>
	);
}
