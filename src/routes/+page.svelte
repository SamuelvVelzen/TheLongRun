<script lang="ts">
	import RoutesHeatmap from '$lib/components/RoutesHeatmap.svelte';
	import DateRangeFilter from '$lib/components/DateRangeFilter.svelte';
	import TrendsSection from '$lib/components/TrendsSection.svelte';
	import { dateRangeHref } from '$lib/date-range';

	let { data } = $props();

	function fmt(n: number | null, digits = 1) {
		if (n == null) return '—';
		return n.toFixed(digits);
	}

	function shinLabel(s: typeof data.stats) {
		if (s.shinRecent == null) return '—';
		if (s.shinDelta == null) return fmt(s.shinRecent);
		if (s.shinDelta === 0) return `${fmt(s.shinRecent)} →`;
		const arrow = s.shinDelta < 0 ? '↓' : '↑';
		return `${fmt(s.shinRecent)} ${arrow}${Math.abs(s.shinDelta)}`;
	}

	const filteredEmpty = $derived(data.totalAllTime > 0 && data.stats.runCount === 0);
	const rangeActive = $derived(data.range.kind !== 'all');
</script>

<section class="hero">
	<div>
		<p class="muted">Personal training desk · no accounts</p>
		<h1>The Long Run</h1>
		<p>
			Log Tue / Fri / Sun with Apple Watch screenshots. Keep profile, plan, and gear notes in
			Context for your own reference.
		</p>
	</div>
	<div class="actions">
		<a class="btn btn-primary" href="/log">Log a run</a>
		<a class="btn btn-ghost" href="/context">Context</a>
	</div>
</section>

<DateRangeFilter range={data.range} pathname="/" />

{#if filteredEmpty}
	<div class="panel muted range-empty">
		<p>No runs in {data.range.label.toLowerCase()}.</p>
		<a class="btn btn-ghost" href={dateRangeHref('/', 'all')}>Show all time</a>
	</div>
{:else}
	<section class="stats-strip" aria-label="Training stats">
		<div class="stats-strip-item">
			<span class="stats-strip-label">Days to {data.goals.race_name}</span>
			<strong class="stats-strip-value">{data.stats.daysToRace ?? '—'}</strong>
		</div>
		<div class="stats-strip-item">
			<span class="stats-strip-label">{rangeActive ? data.range.label : 'Logged'}</span>
			<strong class="stats-strip-value"
				>{data.stats.totalKm}<span class="stats-strip-unit"> km</span></strong
			>
		</div>
		{#if !rangeActive}
			<div class="stats-strip-item">
				<span class="stats-strip-label">This month</span>
				<strong class="stats-strip-value"
					>{data.stats.monthRuns}<span class="stats-strip-unit">
						· {data.stats.monthKm} km</span
					></strong
				>
			</div>
			<div class="stats-strip-item">
				<span class="stats-strip-label">Last 7 days</span>
				<strong class="stats-strip-value"
					>{data.stats.weekKm}<span class="stats-strip-unit"> km</span></strong
				>
			</div>
		{:else}
			<div class="stats-strip-item">
				<span class="stats-strip-label">Runs</span>
				<strong class="stats-strip-value">{data.stats.runCount}</strong>
			</div>
		{/if}
		<div class="stats-strip-item">
			<span class="stats-strip-label">Longest</span>
			<strong class="stats-strip-value"
				>{data.stats.longestKm ?? '—'}{#if data.stats.longestKm != null}<span
						class="stats-strip-unit"
					>
						km</span
					>{/if}</strong
			>
		</div>
		<div class="stats-strip-item">
			<span class="stats-strip-label">Avg pace</span>
			<strong class="stats-strip-value"
				>{data.stats.avgPace || '—'}{#if data.stats.avgPace}<span class="stats-strip-unit"
						>/km</span
					>{/if}</strong
			>
		</div>
		<div class="stats-strip-item">
			<span class="stats-strip-label">Avg HR</span>
			<strong class="stats-strip-value">{fmt(data.stats.avgHr, 0)}</strong>
		</div>
		<div class="stats-strip-item">
			<span class="stats-strip-label">Elev gain</span>
			<strong class="stats-strip-value"
				>{data.stats.elevGain}<span class="stats-strip-unit"> m</span></strong
			>
		</div>
	</section>
	<p class="stats-meta muted">
		Shins {shinLabel(data.stats)}
		<span aria-hidden="true"> · </span>
		Tue/Fri/Sun streak {data.stats.streak || '—'}
		<span aria-hidden="true"> · </span>
		{data.stats.mappedRuns}/{data.stats.runCount} mapped
		<span aria-hidden="true"> · </span>
		Effort {fmt(data.stats.avgEffort)} / shins {fmt(data.stats.avgShins)} avg
	</p>

	{#if data.trends.series.length}
		<TrendsSection
			trends={data.trends}
			caption={rangeActive
				? `Within ${data.range.label.toLowerCase()}`
				: 'Progress over recent weeks and runs'}
		/>
	{/if}

	<section class="map-section" aria-labelledby="routes-heading">
		<div class="section-title map-section-head">
			<div>
				<h2 id="routes-heading">{rangeActive ? 'Routes in range' : 'All routes'}</h2>
				<p>
					{data.tracks.length
						? `${data.tracks.length} tracks overlaid · overlaps glow brighter`
						: rangeActive
							? 'No GPS routes in this range'
							: 'Heatmap appears when GPS routes are imported'}
				</p>
			</div>
		</div>
		<RoutesHeatmap tracks={data.tracks} />
	</section>

	{#if data.week}
		<section class="week-strip" aria-labelledby="week-heading">
			<div class="week-strip-head">
				<div>
					<h2 id="week-heading">This week · {data.week.phase}</h2>
					<p class="muted">
						Week {data.week.week} · {data.week.dates} · {data.week.focus}
						<span class="week-shoes"> · Shoes: {data.shoes.active || 'set in Context'}</span>
					</p>
				</div>
			</div>
			<div class="week-sessions">
				{#each data.week.sessions as session}
					<div class="week-session">
						<span class="week-day">{session.day}</span>
						<strong class="week-label">{session.label}</strong>
						{#if session.distance_km != null}
							<span class="week-km">{session.distance_km} km</span>
						{/if}
						<p class="muted week-detail">{session.detail}</p>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	<div class="section-title">
		<div>
			<h2>{rangeActive ? 'Runs in range' : 'Recent runs'}</h2>
			<p>
				{data.stats.runCount}
				{rangeActive ? `in ${data.range.label.toLowerCase()}` : 'total in markdown'}
			</p>
		</div>
		<div class="actions">
			<a class="btn btn-ghost" href={data.timelineHref}>Full timeline</a>
			<a class="btn btn-ghost" href="/log">Add run</a>
		</div>
	</div>

	<div class="grid">
		{#each data.runs as run, i}
			<a class="run-row" href={`/runs/${run.slug}`} style={`animation-delay:${i * 40}ms`}>
				<div>
					<strong class="run-title">
						{run.date}
						{#if run.has_map}
							<span class="map-badge" title="Route map available" aria-label="Has route map">
								<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
									<path
										fill="currentColor"
										d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"
									/>
								</svg>
							</span>
						{/if}
					</strong>
					<div class="muted">
						{run.day} · {run.session}{#if run.week != null} · W{run.week}{/if}{#if run.start_time}
							· {run.start_time}{/if}
					</div>
				</div>
				<div>{run.distance_km ?? '—'} km · {run.avg_pace || '—'}/km</div>
				<div>
					{#if run.avg_hr != null}
						HR {run.avg_hr}{#if run.max_hr != null}/{run.max_hr}{/if}
					{:else}
						Effort {run.effort ?? '—'}/10
					{/if}
				</div>
				<div>
					{#if run.elev_gain != null}
						↑ {run.elev_gain} m
					{:else}
						Shins {run.shins ?? '—'}/10
					{/if}
				</div>
			</a>
		{:else}
			<div class="panel muted">No runs yet. Log your first one.</div>
		{/each}
	</div>
{/if}
