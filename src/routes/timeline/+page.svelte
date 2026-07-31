<script lang="ts">
	let { data } = $props();
</script>

<section class="hero">
	<div>
		<p class="muted">{data.runCount} runs · {data.totalKm} km logged</p>
		<h1>Timeline</h1>
		<p>Every run in order — open one for screenshots, notes and full metrics.</p>
	</div>
	<div class="actions">
		<a class="btn btn-primary" href="/log">Log a run</a>
	</div>
</section>

{#if !data.groups.length}
	<div class="panel muted">No runs yet.</div>
{:else}
	{#each data.groups as group}
		<div class="section-title">
			<div>
				<h2>{group.label}</h2>
				<p>{group.runs.length} runs · {group.totalKm} km</p>
			</div>
		</div>

		<div class="timeline">
			{#each group.runs as run, i}
				<a
					class="timeline-item"
					href={`/runs/${run.slug}`}
					style={`animation-delay:${i * 35}ms`}
				>
					<div class="timeline-rail" aria-hidden="true">
						<span class="timeline-dot"></span>
					</div>
					<div class="timeline-card">
						<div class="timeline-head">
							<strong>{run.date}</strong>
							<span class="tag">{run.day}</span>
							<span class="tag accent">{run.session}</span>
							{#if run.week != null}
								<span class="tag">W{run.week}</span>
							{/if}
						</div>
						<div class="timeline-metrics">
							<span>{run.distance_km ?? '—'} km</span>
							<span>{run.avg_pace || '—'}/km</span>
							<span>Effort {run.effort ?? '—'}</span>
							<span>Shins {run.shins ?? '—'}</span>
							{#if run.energy != null}<span>Energy {run.energy}</span>{/if}
						</div>
						{#if run.notes}
							<p class="muted timeline-notes">{run.notes}</p>
						{/if}
					</div>
				</a>
			{/each}
		</div>
	{/each}
{/if}
