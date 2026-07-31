<script lang="ts">
	let { data } = $props();
	const r = $derived(data.run);
</script>

<section class="hero">
	<div>
		<p class="muted">{r.day} · {r.session}{#if r.week != null} · week {r.week}{/if}</p>
		<h1>{r.date}</h1>
		<p>{r.notes || 'No notes for this run.'}</p>
	</div>
	<div class="actions">
		<a class="btn btn-ghost" href="/log">Log another</a>
		<a class="btn btn-ghost" href="/context">Copy context</a>
	</div>
</section>

<div class="metrics" style="margin-bottom:1.25rem">
	<div class="metric"><b>{r.distance_km ?? '—'}</b><span>km</span></div>
	<div class="metric"><b>{r.avg_pace || '—'}</b><span>pace</span></div>
	<div class="metric"><b>{r.time || '—'}</b><span>time</span></div>
	<div class="metric"><b>{r.effort ?? '—'}</b><span>effort</span></div>
	<div class="metric"><b>{r.shins ?? '—'}</b><span>shins</span></div>
	<div class="metric"><b>{r.legs ?? '—'}</b><span>legs</span></div>
	<div class="metric"><b>{r.energy ?? '—'}</b><span>energy</span></div>
	<div class="metric"><b>{r.avg_hr ?? '—'}</b><span>avg HR</span></div>
</div>

<div class="panel" style="margin-bottom:1rem">
	<div class="grid grid-2">
		<p><span class="muted">Weather</span><br />{r.weather || '—'}</p>
		<p><span class="muted">Surface</span><br />{r.surface || '—'}</p>
		<p><span class="muted">Wanted faster</span><br />
			{r.wanted_faster == null ? '—' : r.wanted_faster ? 'Yes' : 'No'}
		</p>
		<p><span class="muted">Shoes</span><br />{r.shoes || '—'}</p>
	</div>
</div>

<div class="grid grid-2">
	<div class="panel">
		<h3>Summary screenshot</h3>
		{#if r.summary_image}
			<img class="shot" style="margin-top:0.8rem" src={r.summary_image} alt="Run summary" />
		{:else}
			<p class="muted" style="margin-top:0.8rem">No summary image</p>
		{/if}
	</div>
	<div class="panel">
		<h3>Splits screenshot</h3>
		{#if r.splits_image}
			<img class="shot" style="margin-top:0.8rem" src={r.splits_image} alt="Run splits" />
		{:else}
			<p class="muted" style="margin-top:0.8rem">No splits image</p>
		{/if}
	</div>
</div>
