<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';

	let { children } = $props();

	const links = [
		{ href: '/', label: 'Dashboard' },
		{ href: '/timeline', label: 'Timeline' },
		{ href: '/log', label: 'Log run' },
		{ href: '/goals', label: 'Goals' },
		{ href: '/context', label: 'Context' }
	];
</script>

<svelte:head>
	<title>The Long Run</title>
	<meta name="description" content="Personal run log for Samuël" />
</svelte:head>

<div class="shell">
	<header class="nav">
		<a class="brand" href="/">The Long <span>Run</span></a>
		<nav class="nav-links">
			{#each links as link}
				<a href={link.href} class:active={page.url.pathname === link.href}>{link.label}</a>
			{/each}
		</nav>
	</header>
	{@render children()}
</div>
