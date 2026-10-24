<script lang="ts">
	// What needs a platform admin's attention (PM51): each problem with what it means, what to do,
	// and the buttons that do it. The buttons post to the Operations tab's `fix` action, which
	// comes back to this page with the outcome.
	import { page } from '$app/state';
	import type { Attention } from '#lib/core/ops.ts';

	let {
		items,
		empty = 'All is well: nothing needs attention.'
	}: { items: Attention[]; empty?: string } = $props();
	const back = $derived(page.url.pathname + page.url.hash);
</script>

{#if items.length}
	<ul class="attention">
		{#each items as a (a.key)}
			<li class={a.severity}>
				<div class="what">
					<b>{a.title}</b>
					{#if a.detail}<p class="detail">{a.detail}</p>{/if}
					<p class="remedy muted">{a.remedy}</p>
				</div>
				<div class="do">
					{#each a.fixes as f (f.action + JSON.stringify(f.params))}
						<form method="POST" action="/admin/ops?/fix">
							<input type="hidden" name="action" value={f.action} />
							<input type="hidden" name="back" value={back} />
							{#each Object.entries(f.params) as [k, v] (k)}<input
									type="hidden"
									name={k}
									value={v}
								/>{/each}
							<button class="button">{f.label}</button>
						</form>
					{/each}
					{#if a.href && a.href.split('#')[0] !== page.url.pathname}<a class="button" href={a.href}
							>Open</a
						>{/if}
				</div>
			</li>
		{/each}
	</ul>
{:else}
	<p class="well" role="status">{empty}</p>
{/if}

<style>
	.attention {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		width: 100%;
	}
	.attention li {
		display: flex;
		gap: 1rem;
		justify-content: space-between;
		align-items: flex-start;
		background: var(--card);
		border: 1px solid var(--line);
		border-left: 4px solid var(--warn);
		border-radius: var(--radius);
		padding: 0.7rem 0.9rem;
	}
	.attention li.critical {
		border-left-color: var(--danger);
	}
	.what {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.what p {
		margin: 0.25rem 0 0;
	}
	.detail {
		font-family: var(--mono);
		font-size: 12px;
	}
	.remedy {
		font-size: 13px;
	}
	.do {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
		justify-content: flex-end;
		flex-shrink: 0;
	}
	.do form {
		margin: 0;
	}
	.well {
		margin: 0;
		padding: 0.6rem 0.9rem;
		border-radius: var(--radius);
		background: var(--st-done-bg);
		color: var(--st-done);
	}
	@media (max-width: 40rem) {
		.attention li {
			flex-direction: column;
		}
		.do {
			justify-content: flex-start;
		}
	}
</style>
