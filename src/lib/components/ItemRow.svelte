<script lang="ts">
	import StatusPill from './StatusPill.svelte';
	import type { Row } from '#lib/server/item-view.ts';

	let { item, repo }: { item: Row; repo: string } = $props();
</script>

<details class="row">
	<summary>
		<span class="pill"><StatusPill status={item.status} /></span>
		<span class="title">
			<a class="id" href="/p/{repo}/i/{encodeURIComponent(item.id)}">{item.id}</a>
			{#if item.star}<span class="star" title="On the cut line">★</span>{/if}
			<span>{@html item.titleHtml}</span>
		</span>
		<span class="tags">
			{#if item.pending}<span class="tag pending" title="Changed in the open Project Magic edits PR"
					>pending</span
				>{/if}
			{#if item.blocked && item.status !== 'blocked'}<span class="tag warn">blocked</span>{/if}
			{#if item.job}<span class="tag">{item.job}</span>{/if}
			{#if item.size}<span class="tag size">{item.size}</span>{/if}
		</span>
		<span class="source">
			{item.source}{#if item.waitingHtml}
				· <span class="waiting">waiting on {@html item.waitingHtml}</span>{/if}{#if item.noMeta}
				· <span class="nometa">no meta line</span>{/if}
		</span>
	</summary>
	{#if item.bodyHtml}<div class="body prose">{@html item.bodyHtml}</div>{/if}
</details>

<style>
	.row {
		border-bottom: 1px solid var(--line);
	}
	summary {
		display: grid;
		grid-template-columns: 6.5rem 1fr auto;
		gap: 0.15rem 0.75rem;
		align-items: baseline;
		padding: 0.6rem 0.25rem;
		cursor: pointer;
		list-style: none;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary:hover {
		background: var(--surface-1);
	}
	.pill {
		justify-self: start;
	}
	.title {
		font-size: 15px;
		min-width: 0;
	}
	.id {
		font: 500 12.5px var(--mono);
		text-decoration: none;
		margin-right: 0.3rem;
	}
	.star {
		color: var(--warn);
		margin-right: 0.2rem;
	}
	.tags {
		display: flex;
		gap: 0.3rem;
	}
	.tag {
		font: 600 10.5px/16px var(--sans);
		letter-spacing: 0.04em;
		border: 1px solid var(--line-strong);
		border-radius: 4px;
		padding: 0 0.35rem;
		color: var(--text-2);
	}
	.tag.size {
		font-family: var(--mono);
		font-weight: 500;
	}
	.tag.pending {
		border-color: var(--accent);
		color: var(--accent);
	}
	.tag.warn {
		border-color: var(--warn);
		color: var(--warn);
	}
	.source {
		grid-column: 2 / -1;
		font-size: 12.5px;
		color: var(--text-3);
	}
	.waiting {
		color: var(--warn);
	}
	.nometa {
		color: var(--danger);
	}
	.body {
		padding: 0.25rem 0.25rem 1.25rem 7.25rem;
		font-size: 15px;
	}
	@media (max-width: 760px) {
		summary {
			grid-template-columns: auto minmax(0, 1fr);
		}
		.tags,
		.source {
			grid-column: 1 / -1;
		}
		.body {
			padding-left: 0.25rem;
		}
	}
</style>
