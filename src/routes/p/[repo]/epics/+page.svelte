<script lang="ts">
	import { page } from '$app/state';
	import StatusPill from '#lib/components/StatusPill.svelte';
	import { STATUS_ORDER } from '#lib/format.ts';

	let { data } = $props();
	const repo = $derived(page.params.repo!);
	const done = (c: Partial<Record<string, number>>) => c.done ?? 0;
	// A new item for an epic, in this repository or another (PM36): there it names `<repo>:EP3`.
	const addHref = (to: { repo: string; here: boolean }, epic: string) =>
		`/p/${to.repo}/new?epic=${encodeURIComponent(to.here ? epic : `${repo}:${epic}`)}`;
</script>

<svelte:head><title>Epics · {page.data.project.name}</title></svelte:head>

<p class="muted small">
	An epic groups items that name it with <code>Epic: EP3</code>, and items in other repositories
	that name it with <code>Epic: {repo}:EP3</code>. Counts include items that have shipped.
</p>

{#each data.epics as e (e.id)}
	<section id={e.id}>
		<h2>
			{#if e.hasItem}<a href="/p/{repo}/i/{e.id}"><code>{e.id}</code></a>{:else}<code>{e.id}</code
				>{/if}
			{e.title ?? ''}
			{#if e.status}<StatusPill status={e.status} small />{/if}
			{#if !e.declared}<span class="muted small">not declared</span>{/if}
		</h2>
		{#if e.repos > 1}<p class="muted small">Across {e.repos} repositories.</p>{/if}
		{#if e.target}<p class="muted small">Target: {e.target}</p>{/if}
		{#if e.descriptionHtml}<div class="desc">{@html e.descriptionHtml}</div>{/if}
		{#if e.total}
			<div
				class="bar"
				role="img"
				aria-label="{done(e.counts)} of {e.total} done"
				title="{done(e.counts)} of {e.total} done"
			>
				{#each STATUS_ORDER as st (st)}
					{#if e.counts[st]}<span class="seg {st.replace(' ', '-')}" style="flex: {e.counts[st]}"
						></span>{/if}
				{/each}
			</div>
			<p class="muted small">
				{done(e.counts)} of {e.total} done ·
				{#each STATUS_ORDER.filter((st) => e.counts[st] && st !== 'done') as st, i (st)}{#if i},
					{/if}{e.counts[st]}
					{st}{/each}
				· <a href="/p/{repo}?epic={e.id}&done=1">List</a> ·
				<a href="/p/{repo}/board?epic={e.id}">Board</a>
			</p>
			<ul>
				{#each e.items as i (i.id)}
					<li>
						<StatusPill status={i.status} small />
						<a href="/p/{repo}/i/{encodeURIComponent(i.id)}"><code>{i.id}</code></a>
						{@html i.titleHtml}
					</li>
				{/each}
				{#each e.shipped as d (d.id)}
					<li>
						<StatusPill status="done" small />
						<a href="/p/{repo}/done#{d.id}"><code>{d.id}</code></a>
						{d.title} <span class="muted small">shipped</span>
					</li>
				{/each}
				{#each e.elsewhere as m (`${m.repo}:${m.id}`)}
					<li>
						<StatusPill status={m.status} small />
						<a href={m.href}><code>{m.repo}:{m.id}</code></a>
						{#if m.title}{m.title}{:else}<span class="muted small"
								>in a repository you can’t open</span
							>{/if}
						{#if m.shipped}<span class="muted small">shipped</span>{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<p class="muted">No items name this epic yet.</p>
		{/if}
		{#if e.declared && data.addTo.length}
			<p class="muted small add">
				Add an item to {e.id} in
				{#each data.addTo as to, i (to.repo)}{i ? ', ' : ''}<a href={addHref(to, e.id)}>{to.name}</a
					>{/each}.
			</p>
		{/if}
	</section>
{:else}
	<p class="muted">
		No epics yet. Declare one as a <code>### EP1 Title</code> item or a <code>## EP1 Title</code>
		section in <code>backlog.md</code>, or in <code>epics.md</code> with a description and a
		<code>**Target:**</code>
		line, and join it with <code>Epic: EP1</code>.
	</p>
{/each}

{#if data.elsewhereEpics.length}
	<section>
		<h2>In other repositories’ epics</h2>
		<ul>
			{#each data.elsewhereEpics as x (x.epic)}
				<li>
					<a href={x.href}><code>{x.epic}</code></a>
					{x.title ?? ''}
					<ul class="nested">
						{#each x.items as i (i.id)}
							<li>
								<StatusPill status={i.status} small />
								<a href="/p/{repo}/i/{encodeURIComponent(i.id)}"><code>{i.id}</code></a>
								{i.title}
							</li>
						{/each}
					</ul>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	section {
		margin-bottom: 1.5rem;
	}
	h2 {
		font: 20px var(--serif);
		margin: 0 0 0.4rem;
	}
	.desc {
		margin: 0 0 0.6rem;
	}
	.desc :global(p) {
		margin: 0.2rem 0;
	}
	.small {
		font-size: 12.5px;
	}
	.bar {
		display: flex;
		height: 8px;
		border-radius: 4px;
		overflow: hidden;
		background: var(--line);
	}
	.seg {
		background: var(--st-todo);
	}
	.seg.in-progress {
		background: var(--st-progress);
	}
	.seg.in-review {
		background: var(--st-review);
	}
	.seg.blocked {
		background: var(--warn);
	}
	.seg.built {
		background: var(--st-built);
	}
	.seg.done {
		background: var(--st-done);
	}
	ul {
		list-style: none;
		padding: 0;
		margin: 0.4rem 0 0;
	}
	li {
		padding: 0.25rem 0;
		border-bottom: 1px solid var(--line);
	}
	.nested {
		margin: 0.2rem 0 0 1rem;
	}
	.nested li:last-child {
		border-bottom: 0;
	}
	.add {
		margin-top: 0.5rem;
	}
</style>
