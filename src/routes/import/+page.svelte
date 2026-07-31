<script lang="ts">
	let { form } = $props();
</script>

<section class="hero">
	<div>
		<p class="muted">Strava bulk export</p>
		<h1>Import FIT</h1>
		<p>
			Upload <code>.fit.gz</code> / <code>.fit</code> files or a zip of
			<code>activities/</code>. Runs are matched by Strava activity id (via
			<code>activities.csv</code>) and routes are attached without duplicating existing
			markdown.
		</p>
	</div>
</section>

{#if form?.message}
	<div class="flash" class:ok-flash={form.ok}>{form.message}</div>
{/if}

<form class="panel form" method="POST" enctype="multipart/form-data">
	<label class="field file-box">
		<span>FIT files</span>
		<input type="file" name="fit_files" accept=".fit,.fit.gz,application/gzip" multiple />
		<span class="muted" style="font-size:0.85rem">One or more <code>.fit</code> / <code>.fit.gz</code></span>
	</label>

	<label class="field file-box">
		<span>Export zip (optional)</span>
		<input type="file" name="zip" accept=".zip,application/zip" />
		<span class="muted" style="font-size:0.85rem"
			>Strava export or <code>activities/*.fit.gz</code> zip. Includes
			<code>activities.csv</code> when present for id matching.</span
		>
	</label>

	<label class="field file-box">
		<span>activities.csv (optional)</span>
		<input type="file" name="activities_csv" accept=".csv,text/csv" />
		<span class="muted" style="font-size:0.85rem"
			>Maps FIT filenames → Strava Activity IDs so routes attach to CSV-imported runs.</span
		>
	</label>

	<label class="field" style="display:flex;align-items:center;gap:0.6rem;color:var(--text)">
		<input type="hidden" name="runs_only" value="0" />
		<input type="checkbox" name="runs_only" value="1" checked style="width:auto" />
		<span>Runs only — skip walks, rides, and other sports</span>
	</label>

	<div class="actions">
		<button class="btn btn-primary" type="submit">Import</button>
		<a class="btn btn-ghost" href="/timeline">Timeline</a>
	</div>
</form>

{#if form?.summary}
	<div class="panel" style="margin-top:1rem">
		<h3>Results</h3>
		<div class="metrics" style="margin:0.85rem 0">
			<div class="metric"><b>{form.summary.created}</b><span>created</span></div>
			<div class="metric"><b>{form.summary.updated}</b><span>updated</span></div>
			<div class="metric"><b>{form.summary.skipped}</b><span>skipped</span></div>
			<div class="metric"><b>{form.summary.errors}</b><span>errors</span></div>
		</div>
		<ul class="import-list">
			{#each form.summary.items as item}
				<li>
					<span class="tag" class:accent={item.status === 'created' || item.status === 'updated'}
						>{item.status}</span
					>
					<code>{item.filename}</code>
					{#if item.slug}
						→ <a href="/runs/{item.slug}">{item.slug}</a>
					{/if}
					{#if item.reason}
						<span class="muted">— {item.reason}</span>
					{/if}
					{#if item.points}
						<span class="muted">({item.points} pts)</span>
					{/if}
				</li>
			{/each}
		</ul>
	</div>
{/if}

<style>
	.import-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.55rem;
		font-size: 0.92rem;
	}

	.import-list li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.45rem;
		padding: 0.55rem 0;
		border-bottom: 1px solid var(--line);
	}

	.import-list li:last-child {
		border-bottom: 0;
	}
</style>
