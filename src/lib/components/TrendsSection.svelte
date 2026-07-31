<script lang="ts">
	import Sparkline from '$lib/components/Sparkline.svelte';
	import type { TrainingTrends, TrendSeries } from '$lib/trends';

	type Props = {
		trends: TrainingTrends;
		/** Optional heading override (e.g. when a date range is active). */
		heading?: string;
		caption?: string;
	};

	let {
		trends,
		heading = 'Trends',
		caption = 'Progress over recent weeks and runs'
	}: Props = $props();

	let activeBar = $state<number | null>(null);
	let barPinned = $state(false);
	let barChartEl: HTMLDivElement | undefined = $state();

	function maxBar(series: TrendSeries): number {
		return Math.max(...series.points.map((p) => p.value), 0.1);
	}

	function barHeight(value: number, max: number): string {
		const pct = Math.max(4, Math.round((value / max) * 100));
		return `${pct}%`;
	}

	function showBar(i: number) {
		activeBar = i;
	}

	function clearBarIfUnpinned() {
		if (!barPinned) activeBar = null;
	}

	function onBarEnter(i: number) {
		if (!barPinned) showBar(i);
	}

	function onBarLeave() {
		clearBarIfUnpinned();
	}

	function onBarClick(i: number, e: MouseEvent) {
		e.stopPropagation();
		// Fine pointers already get hover tooltips; tap/pin is for touch.
		if (typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
			showBar(i);
			return;
		}
		if (barPinned && activeBar === i) {
			barPinned = false;
			activeBar = null;
			return;
		}
		barPinned = true;
		activeBar = i;
	}

	function onDocPointerDown(e: PointerEvent) {
		if (!barPinned || !barChartEl) return;
		if (e.target instanceof Node && barChartEl.contains(e.target)) return;
		barPinned = false;
		activeBar = null;
	}

	$effect(() => {
		if (!barPinned) return;
		document.addEventListener('pointerdown', onDocPointerDown);
		return () => document.removeEventListener('pointerdown', onDocPointerDown);
	});
</script>

{#if trends.series.length}
	<section class="trends" aria-labelledby="trends-heading">
		<div class="trends-head">
			<h2 id="trends-heading">{heading}</h2>
			<p class="muted">{caption}</p>
		</div>

		<div class="trends-grid">
			{#each trends.series as series (series.id)}
				<article class="trend-item" class:trend-bars={series.bars}>
					<header class="trend-meta">
						<div>
							<span class="trend-title">{series.title}</span>
							<span class="trend-sub muted">{series.subtitle}</span>
						</div>
						<div class="trend-readout" aria-label={`${series.title} latest`}>
							{#if series.latest}
								<strong
									>{series.latest}<span class="trend-unit">{series.unit}</span></strong
								>
							{/if}
							{#if series.delta}
								<span
									class="trend-delta"
									class:better={series.delta.startsWith('↓') && series.lowerIsBetter}
									class:worse={series.delta.startsWith('↑') && series.lowerIsBetter}
									class:up={series.delta.startsWith('↑') && !series.lowerIsBetter}
									>{series.delta}</span
								>
							{/if}
						</div>
					</header>

					{#if series.bars}
						{@const max = maxBar(series)}
						<div
							class="bar-chart"
							bind:this={barChartEl}
							role="group"
							aria-label={`${series.title}: ${series.points.map((p) => p.display).join(', ')}`}
						>
							{#each series.points as point, i}
								<button
									type="button"
									class="bar-col"
									class:active={activeBar === i}
									aria-label={`${point.label}: ${point.display}`}
									onpointerenter={() => onBarEnter(i)}
									onpointerleave={onBarLeave}
									onclick={(e) => onBarClick(i, e)}
								>
									<div class="bar-track">
										<span
											class="bar"
											class:empty={point.value <= 0}
											style={`height:${barHeight(point.value, max)}`}
										></span>
									</div>
									<span class="bar-label muted">{point.label}</span>
									{#if activeBar === i}
										<span class="bar-tip" role="tooltip">
											<span class="bar-tip-value">{point.display}</span>
											<span class="bar-tip-label">{point.label}</span>
										</span>
									{/if}
								</button>
							{/each}
						</div>
					{:else}
						<div class="spark-wrap">
							<Sparkline
								values={series.points.map((p) => p.value)}
								tips={series.points.map((p) => ({
									label: p.label,
									display: p.display
								}))}
								label={`${series.title}: ${series.points.map((p) => p.display).join(', ')}`}
								height={44}
							/>
							<div class="spark-ends muted" aria-hidden="true">
								<span>{series.points[0]?.label}</span>
								<span>{series.points[series.points.length - 1]?.label}</span>
							</div>
						</div>
					{/if}
				</article>
			{/each}
		</div>
	</section>
{/if}

<style>
	.trends {
		margin: 0 0 1.75rem;
		padding: 1.1rem 0 0.15rem;
		border-top: 1px solid var(--line);
	}

	.trends-head {
		margin-bottom: 0.95rem;
	}

	.trends-head h2 {
		font-size: 1.2rem;
		font-weight: 700;
	}

	.trends-head p {
		margin-top: 0.25rem;
		font-size: 0.9rem;
	}

	.trends-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1.15rem 1.5rem;
	}

	.trend-item.trend-bars {
		grid-column: 1 / -1;
	}

	.trend-meta {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 0.55rem;
	}

	.trend-title {
		display: block;
		font-family: var(--font-display);
		font-weight: 700;
		letter-spacing: -0.02em;
		font-size: 0.98rem;
	}

	.trend-sub {
		display: block;
		font-size: 0.78rem;
		margin-top: 0.15rem;
	}

	.trend-readout {
		text-align: right;
		flex-shrink: 0;
	}

	.trend-readout strong {
		display: block;
		font-family: var(--font-display);
		font-size: 1.15rem;
		letter-spacing: -0.03em;
		line-height: 1.1;
	}

	.trend-unit {
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--muted);
		margin-left: 0.15rem;
	}

	.trend-delta {
		display: inline-block;
		margin-top: 0.15rem;
		font-size: 0.78rem;
		color: var(--muted);
	}

	.trend-delta.better,
	.trend-delta.up {
		color: var(--ok);
	}

	.trend-delta.worse {
		color: var(--warn);
	}

	.spark-wrap {
		min-width: 0;
		overflow: visible;
		padding-top: 1.85rem;
		margin-top: -1.85rem;
	}

	.spark-ends {
		display: flex;
		justify-content: space-between;
		font-size: 0.72rem;
		margin-top: 0.2rem;
	}

	.bar-chart {
		display: flex;
		align-items: stretch;
		gap: 0.28rem;
		height: 4.6rem;
		min-width: 0;
		overflow: visible;
		padding-top: 1.85rem;
		margin-top: -1.85rem;
	}

	.bar-col {
		position: relative;
		flex: 1 1 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.28rem;
		padding: 0;
		margin: 0;
		border: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		cursor: pointer;
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;
	}

	.bar-track {
		flex: 1;
		width: 100%;
		display: flex;
		align-items: flex-end;
		justify-content: center;
	}

	.bar {
		display: block;
		width: 100%;
		max-width: 1.35rem;
		border-radius: 3px 3px 1px 1px;
		background: linear-gradient(180deg, var(--accent) 0%, rgba(200, 242, 90, 0.45) 100%);
		min-height: 3px;
		transition: filter 0.12s ease, opacity 0.12s ease;
	}

	.bar-col.active .bar:not(.empty),
	.bar-col:hover .bar:not(.empty) {
		filter: brightness(1.08);
	}

	.bar.empty {
		opacity: 0.22;
		background: var(--line);
		min-height: 2px;
		height: 4% !important;
	}

	.bar-label {
		font-size: 0.62rem;
		line-height: 1.1;
		text-align: center;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 100%;
	}

	.bar-tip {
		position: absolute;
		z-index: 3;
		bottom: calc(100% - 0.1rem);
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.05rem;
		padding: 0.28rem 0.45rem;
		border-radius: 8px;
		border: 1px solid var(--line);
		background: #1a2218;
		box-shadow: 0 8px 22px rgba(0, 0, 0, 0.4);
		pointer-events: none;
		white-space: nowrap;
	}

	.bar-tip::after {
		content: '';
		position: absolute;
		top: 100%;
		left: 50%;
		transform: translateX(-50%);
		border: 5px solid transparent;
		border-top-color: #1a2218;
	}

	.bar-tip-value {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 0.78rem;
		letter-spacing: -0.02em;
		color: var(--accent);
		line-height: 1.15;
	}

	.bar-tip-label {
		font-size: 0.68rem;
		color: var(--muted);
		line-height: 1.15;
	}

	@media (max-width: 720px) {
		.trends-grid {
			grid-template-columns: 1fr;
			gap: 1.25rem;
		}

		.bar-chart {
			height: 4.2rem;
			gap: 0.18rem;
		}

		.bar-label {
			font-size: 0.58rem;
		}

		/* Hide every other week label on narrow screens to reduce clutter */
		.bar-col:nth-child(even) .bar-label {
			visibility: hidden;
		}
	}
</style>
