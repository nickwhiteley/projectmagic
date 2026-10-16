<script lang="ts">
	import { ago } from '#lib/format.ts';

	let { data } = $props();
	const detail = (d: unknown) => (d && typeof d === 'object' ? JSON.stringify(d) : '');
</script>

<svelte:head><title>Audit · Project Magic</title></svelte:head>

<p class="muted">
	What this tenant's admins did, and when a platform admin opened a support session on it (they see
	your projects read-only, for an hour, and must give a reason).
</p>

{#if data.rows.length}
	<table class="data">
		<thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th><th>Detail</th></tr></thead>
		<tbody>
			{#each data.rows as a (a.id)}
				<tr class:support={a.action.startsWith('support.')}>
					<td class="muted" title={a.at}>{ago(a.at, Date.now())}</td>
					<td>{a.actor ?? 'the service'}</td>
					<td><code>{a.action}</code></td>
					<td class="muted">{a.target ?? ''}</td>
					<td class="muted small">{detail(a.data)}</td>
				</tr>
			{/each}
		</tbody>
	</table>
{:else}
	<p class="muted">Nothing yet.</p>
{/if}

<style>
	.support {
		background: var(--warn-bg);
	}
</style>
