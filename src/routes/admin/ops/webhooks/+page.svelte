<script lang="ts">
	import { ago } from '#lib/format.ts';

	let { data } = $props();
</script>

<svelte:head><title>Webhooks · Operations · Admin · Project Magic</title></svelte:head>

<p class="muted">
	<a href="/admin/ops#webhooks">Operations</a> · GitHub's deliveries of the last 14 days, newest
	first. A delivery that failed is forgotten, so GitHub's Redeliver can run it again: its error is
	under <a href="/admin/ops/jobs?kind=webhook">Background work</a>, with any refused for a bad
	signature under <a href="/admin/ops/jobs?kind=webhook%20signature">webhook signature</a>.
</p>
{#if data.rows.length}
	<div class="scroll">
		<table class="data">
			<thead
				><tr
					><th>When</th><th>Event</th><th>Project</th><th>Outcome</th><th>Took</th><th>Delivery</th
					></tr
				></thead
			>
			<tbody>
				{#each data.rows as d (d.id)}
					<tr>
						<td title={d.receivedAt}>{ago(d.receivedAt)}</td>
						<td>{d.event}</td>
						<td>{d.project ?? '—'}</td>
						<td>{d.outcome ?? 'not recorded'}{d.detail ? `: ${d.detail}` : ''}</td>
						<td>{d.ms === null ? '—' : `${d.ms} ms`}</td>
						<td><code class="small">{d.id.slice(0, 8)}</code></td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else}
	<p class="muted">No deliveries.</p>
{/if}

<style>
	.scroll {
		overflow-x: auto;
	}
</style>
