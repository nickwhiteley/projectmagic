<script lang="ts">
	import { ago } from '#lib/format.ts';
	import { SCORES } from '#lib/core/feedback.ts';

	let { data } = $props();
</script>

<svelte:head><title>Feedback · Admin · Project Magic</title></svelte:head>

<p class="muted">
	From the Feedback button, newest first. Nobody is notified.
	{#if data.average !== null}Average score {data.average.toFixed(1)} from {data.scored}.{/if}
</p>

{#if data.rows.length}
	<table class="data">
		<thead><tr><th>When</th><th>Who</th><th>Score</th><th>Comment</th><th>Page</th></tr></thead>
		<tbody>
			{#each data.rows as r (r.id)}
				<tr>
					<td class="muted" title={r.at}>{ago(r.at, Date.now())}</td>
					<td
						>{r.who}{#if r.tenant}<span class="muted"> · {r.tenant}</span>{/if}</td
					>
					<td title={SCORES.find((s) => s.value === r.score)?.label}>{r.score ?? ''}</td>
					<td>{r.comment}</td>
					<td class="muted"><code>{r.page}</code></td>
				</tr>
			{/each}
		</tbody>
	</table>
{:else}
	<p class="muted">Nothing yet.</p>
{/if}
