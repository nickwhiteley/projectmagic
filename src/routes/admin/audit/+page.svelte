<script lang="ts">
	import { ago } from '#lib/format.ts';

	let { data } = $props();
</script>

<svelte:head><title>Audit · Admin · Project Magic</title></svelte:head>

<p class="muted">Every admin action in every tenant and on the platform, newest first.</p>

{#if data.rows.length}
	<table class="data">
		<thead><tr><th>When</th><th>Who</th><th>Tenant</th><th>Action</th><th>Target</th></tr></thead>
		<tbody>
			{#each data.rows as a (a.id)}
				<tr>
					<td class="muted" title={a.at}>{ago(a.at, Date.now())}</td>
					<td>{a.actor ?? 'the service'}</td>
					<td>{a.tenant ?? ''}</td>
					<td><code>{a.action}</code></td>
					<td class="muted">{a.target ?? ''}</td>
				</tr>
			{/each}
		</tbody>
	</table>
{:else}
	<p class="muted">Nothing yet.</p>
{/if}
