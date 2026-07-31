<script lang="ts">
	import RouteMap from '$lib/components/RouteMap.svelte';
	import SplitsPanel from '$lib/components/SplitsPanel.svelte';
	import { dayFromIsoDate } from '$lib/format';
	import { weekNumberForDate } from '$lib/plan';

	let { data, form } = $props();
	const r = $derived(data.run);
	const analytics = $derived(data.analytics);

	let editing = $state(false);
	let editDate = $state('');

	$effect(() => {
		if (form?.message) {
			editing = true;
			if (!editDate) editDate = r.date;
		}
	});

	const derivedDay = $derived(dayFromIsoDate(editDate || r.date));
	const derivedWeek = $derived(weekNumberForDate(editDate || r.date));

	function startEditing() {
		editDate = r.date;
		editing = true;
	}

	function cancelEditing() {
		editing = false;
		editDate = r.date;
	}

	function confirmDelete(event: Event) {
		if (!confirm(`Delete run ${r.date} (${r.day})? This cannot be undone.`)) {
			event.preventDefault();
		}
	}

	const hrFill = $derived(
		r.avg_hr != null && r.max_hr != null && r.max_hr > 0
			? Math.min(100, Math.round((r.avg_hr / r.max_hr) * 100))
			: null
	);

	const wantedValue = $derived(
		r.wanted_faster === true ? 'Y' : r.wanted_faster === false ? 'N' : ''
	);
</script>

<section class="hero">
	<div>
		<p class="muted">
			{r.day} · {r.session}{#if r.week != null} · week {r.week}{/if}{#if r.start_time}
				· started {r.start_time}{/if}
		</p>
		<h1 class="run-title">
			{r.date}
			{#if r.has_map}
				<span class="map-badge map-badge-lg" title="Route map available" aria-label="Has route map">
					<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
						<path
							fill="currentColor"
							d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"
						/>
					</svg>
				</span>
			{/if}
		</h1>
		{#if !editing}
			<p>{r.notes || 'No notes for this run.'}</p>
		{/if}
	</div>
	<div class="actions">
		{#if !editing}
			<button
				class="btn btn-ghost btn-icon"
				type="button"
				aria-label="Edit run"
				title="Edit run"
				onclick={startEditing}
			>
				<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
					<path
						fill="currentColor"
						d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"
					/>
				</svg>
			</button>
			<form method="POST" action="?/delete">
				<button
					class="btn btn-ghost btn-danger btn-icon"
					type="submit"
					aria-label={`Delete run ${r.date}`}
					title="Delete run"
					onclick={confirmDelete}
				>
					<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
						<path
							fill="currentColor"
							d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9zm-1 12h12l1-12H5l1 12z"
						/>
					</svg>
				</button>
			</form>
			<a class="btn btn-ghost" href="/log">Log another</a>
			<a class="btn btn-ghost" href="/import">Import FIT</a>
			<a class="btn btn-ghost" href="/context">Copy context</a>
		{/if}
	</div>
</section>

{#if form?.message}
	<div class="flash">{form.message}</div>
{/if}

{#if editing}
	<form class="panel form" method="POST" action="?/update">
		<div class="form-grid">
			<label class="field">
				<span class="req">Date</span>
				<input type="date" name="date" required bind:value={editDate} />
				<span class="field-hint muted"
					>{derivedDay}{#if derivedWeek != null} · week {derivedWeek}{/if}</span
				>
			</label>
			<label class="field">
				<span class="req">Session</span>
				<select name="session" required>
					{#each ['easy', 'quality', 'tempo', 'steady', 'long', 'shakeout', 'race', 'other'] as s}
						<option value={s} selected={s === r.session}>{s}</option>
					{/each}
				</select>
			</label>
		</div>

		<div class="form-grid">
			<label class="field">
				<span>Distance (km)</span>
				<input name="distance_km" type="number" step="0.01" value={r.distance_km ?? ''} />
			</label>
			<label class="field">
				<span>Start time</span>
				<input type="time" name="start_time" value={r.start_time || ''} />
			</label>
			<label class="field">
				<span>Duration</span>
				<input name="time" placeholder="45:12 or 1:15:01" value={r.time || ''} />
			</label>
			<label class="field">
				<span>Avg pace /km</span>
				<input name="avg_pace" placeholder="6:29" value={r.avg_pace || ''} />
			</label>
			<label class="field">
				<span>Avg HR</span>
				<input name="avg_hr" type="number" value={r.avg_hr ?? ''} />
			</label>
			<label class="field">
				<span>Max HR</span>
				<input name="max_hr" type="number" value={r.max_hr ?? ''} />
			</label>
			<label class="field">
				<span>Elev gain (m)</span>
				<input name="elev_gain" type="number" step="0.1" value={r.elev_gain ?? ''} />
			</label>
			<label class="field">
				<span>Cadence</span>
				<input name="cadence" type="number" value={r.cadence ?? ''} />
			</label>
			<label class="field">
				<span>Shoes</span>
				<input name="shoes" value={r.shoes || ''} />
			</label>
		</div>

		<div class="form-grid">
			<label class="field">
				<span>Effort (1–10)</span>
				<input name="effort" type="number" min="1" max="10" value={r.effort ?? ''} />
			</label>
			<label class="field">
				<span>Shins (0–10)</span>
				<input name="shins" type="number" min="0" max="10" value={r.shins ?? ''} />
			</label>
			<label class="field">
				<span>Legs (0–10)</span>
				<input name="legs" type="number" min="0" max="10" value={r.legs ?? ''} />
			</label>
			<label class="field">
				<span>Energy (1–10)</span>
				<input name="energy" type="number" min="1" max="10" value={r.energy ?? ''} />
			</label>
			<label class="field">
				<span>Weather</span>
				<input name="weather" placeholder="27°C humid / cloudy" value={r.weather || ''} />
			</label>
			<label class="field">
				<span>Surface</span>
				<input name="surface" placeholder="asphalt / mixed / trail" value={r.surface || ''} />
			</label>
			<label class="field">
				<span>Wanted to go faster?</span>
				<select name="wanted_faster">
					<option value="" selected={wantedValue === ''}>—</option>
					<option value="Y" selected={wantedValue === 'Y'}>Y</option>
					<option value="N" selected={wantedValue === 'N'}>N</option>
				</select>
			</label>
		</div>

		<label class="field">
			<span>Notes</span>
			<textarea name="notes" placeholder="How it felt, route, heat, motorcycle/gym fatigue…">{r.notes}</textarea>
		</label>

		<div class="actions">
			<button class="btn btn-primary" type="submit">Save changes</button>
			<button class="btn btn-ghost" type="button" onclick={cancelEditing}>Cancel</button>
		</div>
	</form>
{:else}
	<div class="metrics metrics-primary" style="margin-bottom:0.75rem">
		<div class="metric metric-emph">
			<b>{r.distance_km ?? '—'}</b><span>km</span>
		</div>
		<div class="metric metric-emph">
			<b>{r.avg_pace || '—'}</b><span>pace /km</span>
		</div>
		<div class="metric metric-emph">
			<b>{r.time || '—'}</b><span>moving</span>
		</div>
		{#if r.elapsed_time && r.elapsed_time !== r.time}
			<div class="metric"><b>{r.elapsed_time}</b><span>elapsed</span></div>
		{/if}
	</div>

	<div class="metrics" style="margin-bottom:1.25rem">
		{#if r.avg_hr != null || r.max_hr != null}
			<div class="metric metric-hr">
				<div class="metric-hr-vals">
					<b>{r.avg_hr ?? '—'}</b>
					<span class="metric-hr-sep">/</span>
					<strong class="metric-hr-max">{r.max_hr ?? '—'}</strong>
				</div>
				<span>HR avg / max</span>
				{#if hrFill != null}
					<div class="hr-bar" aria-hidden="true">
						<div class="hr-bar-fill" style={`width:${hrFill}%`}></div>
					</div>
				{/if}
			</div>
		{:else}
			<div class="metric"><b>—</b><span>HR</span></div>
		{/if}
		<div class="metric"><b>{r.elev_gain != null ? r.elev_gain : '—'}</b><span>elev m</span></div>
		<div class="metric"><b>{r.cadence ?? '—'}</b><span>cadence</span></div>
		{#if r.calories != null}
			<div class="metric"><b>{r.calories}</b><span>kcal</span></div>
		{/if}
		{#if r.kilojoules != null}
			<div class="metric"><b>{r.kilojoules}</b><span>kJ</span></div>
		{/if}
		{#if r.max_speed != null}
			<div class="metric"><b>{r.max_speed}</b><span>max km/h</span></div>
		{/if}
		<div class="metric"><b>{r.effort ?? '—'}</b><span>effort</span></div>
		<div class="metric"><b>{r.shins ?? '—'}</b><span>shins</span></div>
		<div class="metric"><b>{r.legs ?? '—'}</b><span>legs</span></div>
		<div class="metric"><b>{r.energy ?? '—'}</b><span>energy</span></div>
	</div>

	{#if r.route}
		<div class="panel" style="margin-bottom:1rem;padding:0;overflow:hidden">
			<div style="padding:1.1rem 1.2rem 0.6rem">
				<h3>Route</h3>
			</div>
			<RouteMap routeUrl={r.route} kmMarkers={analytics?.kmMarkers ?? null} />
		</div>
	{/if}

	{#if analytics && (analytics.splits.length || analytics.hrZones)}
		<SplitsPanel {analytics} />
	{/if}

	<div class="panel" style="margin-bottom:1rem">
		<div class="grid grid-2">
			<p><span class="muted">Weather</span><br />{r.weather || '—'}</p>
			<p><span class="muted">Surface</span><br />{r.surface || '—'}</p>
			<p><span class="muted">Wanted faster</span><br />
				{r.wanted_faster == null ? '—' : r.wanted_faster ? 'Yes' : 'No'}
			</p>
			<p><span class="muted">Shoes</span><br />{r.shoes || '—'}</p>
			{#if r.start_time}
				<p><span class="muted">Start time</span><br />{r.start_time}</p>
			{/if}
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
{/if}
