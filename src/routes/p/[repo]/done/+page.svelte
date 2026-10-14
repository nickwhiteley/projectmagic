<script lang="ts">
	import { page } from '$app/state';
	import { ago } from '#lib/format.ts';

	let { data } = $props();
	const repo = $derived(page.params.repo!);
	const pruned = $derived(data.done.filter((d) => !d.unpruned));
	const unpruned = $derived(data.done.filter((d) => d.unpruned));
</script>

<svelte:head><title>Done · {page.data.project.name}</title></svelte:head>

{#if unpruned.length}
	<h2>Done, still in the backlog</h2>
	<p class="muted small">
		Marked done in their meta lines; the agents prune these when they next tidy the backlog.
	</p>
	<ul>
		{#each unpruned as d (d.id)}
			<li id={d.id}>
				<a href="/p/{repo}/i/{encodeURIComponent(d.id)}"><code>{d.id}</code> {@html d.titleHtml}</a>
			</li>
		{/each}
	</ul>
{/if}

<h2>Shipped</h2>
<p class="muted small">
	Removed from main’s backlog, newest first. Found by walking main’s history.
</p>
{#if pruned.length}
	<ul>
		{#each pruned as d (d.id)}
			<li id={d.id}>
				<a href="/p/{repo}/i/{encodeURIComponent(d.id)}"><code>{d.id}</code> {@html d.titleHtml}</a>
				<span class="muted">
					{ago(d.at)}{#if d.commit}
						· <a href="{data.repoUrl}/commit/{d.commit}"><code>{d.commit.slice(0, 7)}</code></a
						>{/if}{#if d.pr}
						· <a href="{data.repoUrl}/pull/{d.pr}">PR #{d.pr}</a>{/if}
				</span>
			</li>
		{/each}
	</ul>
{:else}
	<p class="muted">Nothing has been removed from the backlog yet.</p>
{/if}

<style>
	h2 {
		font-size: 24px;
		margin-top: 1.5rem;
	}
	.small {
		font-size: 12.5px;
		margin-top: 0.2rem;
	}
	ul {
		list-style: none;
		padding: 0;
	}
	li {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.5rem 0.25rem;
		border-bottom: 1px solid var(--line);
		flex-wrap: wrap;
	}
	li > a {
		text-decoration: none;
	}
	.muted {
		font-size: 12.5px;
	}
</style>
