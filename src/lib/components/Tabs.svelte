<script lang="ts">
	import { page } from '$app/state';

	let { items, label }: { items: { href: string; label: string }[]; label: string } = $props();
	const path = $derived(page.url.pathname);
	// The most specific link that matches is the current one.
	const current = $derived(
		items
			.filter((i) => path === i.href || path.startsWith(`${i.href}/`))
			.sort((a, b) => b.href.length - a.href.length)[0]?.href
	);
</script>

<nav class="tabs" aria-label={label}>
	{#each items as i (i.href)}
		<a href={i.href} aria-current={i.href === current ? 'page' : undefined}>{i.label}</a>
	{/each}
</nav>
