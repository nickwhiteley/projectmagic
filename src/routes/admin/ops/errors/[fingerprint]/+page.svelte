<script lang="ts">
	import { page } from '$app/state';
	import { ago } from '#lib/format.ts';

	let { data } = $props();
	const g = $derived(data.group);
</script>

<svelte:head><title>Error · Operations · Admin · Project Magic</title></svelte:head>

<p class="muted">
	<a href="/admin/ops#errors">Operations</a> · <a href="/admin/ops/errors">Errors</a>
</p>
<section class="panel">
	<h2 class="msg">{g.message}</h2>
	<p class="muted">
		<span class="pill">{g.source}</span> on <code>{g.route ?? 'no route'}</code> · {g.occurrences} time{g.occurrences ===
		1
			? ''
			: 's'}, first {ago(g.firstSeen)}, last {ago(g.lastSeen)} · {g.hour} in the last hour, {g.day} in
		the last day
		{#if g.resolvedAt}· <span class="pill active">resolved {ago(g.resolvedAt)}</span>{/if}
	</p>
	{#if !g.resolvedAt}
		<form method="POST" action="/admin/ops?/fix">
			<input type="hidden" name="action" value="resolve" />
			<input type="hidden" name="fingerprint" value={g.fingerprint} />
			<input type="hidden" name="back" value={page.url.pathname} />
			<button class="button">Resolve</button>
			<span class="muted small">Once it is fixed. It reopens if it happens again.</span>
		</form>
	{/if}
</section>

<h2>Occurrences</h2>
{#each data.occurrences as o (o.ref)}
	<details class="occ" open={o.ref === data.ref || data.occurrences[0] === o}>
		<summary>
			<code>{o.ref}</code>
			<span class="muted"
				>{ago(o.at)} · {o.method ?? ''}
				{o.status ?? ''}{o.user ? ` · ${o.user}` : ''}{o.tenant ? ` · ${o.tenant}` : ''}{o.project
					? ` · ${o.project}`
					: ''}{o.version ? ` · build ${o.version}` : ''}</span
			>
		</summary>
		{#if o.message !== g.message}<p class="msg">{o.message}</p>{/if}
		{#if o.stack}<pre>{o.stack}</pre>{:else}<p class="muted">No stack.</p>{/if}
	</details>
{/each}

<style>
	.msg {
		overflow-wrap: anywhere;
		font-family: var(--mono);
		font-size: 15px;
		margin: 0;
	}
	.occ {
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 0.5rem 0.8rem;
	}
	.occ summary {
		cursor: pointer;
	}
	pre {
		overflow-x: auto;
		font-size: 12px;
		background: var(--surface-1);
		padding: 0.6rem;
		border-radius: var(--radius);
	}
	form {
		display: flex;
		gap: 0.6rem;
		align-items: center;
		flex-wrap: wrap;
	}
</style>
