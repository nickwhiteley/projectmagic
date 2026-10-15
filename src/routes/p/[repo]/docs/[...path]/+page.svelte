<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';

	let { data } = $props();
	const repo = $derived(page.params.repo!);

	// The tree: directories as headings, files beneath, in the order selectDocs gives.
	const tree = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local to the derivation
		const groups = new Map<string, string[]>();
		for (const p of data.docs) {
			const dir = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
			groups.set(dir, [...(groups.get(dir) ?? []), p]);
		}
		return [...groups].sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)));
	});
	const name = (p: string) => p.slice(p.lastIndexOf('/') + 1);
</script>

<svelte:head><title>{data.path ?? 'Docs'} · {page.data.project.name}</title></svelte:head>

<div class="docs">
	<nav class="tree" aria-label="Documents">
		<label class="label" for="ref">Branch</label>
		<select
			id="ref"
			value={data.ref}
			onchange={(e) =>
				goto(
					`/p/${repo}/docs${e.currentTarget.value === data.branches[0] ? '' : `?ref=${encodeURIComponent(e.currentTarget.value)}`}`
				)}
		>
			{#each data.branches as b (b)}<option value={b}>{b}</option>{/each}
		</select>
		{#each tree as [dir, files] (dir)}
			{#if dir}<div class="dir mono">{dir}/</div>{/if}
			{#each files as f (f)}
				<a
					class:nested={!!dir}
					href="/p/{repo}/docs/{f}{data.query}"
					aria-current={f === data.path ? 'page' : undefined}>{name(f)}</a
				>
			{/each}
		{/each}
		{#if !data.docs.length}<p class="muted small">
				No documents match this project’s <code>docs</code> setting.
			</p>{/if}
	</nav>

	{#if data.html}
		<article>
			<p class="path mono muted">
				{data.path}{#if data.ref !== data.branches[0]}
					on {data.ref}{/if} · <a href={data.githubUrl}>GitHub</a>
			</p>
			<div class="prose">{@html data.html}</div>
		</article>
		{#if data.toc.length}
			<nav class="toc" aria-label="On this page">
				<div class="label">On this page</div>
				{#each data.toc as t (t.id)}<a class="d{t.depth}" href="#{t.id}">{t.text}</a>{/each}
			</nav>
		{/if}
	{/if}
</div>

<style>
	.docs {
		display: grid;
		grid-template-columns: 15rem minmax(0, 1fr) 14rem;
		gap: 2rem;
		align-items: start;
	}
	.tree,
	.toc {
		position: sticky;
		top: 4rem;
		display: flex;
		flex-direction: column;
		gap: 1px;
		font-size: 13px;
		max-height: calc(100vh - 5rem);
		overflow-y: auto;
	}
	select {
		margin: 0.3rem 0 0.8rem;
		border: 1px solid var(--line-strong);
		background: var(--card);
		border-radius: var(--radius);
		padding: 0.25rem 0.4rem;
	}
	.dir {
		margin-top: 0.6rem;
		color: var(--text-3);
		font-size: 12px;
	}
	.tree a,
	.toc a {
		text-decoration: none;
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		color: var(--text-2);
	}
	.tree a.nested {
		padding-left: 1rem;
	}
	.tree a[aria-current='page'] {
		background: var(--surface-3);
		color: var(--text);
		font-weight: 500;
	}
	.tree a:hover,
	.toc a:hover {
		color: var(--text);
	}
	.toc a.d3 {
		padding-left: 1.1rem;
		font-size: 12.5px;
	}
	.path {
		font-size: 12px;
		margin: 0 0 1rem;
	}
	.mono {
		font-family: var(--mono);
	}
	.small {
		font-size: 12.5px;
	}
	article :global(h2),
	article :global(h3) {
		scroll-margin-top: 4.5rem;
	}
	@media (max-width: 1200px) {
		.docs {
			grid-template-columns: 13rem minmax(0, 1fr);
		}
		.toc {
			display: none;
		}
	}
	@media (max-width: 760px) {
		.docs {
			grid-template-columns: 1fr;
		}
		.tree {
			position: static;
			max-height: none;
		}
	}
</style>
