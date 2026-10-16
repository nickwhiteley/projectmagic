<script lang="ts">
	import { ago } from '#lib/format.ts';

	let { data } = $props();
</script>

<svelte:head><title>Tenant · Project Magic</title></svelte:head>

<h2>{data.tenant.name} <code class="muted">{data.tenant.slug}</code></h2>

<div class="stats">
	<div class="stat"><b>{data.usage.members}</b><span class="muted">members</span></div>
	<div class="stat"><b>{data.usage.projects}</b><span class="muted">projects</span></div>
	<div class="stat">
		<b>{data.usage.installations}</b><span class="muted">GitHub accounts</span>
	</div>
	<div class="stat">
		<b>{data.usage.tokens.toLocaleString()}</b><span class="muted">AI tokens today</span>
	</div>
</div>

{#if !data.usage.installations}
	<p class="panel">
		No GitHub account is connected yet, so there are no projects.
		<a class="button primary" href="/tenant/installations">Connect GitHub</a>
	</p>
{/if}

<section>
	<h2>Recent admin actions</h2>
	{#if data.recent.length}
		<table class="data">
			<tbody>
				{#each data.recent as a (a.at + a.action)}
					<tr>
						<td><code>{a.action}</code></td>
						<td>{a.actor ?? 'the service'}</td>
						<td class="muted">{ago(a.at, Date.now())}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{:else}
		<p class="muted">Nothing yet.</p>
	{/if}
</section>
