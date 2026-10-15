<script lang="ts">
	import { ago } from '#lib/format.ts';

	let { data } = $props();
</script>

<svelte:head><title>Activity · Project Magic</title></svelte:head>

<h1>Activity</h1>
<p class="muted">
	The last 14 days across every project, grouped by the item each was about: the latest commit on
	each active branch, and items that shipped.
</p>

{#each data.groups as g (g.repo + (g.itemId ?? ''))}
	<section>
		<h2>
			<a href="/p/{g.repo}">{g.project}</a>
			{#if g.itemId}
				<a href="/p/{g.repo}/i/{encodeURIComponent(g.itemId)}"><code>{g.itemId}</code></a>
				{g.itemTitle ?? ''}
			{:else}
				<span class="muted">not linked to an item</span>
			{/if}
		</h2>
		<ul>
			{#each g.events as e (e.at + e.text + e.branch)}
				<li>
					<span class="muted small">{ago(e.at, data.now)}</span>
					{#if e.kind === 'shipped'}<strong>{e.text}</strong>{:else}{e.text}{/if}
					{#if e.branch}<code class="small">{e.branch}</code>{/if}
					{#if e.pr}<span class="muted small">PR #{e.pr}</span>{/if}
				</li>
			{/each}
		</ul>
	</section>
{:else}
	<p class="muted">Nothing in the last 14 days.</p>
{/each}

<style>
	section {
		margin-bottom: 1.2rem;
	}
	h2 {
		font: 18px var(--serif);
		margin: 0 0 0.3rem;
	}
	ul {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	li {
		padding: 0.25rem 0;
		border-bottom: 1px solid var(--line);
	}
	.small {
		font-size: 12.5px;
	}
</style>
