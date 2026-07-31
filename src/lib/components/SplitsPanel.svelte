<script lang="ts">
	import { formatDuration } from '$lib/format';
	import type { RouteAnalytics } from '$lib/splits';

	let { analytics }: { analytics: RouteAnalytics } = $props();

	const splits = $derived(analytics.splits);
	const zones = $derived(analytics.hrZones);

	const paceSeconds = $derived(
		splits.map((s) => (s.pace && s.seconds > 0 ? s.seconds / s.distanceKm : 0)).filter((n) => n > 0)
	);

	const paceMin = $derived(paceSeconds.length ? Math.min(...paceSeconds) : 0);
	const paceMax = $derived(paceSeconds.length ? Math.max(...paceSeconds) : 1);

	function barWidth(split: (typeof splits)[number]): number {
		if (!split.pace || !split.seconds || !split.distanceKm) return 0;
		const secPerKm = split.seconds / split.distanceKm;
		if (paceMax <= paceMin) return 70;
		// Faster (lower) → longer bar toward accent
		const t = (paceMax - secPerKm) / (paceMax - paceMin);
		return Math.round(28 + t * 72);
	}

	const zoneColors: Record<number, string> = {
		1: '#7dffa8',
		2: '#c8f25a',
		3: '#e8d45a',
		4: '#ff8a5b',
		5: '#ff5b5b'
	};
</script>

{#if splits.length || zones}
	<div class="panel splits-panel" style="margin-bottom:1rem">
		{#if splits.length}
			<div class="splits-head">
				<h3>Pace per km</h3>
				<p class="muted splits-sub">Computed from GPS + time</p>
			</div>
			<div class="splits-list" role="table" aria-label="Kilometer splits">
				<div class="splits-row splits-row-head" role="row">
					<span role="columnheader">Km</span>
					<span role="columnheader">Pace</span>
					<span role="columnheader">Time</span>
					<span role="columnheader">HR</span>
					<span class="splits-bar-col" role="presentation"></span>
				</div>
				{#each splits as split (split.km)}
					<div class="splits-row" class:partial={split.isPartial} role="row">
						<span role="cell"
							>{split.isPartial
								? `${split.distanceKm.toFixed(2)}`
								: split.km}<span class="splits-unit">{split.isPartial ? ' km' : ''}</span
							></span
						>
						<span role="cell" class="splits-pace">{split.pace || '—'}</span>
						<span role="cell" class="muted">{formatDuration(split.seconds) || '—'}</span>
						<span role="cell" class="muted">{split.avgHr ?? '—'}</span>
						<span class="splits-bar-col" role="presentation">
							<span
								class="splits-bar"
								style={`width:${barWidth(split)}%`}
								title={split.pace ? `${split.pace}/km` : ''}
							></span>
						</span>
					</div>
				{/each}
			</div>
		{/if}

		{#if zones}
			<div class="zones-block" class:zones-spaced={splits.length > 0}>
				<div class="splits-head">
					<h3>Heart rate zones</h3>
					<p class="muted splits-sub">
						% of HRmax {zones.hrMax}
						{#if zones.source === 'activity'}(from this run’s max){/if}
						{#if zones.avgZone != null && zones.avgHr != null}
							· avg {zones.avgHr} → Z{zones.avgZone}
						{/if}
					</p>
				</div>

				{#if zones.distribution?.some((z) => z.seconds > 0)}
					<div class="zone-stack" aria-hidden="true">
						{#each zones.distribution as z}
							{#if z.pct > 0}
								<span
									class="zone-stack-seg"
									style={`flex:${Math.max(z.pct, 1)};background:${zoneColors[z.zone]}`}
									title={`Z${z.zone} ${z.label}: ${z.pct}%`}
								></span>
							{/if}
						{/each}
					</div>
					<div class="zone-grid">
						{#each zones.distribution as z}
							<div class="zone-card" class:empty={z.seconds <= 0}>
								<div class="zone-card-top">
									<span class="zone-dot" style={`background:${zoneColors[z.zone]}`}></span>
									<strong>Z{z.zone}</strong>
									<span class="muted">{z.label}</span>
								</div>
								<div class="zone-card-vals">
									<b>{formatDuration(z.seconds) || '0:00'}</b>
									<span class="muted zone-pct">{z.pct}%</span>
								</div>
								<p class="muted zone-bpm">{z.minBpm}–{z.maxBpm} bpm</p>
							</div>
						{/each}
					</div>
				{:else if zones.avgZone != null}
					<p class="zone-avg-only">
						Average HR sat in <strong>Z{zones.avgZone}</strong>
						{#if zones.avgHr != null}({zones.avgHr} bpm){/if}
						— no per-point HR for time-in-zone.
					</p>
				{/if}
			</div>
		{/if}
	</div>
{/if}

<style>
	.splits-panel {
		padding: 1.1rem 1.2rem 1.25rem;
	}

	.splits-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.45rem 0.85rem;
		margin-bottom: 0.85rem;
	}

	.splits-sub {
		font-size: 0.85rem;
	}

	.splits-list {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.splits-row {
		display: grid;
		grid-template-columns: 2.6rem 3.4rem 3.2rem 2.6rem minmax(4rem, 1fr);
		gap: 0.45rem 0.65rem;
		align-items: center;
		padding: 0.28rem 0;
		font-size: 0.92rem;
		border-bottom: 1px solid rgba(232, 240, 226, 0.06);
	}

	.splits-row-head {
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted);
		border-bottom-color: var(--line);
		padding-bottom: 0.45rem;
	}

	.splits-row.partial {
		opacity: 0.78;
	}

	.splits-unit {
		font-size: 0.75rem;
		color: var(--muted);
	}

	.splits-pace {
		font-family: var(--font-display);
		font-weight: 700;
		color: var(--accent);
	}

	.splits-bar-col {
		display: flex;
		align-items: center;
		min-height: 0.55rem;
	}

	.splits-bar {
		display: block;
		height: 0.45rem;
		border-radius: 999px;
		background: linear-gradient(90deg, rgba(200, 242, 90, 0.35), var(--accent));
		min-width: 0.4rem;
	}

	.zones-spaced {
		margin-top: 1.35rem;
		padding-top: 1.15rem;
		border-top: 1px solid var(--line);
	}

	.zone-stack {
		display: flex;
		height: 0.55rem;
		border-radius: 999px;
		overflow: hidden;
		background: rgba(255, 255, 255, 0.06);
		margin-bottom: 0.85rem;
	}

	.zone-stack-seg {
		min-width: 2px;
	}

	.zone-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr));
		gap: 0.55rem;
	}

	.zone-card {
		padding: 0.55rem 0.65rem;
		border-radius: 12px;
		border: 1px solid var(--line);
		background: rgba(0, 0, 0, 0.18);
	}

	.zone-card.empty {
		opacity: 0.45;
	}

	.zone-card-top {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.85rem;
		margin-bottom: 0.25rem;
	}

	.zone-dot {
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 999px;
		flex-shrink: 0;
	}

	.zone-card-vals {
		display: flex;
		align-items: baseline;
		gap: 0.45rem;
	}

	.zone-card-vals b {
		font-family: var(--font-display);
		font-size: 1.1rem;
	}

	.zone-pct {
		font-size: 0.8rem;
	}

	.zone-bpm {
		font-size: 0.75rem;
		margin-top: 0.15rem;
	}

	.zone-avg-only {
		margin: 0;
		font-size: 0.95rem;
	}

	@media (max-width: 520px) {
		.splits-row {
			grid-template-columns: 2.4rem 3.1rem 2.8rem 2.2rem minmax(2.5rem, 1fr);
			gap: 0.3rem 0.4rem;
			font-size: 0.85rem;
		}
	}
</style>
