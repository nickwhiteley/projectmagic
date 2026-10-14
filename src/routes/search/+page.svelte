<script lang="ts">
	import StatusPill from '#lib/components/StatusPill.svelte';
	import { plural } from '#lib/format.ts';

	let { data } = $props();
</script>

<svelte:head><title>{data.q ? `${data.q} · ` : ''}Search · Project Magic</title></svelte:head>

<h1>Search</h1>
<form method="GET" role="search">
	<input
		name="q"
		type="search"
		value={data.q}
		placeholder="An id such as NW9, or words from a title or body"
		aria-label="Search"
	/>
	<button class="button">Search</button>
</form>

{#if data.q}
	<p class="muted">
		{plural(data.hits.length, 'item')} on main{data.hits.length === 100 ? ' (the first 100)' : ''}.
	</p>
	<ul>
		{#each data.hits as h (h.repo + h.id)}
			<li>
				<a href="/p/{h.repo}/i/{encodeURIComponent(h.id)}">
					<span class="pill"><StatusPill status={h.status} small /></span>
					<code>{h.id}</code>
					<span class="title">{h.title}</span>
					<span class="muted project">{h.project}</span>
				</a>
				{#if h.snippet}<p class="snippet muted">{h.snippet}</p>{/if}
			</li>
		{/each}
	</ul>
{/if}

<style>
	h1 {
		font-size: 34px;
	}
	form {
		display: flex;
		gap: 0.5rem;
		margin: 1rem 0;
		max-width: 40rem;
	}
	input {
		flex: 1;
		border: 1px solid var(--line-strong);
		background: var(--card);
		border-radius: var(--radius);
		padding: 0.45rem 0.7rem;
	}
	ul {
		list-style: none;
		padding: 0;
		max-width: 60rem;
	}
	li {
		border-bottom: 1px solid var(--line);
		padding: 0.55rem 0.25rem;
	}
	li a {
		display: flex;
		gap: 0.6rem;
		align-items: baseline;
		text-decoration: none;
	}
	.title {
		font-size: 15px;
	}
	.project {
		margin-left: auto;
		font-size: 12.5px;
		white-space: nowrap;
	}
	.snippet {
		margin: 0.25rem 0 0 4.6rem;
		font-size: 13px;
	}
</style>
