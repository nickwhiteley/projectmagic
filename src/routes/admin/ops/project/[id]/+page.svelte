<script lang="ts">
	import { page } from '$app/state';
	import AttentionList from '#lib/components/AttentionList.svelte';
	import { ago } from '#lib/format.ts';

	let { data } = $props();
	const p = $derived(data.p);
	const secs = (ms: number | null) => (ms == null ? '—' : `${(ms / 1000).toFixed(1)} s`);
	const back = $derived(page.url.pathname);
</script>

<svelte:head><title>{p.owner}/{p.repo} · Operations · Admin · Project Magic</title></svelte:head>

<p class="muted">
	<a href="/admin/ops">Operations</a> · <a href="/admin/tenants/{p.tenantId}">{p.tenant}</a>
</p>
<h2>{p.owner}/{p.repo}</h2>

<div class="stats">
	<div class="stat"><b>{ago(p.lastSyncAt)}</b><span class="muted">last good sync</span></div>
	<div class="stat"><b>{ago(p.lastWebhookAt)}</b><span class="muted">last webhook</span></div>
	<div class="stat" class:bad={p.failCount > 0}>
		<b>{p.failCount}</b><span class="muted"
			>failures in a row{p.failingSince ? `, since ${ago(p.failingSince)}` : ''}</span
		>
	</div>
	<div class="stat">
		<b>{p.held.n}</b><span class="muted"
			>pending edits ({p.held.claimed} saving, {p.held.conflict} in conflict)</span
		>
	</div>
</div>
{#if p.lastError}<p class="flash error">{p.lastError}</p>{/if}
{#if p.overLimit}<p class="note">Paused: over its tenant’s plan limit, so it isn’t synced.</p>{/if}
{#if p.uninstalledAt}<p class="note">
		No longer in any installation since {ago(p.uninstalledAt)}.
	</p>{/if}

<div class="actions">
	<form method="POST" action="/admin/ops?/fix">
		<input type="hidden" name="action" value="sync" /><input
			type="hidden"
			name="project"
			value={p.id}
		/>
		<input type="hidden" name="back" value={back} /><button class="button primary">Sync now</button>
	</form>
	{#if p.syncStartedAt}
		<form method="POST" action="/admin/ops?/fix">
			<input type="hidden" name="action" value="unstick" /><input
				type="hidden"
				name="project"
				value={p.id}
			/>
			<input type="hidden" name="back" value={back} /><button class="button"
				>Clear the running sync and sync</button
			>
		</form>
	{/if}
	{#if p.held.claimed}
		<form method="POST" action="/admin/ops?/fix">
			<input type="hidden" name="action" value="release" /><input
				type="hidden"
				name="project"
				value={p.id}
			/>
			<input type="hidden" name="back" value={back} /><button class="button"
				>Release edits being saved</button
			>
		</form>
	{/if}
</div>

<AttentionList items={data.attention} empty="Nothing needs attention for this project." />

<h2>Sync runs</h2>
{#if p.runs.length}
	<div class="scroll">
		<table class="data">
			<thead
				><tr><th>When</th><th>Kind</th><th>Started by</th><th>Took</th><th>Result</th></tr></thead
			>
			<tbody>
				{#each p.runs as r (r.id)}
					<tr class:bad={!['ok', 'running', 'skipped'].includes(r.outcome)}>
						<td title={r.startedAt}>{ago(r.startedAt)}</td>
						<td>{r.kind}</td>
						<td>{r.trigger ?? '—'}</td>
						<td>{secs(r.ms)}</td>
						<td class="msg"
							><b>{r.outcome}</b>{r.error
								? `: ${r.error}`
								: ''}{#if r.detail?.calls !== undefined}<span class="muted small">
									· {r.detail.calls} GitHub calls{r.detail.missedWebhook
										? ' · found a change no webhook brought'
										: ''}</span
								>{/if}</td
						>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else}
	<p class="muted">No runs recorded yet.</p>
{/if}

<h2>Webhooks</h2>
{#if p.deliveries.length}
	<div class="scroll">
		<table class="data">
			<thead><tr><th>When</th><th>Event</th><th>Outcome</th><th>Took</th></tr></thead>
			<tbody>
				{#each p.deliveries as d (d.id)}
					<tr>
						<td title={d.receivedAt}>{ago(d.receivedAt)}</td>
						<td>{d.event}</td>
						<td>{d.outcome ?? 'not recorded'}{d.detail ? `: ${d.detail}` : ''}</td>
						<td>{d.ms === null ? '—' : `${d.ms} ms`}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else}
	<p class="muted">No deliveries in the last 14 days.</p>
{/if}

<h2>Edits</h2>
{#if p.edits.length}
	<div class="scroll">
		<table class="data">
			<thead><tr><th>When</th><th>Who</th><th>Edit</th><th>Result</th></tr></thead>
			<tbody>
				{#each p.edits as e (e.at + e.item + e.op)}
					<tr class:bad={!!e.error}>
						<td title={e.at}>{ago(e.at)}</td>
						<td>{e.login ?? '—'}</td>
						<td>{e.op} {e.item}</td>
						<td class="msg">{e.error ? `failed: ${e.error}` : e.pr ? `PR #${e.pr}` : 'saved'}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else}
	<p class="muted">No edits made in Project Magic.</p>
{/if}

<style>
	.scroll {
		overflow-x: auto;
	}
	.msg {
		overflow-wrap: anywhere;
		min-width: 14rem;
	}
	.actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.actions form {
		margin: 0;
	}
	.stat.bad b,
	tr.bad b,
	tr.bad td.msg {
		color: var(--danger);
	}
</style>
