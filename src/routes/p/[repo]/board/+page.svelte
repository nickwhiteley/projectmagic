<script lang="ts">
	import { page } from '$app/state';
	import StatusPill from '#lib/components/StatusPill.svelte';
	import { ago } from '#lib/format.ts';

	let { data } = $props();
	const repo = $derived(page.params.repo!);
	const totals = $derived(
		data.columns.map((_, i) => data.lanes.reduce((n, l) => n + l.cells[i].length, 0))
	);
</script>

<svelte:head><title>Board · {page.data.project.name}</title></svelte:head>

<p class="muted small">
	Columns come from the files and branches, so cards move when the work does. Lanes are the
	backlog’s sections, in order.
</p>

<div class="board" style="--cols: {data.columns.length}">
	<div class="colheads">
		{#each data.columns as c, i (c)}
			<div>
				<StatusPill status={c} />
				<span class="muted">{c === 'done' ? totals[i] + data.shipped.length : totals[i]}</span>
			</div>
		{/each}
	</div>
	{#each data.lanes as lane (lane.title)}
		<details open class="lane">
			<summary
				>{lane.title}
				<span class="muted">{lane.cells.reduce((n, c) => n + c.length, 0)}</span></summary
			>
			<div class="cells">
				{#each lane.cells as cell, i (i)}
					<div class="cell">
						{#each cell as it (it.id)}
							<a class="card" href="/p/{repo}/i/{encodeURIComponent(it.id)}">
								<div class="top">
									<span class="id">{it.id}</span>{#if it.star}<span class="star">★</span>{/if}
									<span class="tags">
										{#if it.pending}<span class="tag pending">pending</span>{/if}
										{#if it.job}<span class="tag">{it.job}</span>{/if}
										{#if it.size}<span class="tag mono">{it.size}</span>{/if}
									</span>
								</div>
								<div class="title">{@html it.titleHtml}</div>
								{#if it.waitingHtml && (it.status === 'blocked' || it.status === 'built' || it.blocked)}
									<div class="waiting {it.status}">{@html it.waitingHtml}</div>
								{/if}
								<div class="source">{it.source}</div>
							</a>
						{/each}
					</div>
				{/each}
			</div>
		</details>
	{/each}
	{#if data.shipped.length}
		<details open class="lane">
			<summary>Shipped in the last 30 days <span class="muted">{data.shipped.length}</span></summary
			>
			<div class="cells">
				{#each data.columns as c (c)}
					<div class="cell">
						{#if c === 'done'}
							{#each data.shipped as d (d.id)}
								<a class="card" href="/p/{repo}/done#{d.id}">
									<div class="top"><span class="id">{d.id}</span></div>
									<div class="title">{d.title}</div>
									<div class="source">{ago(d.at)}</div>
								</a>
							{/each}
						{/if}
					</div>
				{/each}
			</div>
		</details>
	{/if}
</div>

<style>
	.small {
		font-size: 12.5px;
		margin-top: 0;
	}
	.board {
		overflow-x: auto;
	}
	.colheads,
	.cells {
		display: grid;
		grid-template-columns: repeat(var(--cols), minmax(13rem, 1fr));
		gap: 0.6rem;
		min-width: calc(var(--cols) * 13.6rem);
	}
	.colheads {
		padding: 0.5rem 0;
		font-size: 13px;
	}
	.lane {
		margin: 0.5rem 0 1rem;
	}
	.lane summary {
		font: 20px var(--serif);
		cursor: pointer;
		padding: 0.3rem 0;
		border-top: 1px solid var(--line);
	}
	.lane summary .muted {
		font: 12px var(--sans);
	}
	.cell {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-height: 2rem;
		background: var(--surface-1);
		border-radius: var(--radius);
		padding: 0.4rem;
	}
	.card {
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 0.55rem 0.6rem;
		text-decoration: none;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.card:hover {
		border-color: var(--line-strong);
	}
	.top {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}
	.id {
		font: 500 12px var(--mono);
	}
	.star {
		color: var(--warn);
	}
	.tags {
		margin-left: auto;
		display: flex;
		gap: 0.25rem;
	}
	.tag {
		font: 600 10px/15px var(--sans);
		border: 1px solid var(--line-strong);
		border-radius: 4px;
		padding: 0 0.3rem;
		color: var(--text-2);
	}
	.tag.mono {
		font-family: var(--mono);
		font-weight: 500;
	}
	.tag.pending {
		border-color: var(--accent);
		color: var(--accent);
	}
	.title {
		font: 15px/1.35 var(--serif);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.waiting {
		font-size: 12px;
		color: var(--warn);
	}
	.waiting.built {
		color: var(--st-built);
	}
	.source {
		font-size: 11.5px;
		color: var(--text-3);
	}
</style>
