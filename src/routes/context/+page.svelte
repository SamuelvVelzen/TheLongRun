<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';

	let { data, form } = $props();
	let copied = $state<string | null>(null);
	let copyError = $state('');
	let editing = $state<string | null>(null);
	let draft = $state('');
	let openName = $state<string | null>(null);
	let saveFlash = $state('');

	const files = $derived(data.files);

	async function copyText(text: string, id: string) {
		copyError = '';
		const value = (text ?? '').trim();
		if (!value) {
			copyError = 'Nothing to copy — this file looks empty.';
			return;
		}
		try {
			await navigator.clipboard.writeText(value);
		} catch {
			const ta = document.createElement('textarea');
			ta.value = value;
			ta.style.position = 'fixed';
			ta.style.left = '-9999px';
			document.body.appendChild(ta);
			ta.select();
			document.execCommand('copy');
			ta.remove();
		}
		copied = id;
		setTimeout(() => {
			if (copied === id) copied = null;
		}, 1800);
	}

	function startEdit(name: string, body: string) {
		editing = name;
		draft = body;
		openName = name;
		saveFlash = '';
	}

	function cancelEdit() {
		editing = null;
		draft = '';
	}

	const saveEnhance =
		(name: string): SubmitFunction =>
		() => {
			const y = window.scrollY;
			return async ({ result, update }) => {
				await update({ reset: false });
				if (result.type === 'success' && result.data && 'saved' in result.data) {
					editing = null;
					draft = '';
					openName = name;
					saveFlash = String(result.data.saved);
					requestAnimationFrame(() => {
						window.scrollTo(0, y);
						document.getElementById(`ctx-${CSS.escape(name)}`)?.scrollIntoView({
							block: 'nearest'
						});
						window.scrollTo(0, y);
					});
				}
			};
		};
</script>

<section class="hero">
	<div>
		<p class="muted">Profile, plan, gear, and race notes</p>
		<h1>Context</h1>
		<p>Read the formatted docs and edit markdown when something changes.</p>
	</div>
</section>

{#if copyError}
	<div class="flash">{copyError}</div>
{/if}
{#if saveFlash || form?.saved}
	<div class="flash ok-flash">Saved {saveFlash || form?.saved}</div>
{/if}
{#if form?.message}
	<div class="flash">{form.message}</div>
{/if}

<form class="panel form" method="POST" action="?/shoes" style="margin-bottom:1.25rem">
	<h2>Current shoes</h2>
	<div class="form-grid" style="margin-top:0.8rem">
		<label class="field">
			<span>Active pair</span>
			<input name="active" value={data.shoes.active} required />
		</label>
		<label class="field">
			<span>Rotation (one per line)</span>
			<textarea name="rotation" rows="3">{data.shoes.rotation.join('\n')}</textarea>
		</label>
	</div>
	<label class="field">
		<span>Notes</span>
		<textarea name="notes" rows="3">{data.shoes.notes}</textarea>
	</label>
	<button class="btn btn-primary" type="submit">Update shoes</button>
</form>

<div class="grid">
	{#each files as file}
		<details
			id="ctx-{file.name}"
			class="panel context-card"
			open={openName === file.name || editing === file.name}
		>
			<summary>
				<span class="context-title">{file.title}</span>
				<span class="muted context-path">data/context/{file.name}</span>
			</summary>

			<div class="actions" style="margin-top:0.85rem">
				<button
					class="btn btn-ghost"
					type="button"
					onclick={() => copyText(file.body, file.name)}
				>
					{copied === file.name ? 'Copied' : 'Copy'}
				</button>
				{#if editing !== file.name}
					<button
						class="btn btn-ghost"
						type="button"
						onclick={() => startEdit(file.name, file.body)}
					>
						Edit
					</button>
				{/if}
			</div>

			{#if editing === file.name}
				<form
					class="form"
					method="POST"
					action="?/saveFile"
					style="margin-top:0.9rem"
					use:enhance={saveEnhance(file.name)}
				>
					<input type="hidden" name="name" value={file.name} />
					<label class="field">
						<span>Markdown source</span>
						<textarea name="body" class="editor" rows="18" bind:value={draft}></textarea>
					</label>
					<div class="actions">
						<button class="btn btn-primary" type="submit">Save</button>
						<button class="btn btn-ghost" type="button" onclick={cancelEdit}>Cancel</button>
					</div>
				</form>
			{:else}
				<div class="md">{@html file.html}</div>
			{/if}
		</details>
	{/each}
</div>
