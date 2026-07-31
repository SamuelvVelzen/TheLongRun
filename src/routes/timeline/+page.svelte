<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import DateRangeFilter from '$lib/components/DateRangeFilter.svelte';
	import TrendsSection from '$lib/components/TrendsSection.svelte';
	import { dateRangeHref } from '$lib/date-range';

	let { data } = $props();

	function confirmDelete(event: Event, label: string) {
		if (!confirm(`Delete run ${label}? This cannot be undone.`)) {
			event.preventDefault();
		}
	}

	function fmtHr(n: number | null) {
		if (n == null) return '—';
		return Math.round(n).toString();
	}

	const filteredEmpty = $derived(data.totalAllTime > 0 && !data.groups.length);
	const neverLogged = $derived(data.totalAllTime === 0);
</script>

<section class="hero">
	<div>
		<p class="muted">
			{data.runCount} runs · {data.totalKm} km
			{#if data.avgPace}· avg {data.avgPace}/km{/if}
			{#if data.avgHr != null}· HR {fmtHr(data.avgHr)}{/if}
			{#if data.range.kind !== 'all'}
				· {data.range.label}
			{/if}
		</p>
		<h1>Timeline</h1>
		<p>Every run in order — open one for screenshots, notes and full metrics.</p>
	</div>
	<div class="actions">
		<a class="btn btn-primary" href="/log">Log a run</a>
	</div>
</section>

<DateRangeFilter range={data.range} pathname="/timeline" />

{#if neverLogged}
	<div class="panel muted">No runs yet.</div>
{:else if filteredEmpty}
	<div class="panel muted range-empty">
		<p>No runs in {data.range.label.toLowerCase()}.</p>
		<a class="btn btn-ghost" href={dateRangeHref('/timeline', 'all')}>Show all time</a>
	</div>
{:else}
	{#if data.trends?.series.length}
		<TrendsSection
			trends={data.trends}
			caption={`Within ${data.range.label.toLowerCase()}`}
		/>
	{/if}

	{#each data.groups as group}
		<div class="section-title">
			<div>
				<h2>{group.label}</h2>
				<p>{group.runs.length} runs · {group.totalKm} km</p>
			</div>
		</div>

		<div class="timeline">
			{#each group.runs as run, i}
				<div class="timeline-item" style={`animation-delay:${i * 35}ms`}>
					<div class="timeline-rail" aria-hidden="true">
						<span class="timeline-dot"></span>
					</div>
					<div class="timeline-card">
						<a class="timeline-link" href={`/runs/${run.slug}`}>
							<div class="timeline-head">
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
								<span class="tag">{run.day}</span>
								<span class="tag accent">{run.session}</span>
								{#if run.week != null}
									<span class="tag">W{run.week}</span>
								{/if}
							</div>
							<div class="timeline-metrics">
								<span>{run.distance_km ?? '—'} km</span>
								<span>{run.avg_pace || '—'}/km</span>
								{#if run.start_time}<span>start {run.start_time}</span>{/if}
								{#if run.time}<span>{run.time}</span>{/if}
								{#if run.avg_hr != null}
									<span>HR {run.avg_hr}{#if run.max_hr != null}/{run.max_hr}{/if}</span>
								{/if}
								{#if run.elev_gain != null}<span>↑ {run.elev_gain} m</span>{/if}
								<span>Effort {run.effort ?? '—'}</span>
								<span>Shins {run.shins ?? '—'}</span>
								{#if run.energy != null}<span>Energy {run.energy}</span>{/if}
							</div>
							{#if run.notes}
								<p class="muted timeline-notes">{run.notes}</p>
							{/if}
						</a>
						<form
							class="timeline-delete"
							method="POST"
							action="?/delete"
							use:enhance={() => {
								return async ({ result }) => {
									if (result.type === 'success') await invalidateAll();
								};
							}}
						>
							<input type="hidden" name="slug" value={run.slug} />
							<button
								class="btn btn-ghost btn-danger btn-icon"
								type="submit"
								aria-label={`Delete run ${run.date}`}
								title="Delete run"
								onclick={(e) => confirmDelete(e, `${run.date} (${run.day})`)}
							>
								<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
									<path
										fill="currentColor"
										d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9zm-1 12h12l1-12H5l1 12z"
									/>
								</svg>
							</button>
						</form>
					</div>
				</div>
			{/each}
		</div>
	{/each}
{/if}
