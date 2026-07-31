<script lang="ts">
	import { dayFromIsoDate } from '$lib/format';
	import { weekNumberForDate } from '$lib/plan';

	let { data, form } = $props();

	let weather = $state('');
	let weatherManual = $state(false);
	let weatherHint = $state('');
	let dateValue = $state('');
	let startTimeValue = $state('');
	let durationValue = $state('');

	const derivedDay = $derived(dayFromIsoDate(dateValue || data.defaults.date));
	const derivedWeek = $derived(weekNumberForDate(dateValue || data.defaults.date));

	async function fetchWeather(date: string, startTime: string, duration: string) {
		if (!date || weatherManual) return;
		weatherHint = 'Fetching…';
		try {
			const params = new URLSearchParams({ date });
			if (startTime) params.set('time', startTime);
			if (duration) params.set('duration', duration);
			const res = await fetch(`/api/weather?${params}`);
			const body = (await res.json()) as { weather?: string; error?: string };
			if (!res.ok) {
				weatherHint = body.error || 'Weather unavailable';
				return;
			}
			weather = body.weather ?? '';
			weatherHint = weather ? 'From Open-Meteo (hourly) — edit anytime' : 'No weather data for this date';
		} catch {
			weatherHint = 'Weather fetch failed';
		}
	}

	$effect(() => {
		const next = dateValue || data.defaults.date;
		if (!dateValue && data.defaults.date) dateValue = data.defaults.date;
		void fetchWeather(next, startTimeValue, durationValue);
	});
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
			<input
				type="date"
				name="date"
				required
				bind:value={dateValue}
			/>
			<span class="field-hint muted"
				>{derivedDay}{#if derivedWeek != null} · week {derivedWeek}{/if}</span
			>
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
			<span>Start time</span>
			<input type="time" name="start_time" bind:value={startTimeValue} />
		</label>
		<label class="field">
			<span>Duration</span>
			<input name="time" placeholder="45:12 or 1:15:01" bind:value={durationValue} />
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
			<span>Max HR</span>
			<input name="max_hr" type="number" placeholder="172" />
		</label>
		<label class="field">
			<span>Elev gain (m)</span>
			<input name="elev_gain" type="number" step="0.1" placeholder="48" />
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
			<input
				name="weather"
				placeholder="27°C humid / cloudy"
				bind:value={weather}
				oninput={() => {
					weatherManual = true;
					weatherHint = 'Manual override';
				}}
			/>
			{#if weatherHint}
				<span class="field-hint muted">{weatherHint}</span>
			{/if}
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
