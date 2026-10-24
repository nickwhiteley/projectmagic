<script lang="ts">
	import { ago } from '#lib/format.ts';

	let { data } = $props();
</script>

<svelte:head><title>Errors · Operations · Admin · Project Magic</title></svelte:head>

<p class="muted">
	<a href="/admin/ops#errors">Operations</a> · Every error group of the last 90 days, newest first. A
	resolved group reopens when it happens again.
</p>
{#if data.groups.length}
	<div class="scroll">
		<table class="data">
			<thead
				><tr><th>Error</th><th>Where</th><th>Times</th><th>First</th><th>Last</th><th></th></tr
				></thead
			>
			<tbody>
				{#each data.groups as g (g.fingerprint)}
					<tr class:resolved={!!g.resolvedAt}>
						<td class="msg"
							><a href="/admin/ops/errors/{encodeURIComponent(g.fingerprint)}"
								>{g.message.slice(0, 160)}</a
							></td
						>
						<td><span class="pill">{g.source}</span> <code>{g.route ?? '—'}</code></td>
						<td>{g.occurrences}</td>
						<td title={g.firstSeen}>{ago(g.firstSeen)}</td>
						<td title={g.lastSeen}>{ago(g.lastSeen)}</td>
						<td
							>{#if g.resolvedAt}<span class="pill active">resolved</span>{/if}</td
						>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else}
	<p class="muted">No errors recorded.</p>
{/if}

<style>
	.scroll {
		overflow-x: auto;
	}
	.msg {
		overflow-wrap: anywhere;
		min-width: 14rem;
	}
	tr.resolved td {
		color: var(--text-3);
	}
</style>
