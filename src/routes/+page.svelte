<script lang="ts">
	let { data } = $props();

	function fmt(n: number | null, digits = 1) {
		if (n == null) return '—';
		return n.toFixed(digits);
	}
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

<div class="grid grid-3">
	<div class="stat">
		<div class="label">Days to {data.goals.race_name}</div>
		<div class="value">{data.stats.daysToRace ?? '—'}</div>
	</div>
	<div class="stat">
		<div class="label">Logged distance</div>
		<div class="value">{data.stats.totalKm}<span style="font-size:1rem"> km</span></div>
	</div>
	<div class="stat">
		<div class="label">Avg effort / shins</div>
		<div class="value">{fmt(data.stats.avgEffort)} / {fmt(data.stats.avgShins)}</div>
	</div>
</div>

{#if data.week}
	<div class="section-title">
		<div>
			<h2>This week · {data.week.phase}</h2>
			<p>Week {data.week.week} · {data.week.dates} · {data.week.focus}</p>
		</div>
		<span class="tag accent">Shoes: {data.shoes.active || 'set in Context'}</span>
	</div>
	<div class="grid grid-3">
		{#each data.week.sessions as session}
			<div class="panel">
				<div class="tag">{session.day}</div>
				<h3 style="margin-top:0.7rem">{session.label}</h3>
				<p class="muted" style="margin-top:0.45rem">{session.detail}</p>
				{#if session.distance_km != null}
					<p style="margin-top:0.7rem"><b>{session.distance_km} km</b></p>
				{/if}
			</div>
		{/each}
	</div>
{/if}

<div class="section-title">
	<div>
		<h2>Recent runs</h2>
		<p>{data.stats.runCount} total in markdown</p>
	</div>
	<div class="actions">
		<a class="btn btn-ghost" href="/timeline">Full timeline</a>
		<a class="btn btn-ghost" href="/log">Add run</a>
	</div>
</div>

<div class="grid">
	{#each data.runs as run, i}
		<a class="run-row" href={`/runs/${run.slug}`} style={`animation-delay:${i * 40}ms`}>
			<div>
				<strong>{run.date}</strong>
				<div class="muted">{run.day} · {run.session}{#if run.week != null} · W{run.week}{/if}</div>
			</div>
			<div>{run.distance_km ?? '—'} km · {run.avg_pace || '—'}/km</div>
			<div>Effort {run.effort ?? '—'}/10</div>
			<div>Shins {run.shins ?? '—'}/10</div>
		</a>
	{:else}
		<div class="panel muted">No runs yet. Log your first one.</div>
	{/each}
</div>
