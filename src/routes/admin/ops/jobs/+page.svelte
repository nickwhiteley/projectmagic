<script lang="ts">
	import { ago } from '#lib/format.ts';

	let { data } = $props();
	const secs = (ms: number | null) => (ms == null ? '—' : `${(ms / 1000).toFixed(1)} s`);
	const facts = (d: Record<string, unknown> | null) =>
		d
			? Object.entries(d)
					.filter(([, v]) => v !== null && v !== false && typeof v !== 'object')
					.map(([k, v]) => `${k} ${v}`)
					.join(' · ')
			: '';
</script>

<svelte:head><title>Background work · Operations · Admin · Project Magic</title></svelte:head>

<p class="muted">
	<a href="/admin/ops#jobs">Operations</a> · Background work, newest first{data.kind
		? `, ${data.kind} only`
		: ''}{data.outcome === 'problem' ? ', problems only' : ''}.
	{#if data.kind || data.outcome}<a href="/admin/ops/jobs">Show everything</a>{/if}
</p>
{#if data.rows.length}
	<div class="scroll">
		<table class="data">
			<thead
				><tr
					><th>When</th><th>Kind</th><th>For</th><th>Started by</th><th>Took</th><th>Result</th></tr
				></thead
			>
			<tbody>
				{#each data.rows as r (r.id)}
					<tr class:bad={!['ok', 'running', 'skipped'].includes(r.outcome)}>
						<td title={r.startedAt}>{ago(r.startedAt)}</td>
						<td><a href="?kind={encodeURIComponent(r.kind)}">{r.kind}</a></td>
						<td
							>{#if r.projectId}<a href="/admin/ops/project/{r.projectId}">{r.project}</a
								>{:else}{r.tenant ?? '—'}{/if}</td
						>
						<td>{r.trigger ?? '—'}</td>
						<td>{secs(r.ms)}</td>
						<td class="msg"
							><b>{r.outcome}</b>{r.error ? `: ${r.error}` : ''}
							{#if facts(r.detail)}<br /><span class="muted small">{facts(r.detail)}</span>{/if}</td
						>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else}
	<p class="muted">Nothing recorded.</p>
{/if}

<style>
	.scroll {
		overflow-x: auto;
	}
	.msg {
		overflow-wrap: anywhere;
		min-width: 16rem;
	}
	tr.bad b {
		color: var(--danger);
	}
</style>
