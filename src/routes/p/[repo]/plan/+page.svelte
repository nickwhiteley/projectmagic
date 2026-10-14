<script lang="ts">
	import { page } from '$app/state';
	import StatusPill from '#lib/components/StatusPill.svelte';

	let { data } = $props();
	const repo = $derived(page.params.repo!);
</script>

<svelte:head><title>Plan · {page.data.project.name}</title></svelte:head>

<div class="layout">
	<div>
		{#each data.groups as g (g.title)}
			{@const complete = g.done === g.total}
			<details class="group" open={!complete || undefined}>
				<summary>
					<h2>{g.title ?? 'Plan'}</h2>
					<span class="muted">{g.done} of {g.total} done</span>
					<span class="bar"
						><span style="width: {(100 * g.done) / Math.max(1, g.total)}%"></span></span
					>
				</summary>
				<ol>
					{#each g.tasks as t (t.number)}
						<li id="task-{t.number}" class:next={t.number === data.next}>
							<code class="num">{t.number}</code>
							<div class="text">
								<div class="title">{@html t.titleHtml}</div>
								{#if t.noteHtml}<div class="note">{@html t.noteHtml}</div>{/if}
								{#if t.items.length}
									<div class="chips">
										{#each t.items as id (id)}<a
												class="chip"
												href="/p/{repo}/i/{encodeURIComponent(id)}">{id}</a
											>{/each}
									</div>
								{/if}
							</div>
							<span class="pill"><StatusPill status={t.status} /></span>
						</li>
					{/each}
				</ol>
			</details>
		{/each}
		{#if data.history.length}
			<details class="group">
				<summary
					><h2>Earlier tables</h2>
					<span class="muted">{data.history.length} rows a later table renumbered</span></summary
				>
				<ol>
					{#each data.history as t (t.line)}
						<li class="old">
							<code class="num">{t.number}</code>
							<div class="text"><div class="title">{@html t.titleHtml}</div></div>
							<span class="pill"><StatusPill status={t.status} small /></span>
						</li>
					{/each}
				</ol>
			</details>
		{/if}
	</div>
	<aside>
		<div class="label">Disagreements</div>
		{#if data.disagreements.length}
			<ul>
				{#each data.disagreements as d (d)}<li>{d}</li>{/each}
			</ul>
			<p class="muted small">
				Shown, never resolved: the backlog and the plan are both edited by hand.
			</p>
		{:else}
			<p class="muted small">The backlog and the plan agree.</p>
		{/if}
		{#if data.unknown.length}
			<div class="label">Unreadable status cells</div>
			<p class="small">Tasks {data.unknown.join(', ')}</p>
		{/if}
	</aside>
</div>

<style>
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 17rem;
		gap: 2rem;
		align-items: start;
	}
	.group {
		margin-bottom: 1rem;
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: 0.6rem 1rem;
	}
	summary {
		display: flex;
		align-items: center;
		gap: 1rem;
		cursor: pointer;
		flex-wrap: wrap;
	}
	h2 {
		font-size: 22px;
		margin-right: auto;
	}
	summary .muted {
		font-size: 13px;
	}
	.bar {
		width: 8rem;
		height: 5px;
		background: var(--surface-3);
		border-radius: 3px;
		overflow: hidden;
	}
	.bar span {
		display: block;
		height: 100%;
		background: var(--st-done);
	}
	ol {
		list-style: none;
		padding: 0;
		margin: 0.6rem 0 0.2rem;
	}
	li {
		display: grid;
		grid-template-columns: 3.5rem 1fr auto;
		gap: 0.75rem;
		padding: 0.55rem 0.3rem;
		border-top: 1px solid var(--line);
		scroll-margin-top: 5rem;
	}
	li:target {
		background: var(--warn-bg);
	}
	li.next {
		box-shadow: inset 3px 0 var(--st-progress);
	}
	li.old {
		opacity: 0.7;
	}
	.num {
		font-size: 13px;
		padding-top: 0.1rem;
	}
	.title {
		font-size: 14px;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.note {
		font-size: 12.5px;
		color: var(--text-3);
		margin-top: 0.2rem;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.chips {
		margin-top: 0.3rem;
		display: flex;
		gap: 0.3rem;
	}
	.chip {
		font: 500 11.5px var(--mono);
		text-decoration: none;
		background: var(--surface-3);
		padding: 0 0.4rem;
		border-radius: 4px;
	}
	aside {
		position: sticky;
		top: 4rem;
		background: var(--surface-1);
		border-radius: 10px;
		padding: 0.9rem 1rem;
		font-size: 13px;
	}
	aside ul {
		padding-left: 1rem;
		margin: 0.5rem 0;
	}
	aside li {
		display: list-item;
		border: 0;
		padding: 0.2rem 0;
	}
	.small {
		font-size: 12.5px;
	}
	@media (max-width: 1000px) {
		.layout {
			grid-template-columns: 1fr;
		}
		aside {
			position: static;
		}
	}
</style>
