<script lang="ts">
	let { data, form } = $props();
	const goals = $derived(form?.goals ?? data.goals);
</script>

<section class="hero">
	<div>
		<p class="muted">What the coach optimizes for</p>
		<h1>Goals</h1>
		<p>
			Success hierarchy first. Add a time goal only when training evidence supports it — the
			coach will push back if the data isn’t there yet.
		</p>
	</div>
</section>

{#if form?.saved}
	<div class="flash ok-flash">Goals saved to <code>data/context/goals.md</code></div>
{/if}
{#if form?.message}
	<div class="flash">{form.message}</div>
{/if}

<form class="panel form" method="POST">
	<div class="form-grid">
		<label class="field">
			<span>Race</span>
			<input name="race_name" value={goals.race_name} />
		</label>
		<label class="field">
			<span>Race date</span>
			<input type="date" name="race_date" value={goals.race_date} />
		</label>
		<label class="field">
			<span>Distance (km)</span>
			<input type="number" step="0.1" name="race_distance_km" value={goals.race_distance_km} />
		</label>
		<label class="field">
			<span>Time goal (optional)</span>
			<input name="time_goal" value={goals.time_goal} placeholder="e.g. 52:00 — leave blank until earned" />
		</label>
	</div>

	<label class="field">
		<span>Priority goals (one per line)</span>
		<textarea name="primary" rows="5">{goals.primary.join('\n')}</textarea>
	</label>

	<label class="field">
		<span>Notes</span>
		<textarea name="notes" rows="5">{goals.notes}</textarea>
	</label>

	<button class="btn btn-primary" type="submit">Save goals</button>
</form>
