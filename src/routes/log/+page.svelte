<script lang="ts">
	let { data, form } = $props();
</script>

<section class="hero">
	<div>
		<p class="muted">Quick capture after the watch syncs</p>
		<h1>Log a run</h1>
		<p>
			Drop the Summary + Splits screenshots, fill how it felt, done. Saved as markdown under
			<code>data/runs</code>.
		</p>
	</div>
</section>

{#if form?.message}
	<div class="flash">{form.message}</div>
{/if}

{#if data.week}
	<div class="panel" style="margin-bottom:1rem">
		<span class="tag accent">Plan week {data.week.week}</span>
		<p style="margin-top:0.6rem">
			{#each data.week.sessions as s}
				<span class="muted">{s.day}: {s.detail}. </span>
			{/each}
		</p>
	</div>
{/if}

<form class="panel form" method="POST" enctype="multipart/form-data">
	<div class="form-grid">
		<label class="field">
			<span class="req">Date</span>
			<input type="date" name="date" required value={data.defaults.date} />
		</label>
		<label class="field">
			<span class="req">Run day</span>
			<select name="day" required>
				{#each ['Tuesday', 'Friday', 'Sunday'] as day}
					<option value={day} selected={day === data.defaults.day}>{day}</option>
				{/each}
			</select>
		</label>
		<label class="field">
			<span>Week #</span>
			<input type="number" name="week" min="1" max="12" value={data.defaults.week ?? ''} />
		</label>
		<label class="field">
			<span class="req">Session</span>
			<select name="session" required>
				{#each ['easy', 'quality', 'tempo', 'steady', 'long', 'shakeout', 'race', 'other'] as s}
					<option value={s} selected={s === data.defaults.session}>{s}</option>
				{/each}
			</select>
		</label>
	</div>

	<div class="form-grid">
		<label class="field file-box">
			<span class="req">Apple Watch · Summary</span>
			<input type="file" name="summary_image" accept="image/*" />
		</label>
		<label class="field file-box">
			<span class="req">Apple Watch · Splits</span>
			<input type="file" name="splits_image" accept="image/*" />
		</label>
	</div>

	<div class="form-grid">
		<label class="field">
			<span>Distance (km)</span>
			<input name="distance_km" type="number" step="0.01" placeholder="7.04" />
		</label>
		<label class="field">
			<span>Time</span>
			<input name="time" placeholder="45:12 or 1:15:01" />
		</label>
		<label class="field">
			<span>Avg pace /km</span>
			<input name="avg_pace" placeholder="6:29" />
		</label>
		<label class="field">
			<span>Avg HR</span>
			<input name="avg_hr" type="number" placeholder="147" />
		</label>
		<label class="field">
			<span>Cadence</span>
			<input name="cadence" type="number" placeholder="176" />
		</label>
		<label class="field">
			<span>Shoes</span>
			<input name="shoes" value={data.shoes.active} />
		</label>
	</div>

	<div class="form-grid">
		<label class="field">
			<span class="req">Effort (1–10)</span>
			<input name="effort" type="number" min="1" max="10" required />
		</label>
		<label class="field">
			<span class="req">Shins (0–10)</span>
			<input name="shins" type="number" min="0" max="10" required />
		</label>
		<label class="field">
			<span class="req">Legs (0–10)</span>
			<input name="legs" type="number" min="0" max="10" required />
		</label>
		<label class="field">
			<span class="req">Energy (1–10)</span>
			<input name="energy" type="number" min="1" max="10" required />
		</label>
		<label class="field">
			<span>Weather</span>
			<input name="weather" placeholder="27C humid / cloudy" />
		</label>
		<label class="field">
			<span>Surface</span>
			<input name="surface" placeholder="asphalt / mixed / trail" value="asphalt" />
		</label>
		<label class="field">
			<span>Wanted to go faster?</span>
			<select name="wanted_faster">
				<option value="">—</option>
				<option value="Y">Y</option>
				<option value="N">N</option>
			</select>
		</label>
	</div>

	<label class="field">
		<span>Notes</span>
		<textarea name="notes" placeholder="How it felt, route, heat, motorcycle/gym fatigue…"></textarea>
	</label>

	<div class="actions">
		<button class="btn btn-primary" type="submit">Save run</button>
		<a class="btn btn-ghost" href="/">Cancel</a>
	</div>
</form>
