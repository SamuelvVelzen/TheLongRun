<script lang="ts">
	import { goto } from '$app/navigation';
	import { dateRangeHref, type DateRange } from '$lib/date-range';

	let {
		range,
		pathname = '/timeline'
	}: {
		range: DateRange;
		pathname?: string;
	} = $props();

	let customFrom = $state('');
	let customTo = $state('');
	let customOpen = $state(false);

	$effect(() => {
		if (range.kind === 'custom') {
			customFrom = range.from ?? '';
			customTo = range.to ?? '';
			customOpen = true;
		} else {
			customOpen = false;
		}
	});

	const presets = [
		{ kind: '7d' as const, label: 'Last 7 days' },
		{ kind: '30d' as const, label: 'Last 30 days' },
		{ kind: 'all' as const, label: 'All time' }
	];

	function applyCustom(event: Event) {
		event.preventDefault();
		const href = dateRangeHref(pathname, 'custom', customFrom, customTo);
		void goto(href, { keepFocus: true, noScroll: true });
	}

	function openCustom() {
		customOpen = true;
		if (range.kind !== 'custom') {
			customFrom = range.from ?? '';
			customTo = range.to ?? '';
		}
	}
</script>

<div class="range-filter" role="group" aria-label="Date range">
	<div class="range-presets">
		{#each presets as preset}
			<a
				class="range-chip"
				class:active={range.kind === preset.kind}
				href={dateRangeHref(pathname, preset.kind)}
				aria-current={range.kind === preset.kind ? 'page' : undefined}
			>
				{preset.label}
			</a>
		{/each}
		<button
			type="button"
			class="range-chip"
			class:active={range.kind === 'custom' || customOpen}
			aria-pressed={range.kind === 'custom' || customOpen}
			onclick={openCustom}
		>
			Custom
		</button>
	</div>

	{#if customOpen || range.kind === 'custom'}
		<form class="range-custom" onsubmit={applyCustom}>
			<label class="field range-date">
				<span>From</span>
				<input type="date" name="from" bind:value={customFrom} />
			</label>
			<label class="field range-date">
				<span>To</span>
				<input type="date" name="to" bind:value={customTo} />
			</label>
			<button class="btn btn-primary range-apply" type="submit">Apply</button>
		</form>
	{/if}
</div>
