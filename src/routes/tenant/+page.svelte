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

<section class="health" id="health">
	<h2>Health</h2>
	{#if data.problems.length}
		<ul>
			{#each data.problems as x (x.key)}
				<li>
					<b
						>{#if x.href}<a href={x.href}>{x.title}</a>{:else}{x.title}{/if}</b
					>
					{#if x.detail}<code class="detail">{x.detail}</code>{/if}
					<span class="muted">{x.remedy}</span>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="well" role="status">All is well: every project syncs, and nothing is held.</p>
	{/if}
</section>

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

<style>
	.health ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.health li {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		background: var(--card);
		border: 1px solid var(--line);
		border-left: 4px solid var(--warn);
		border-radius: var(--radius);
		padding: 0.6rem 0.9rem;
		overflow-wrap: anywhere;
	}
	.detail {
		font-size: 12px;
	}
	.well {
		margin: 0;
		padding: 0.6rem 0.9rem;
		border-radius: var(--radius);
		background: var(--st-done-bg);
		color: var(--st-done);
	}
</style>
