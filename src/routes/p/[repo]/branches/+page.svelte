<script lang="ts">
	import { page } from '$app/state';
	import { ago } from '#lib/format.ts';

	let { data } = $props();
	const repo = $derived(page.params.repo!);
</script>

<svelte:head><title>Branches · {page.data.project.name}</title></svelte:head>

<p class="muted small">
	Every branch on GitHub. Active work the backlog doesn’t know about comes first. A branch is active
	when it is ahead of main and was committed to recently, or has an open PR.
</p>

<table>
	<thead
		><tr
			><th>Branch</th><th>Linked to</th><th>Ahead · behind</th><th>Pull request</th><th
				>Last commit</th
			></tr
		></thead
	>
	<tbody>
		{#each data.branches as b (b.name)}
			<tr class:stale={!b.active} class:unlinked={b.unlinked}>
				<td>
					<a href="{data.repoUrl}/tree/{b.name}"><code>{b.name}</code></a>
					{#if b.isMain}<span class="tag">main</span>{/if}
					{#if b.isEdits}<span class="tag">Project Magic edits</span>{/if}
					{#if b.isDeploy}<span class="tag">deploys</span>{/if}
					{#if !b.active}<span class="tag">stale</span>{/if}
				</td>
				<td>
					{#if b.items.length}
						{#each b.items as it, i (it.id)}{i ? ', ' : ''}<a
								href="/p/{repo}/i/{encodeURIComponent(it.id)}"><code>{it.id}</code> {it.title}</a
							>{/each}
					{:else if b.tasks.length}
						plan {b.tasks.join(', ')}
					{:else if b.unlinked}
						<span class="warn">not in the backlog</span>
					{/if}
				</td>
				<td class="mono">{b.isMain ? '' : `${b.ahead} · ${b.behind}`}</td>
				<td>
					{#each b.prs.slice(0, 2) as p (p.number)}<div>
							<a href={p.url}>#{p.number}</a>
							<span class="muted">{p.state.toLowerCase()}{p.draft ? ', draft' : ''}</span>
						</div>{/each}
				</td>
				<td><span class="muted">{ago(b.committedAt)}</span> <span class="msg">{b.message}</span></td
				>
			</tr>
		{/each}
	</tbody>
</table>

<style>
	.small {
		font-size: 12.5px;
		margin-top: 0;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 13px;
	}
	th {
		text-align: left;
		font-weight: 500;
		color: var(--text-3);
		padding: 0.4rem 0.5rem;
		border-bottom: 1px solid var(--line-strong);
	}
	td {
		padding: 0.55rem 0.5rem;
		border-bottom: 1px solid var(--line);
		vertical-align: top;
	}
	td a {
		text-decoration: none;
	}
	td:first-child code {
		white-space: nowrap;
	}
	tr.stale {
		opacity: 0.6;
	}
	tr.unlinked td:first-child {
		box-shadow: inset 3px 0 var(--warn);
	}
	.tag {
		font: 600 10px/15px var(--sans);
		border: 1px solid var(--line-strong);
		border-radius: 4px;
		padding: 0 0.3rem;
		margin-left: 0.3rem;
		color: var(--text-2);
	}
	.warn {
		color: var(--warn);
	}
	.mono {
		font-family: var(--mono);
		white-space: nowrap;
	}
	.msg {
		display: block;
		color: var(--text-2);
	}
</style>
