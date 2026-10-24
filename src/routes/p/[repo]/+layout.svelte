<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import { ago } from '#lib/format.ts';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();
	const p = $derived(data.project);
	const base = $derived(`/p/${p.param}`);
	const tabs = $derived([
		{ href: base, label: 'List', count: p.counts.items },
		{ href: `${base}/board`, label: 'Board' },
		{ href: `${base}/epics`, label: 'Epics', count: p.counts.epics, hide: !p.counts.epics },
		{ href: `${base}/plan`, label: 'Plan', hide: !p.hasPlan },
		{ href: `${base}/done`, label: 'Done', count: p.counts.done },
		{ href: `${base}/delivery`, label: 'Delivery' },
		{ href: `${base}/branches`, label: 'Branches', count: p.counts.branches },
		{ href: `${base}/docs`, label: 'Docs' }
	]);
	const b = $derived(p.batch);
	// Look again when a batch is due: loading the page is what saves it (PM25).
	$effect(() => {
		if (b.dueInMs === null) return;
		const t = setTimeout(() => void invalidateAll(), b.dueInMs + 2000);
		return () => clearTimeout(t);
	});
	const going = $derived(navigating.to?.url.pathname ?? null);
	const from = $derived(navigating.from?.url.pathname ?? null);
	const busy = (href: string) =>
		!!going && going !== from && (href === base ? going === base : going.startsWith(href));
	const current = (href: string) =>
		href === base ? page.url.pathname === base : page.url.pathname.startsWith(href);
</script>

<div class="head">
	<div>
		<p class="crumb muted">
			<a href="https://github.com/{p.owner}/{p.repo}">{p.owner}/{p.repo}</a>
		</p>
		<h1>{p.name}</h1>
	</div>
	<div class="sync">
		<!-- The last runs, for anyone wondering whether the page is current (PM50). -->
		<details class="history">
			<summary class="muted"
				>synced {ago(p.lastSyncAt)}{p.sync.syncing ? ' · syncing now' : ''}</summary
			>
			<div class="runs small">
				<p class="muted">
					Last webhook {ago(p.sync.lastWebhookAt)}. A push or a PR on GitHub syncs within seconds;
					the daily cron catches anything missed.
				</p>
				{#if p.sync.runs.length}
					<table>
						<thead><tr><th>When</th><th>Started by</th><th>Took</th><th>Result</th></tr></thead>
						<tbody>
							{#each p.sync.runs as r (r.at)}
								<tr class:bad={r.outcome !== 'ok' && r.outcome !== 'running'}>
									<td>{ago(r.at)}</td>
									<td>{r.trigger ?? '—'}</td>
									<td>{r.ms === null ? '—' : `${(r.ms / 1000).toFixed(1)} s`}</td>
									<td title={r.error ?? ''}
										>{r.outcome}{r.error ? `: ${r.error.slice(0, 80)}` : ''}</td
									>
								</tr>
							{/each}
						</tbody>
					</table>
				{:else}
					<p class="muted">No sync runs recorded yet.</p>
				{/if}
			</div>
		</details>
		<form method="POST" action="{base}/sync"><button class="button">Refresh</button></form>
	</div>
</div>
{#if p.syncFailure}<p class="error" role="alert">{p.syncFailure}</p>{/if}
{#if page.url.searchParams.get('lag')}<p class="note" role="status">
		Saved on GitHub. This page may be a few seconds behind; Refresh shows it.
	</p>{/if}
{#each p.sync.held as h (h.login)}
	<p class="note" role="status">
		{h.n} edit{h.n === 1 ? ' is' : 's are'} held: {h.login} must sign in to Project Magic again before
		{h.n === 1 ? 'it' : 'they'} can be saved as them.
	</p>
{/each}
{#if page.url.searchParams.get('merge')}<p class="note">
		{page.url.searchParams.get('merge')}
	</p>{/if}
{#if p.edits}
	<div class="edits" role="status">
		{#if p.edits.state === 'pending'}
			<span>
				Edits are waiting in
				<a href="https://github.com/{p.owner}/{p.repo}/pull/{p.edits.pr}">PR #{p.edits.pr}</a>
				and aren’t on {p.main} yet: {p.edits.detail}
			</span>
			{#if p.canMerge}
				<form method="POST" action="{base}/edits/merge"><button class="button">Merge</button></form>
			{/if}
		{:else if p.edits.state === 'edits-not-merged'}
			<span><strong>Edits not merged.</strong> {p.edits.detail}</span>
		{:else}
			<span
				><strong>Edits need a merge by hand.</strong>
				{p.edits.detail}
				{#if p.edits.pr}<a href="https://github.com/{p.owner}/{p.repo}/pull/{p.edits.pr}"
						>PR #{p.edits.pr}</a
					>{/if}</span
			>
		{/if}
	</div>
{/if}

{#if p.canEdit && b.allowed}
	<div class="batch" class:idle={!b.pending.length} role="status">
		<span>
			{#if b.pending.length}
				<strong>{b.pending.length} unsaved edit{b.pending.length === 1 ? '' : 's'}</strong
				>{#if b.saving}, saving now…{:else}, saved together after a quiet minute.{/if}
			{:else}
				Batch edits are available.
			{/if}
		</span>
		<span class="acts">
			{#if b.pending.length}
				<form method="POST" action="{base}/pending">
					<input type="hidden" name="back" value={page.url.pathname + page.url.search} />
					<button class="button">Save now</button>
				</form>
			{/if}
			<form method="POST" action="/settings/batch" class="batch-toggle">
				<input type="hidden" name="on" value={b.mine ? '0' : '1'} />
				<input type="hidden" name="back" value={page.url.pathname + page.url.search} />
				<button
					class="button"
					title="Hold your edits and save them as one commit, instead of one commit each"
					>Batch edits: {b.mine ? 'on' : 'off'}</button
				>
			</form>
		</span>
	</div>
	{#if b.pending.length}
		<ul class="unsaved">
			{#each b.pending as e (e.id)}
				<li class:conflict={e.conflict}>
					<span>
						{e.label}{#if e.by}<span class="muted"> by {e.by}</span>{/if}
						{#if e.conflict}<strong> — not saved: {e.conflict}.</strong>{:else}<span class="muted">
								· unsaved</span
							>{/if}
					</span>
					<form method="POST" action="{base}/pending">
						<input type="hidden" name="do" value="discard" />
						<input type="hidden" name="id" value={e.id} />
						<input type="hidden" name="back" value={page.url.pathname + page.url.search} />
						<button class="button">Discard</button>
					</form>
				</li>
			{/each}
		</ul>
	{/if}
{/if}

<div class="view">
	<select
		class="tabs-select"
		aria-label="View"
		value={tabs.find((t) => !t.hide && current(t.href))?.href ?? base}
		onchange={(e) => void goto(e.currentTarget.value)}
	>
		{#each tabs.filter((t) => !t.hide) as t (t.href)}
			<option value={t.href}>{t.label}{t.count !== undefined ? ` (${t.count})` : ''}</option>
		{/each}
	</select>

	<nav class="tabs" aria-label="Project">
		{#each tabs.filter((t) => !t.hide) as t (t.href)}
			<a
				href={t.href}
				aria-current={current(t.href) ? 'page' : undefined}
				aria-busy={busy(t.href) || undefined}
			>
				{t.label}{#if t.count !== undefined}<span class="count">{t.count}</span>{/if}
			</a>
		{/each}
	</nav>

	{@render children()}
</div>

<style>
	.head {
		display: flex;
		justify-content: space-between;
		align-items: end;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.crumb {
		margin: 0 0 0.2rem;
		font: 12px var(--mono);
	}
	.crumb a {
		text-decoration: none;
	}
	h1 {
		font-size: 36px;
	}
	.sync {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 13px;
	}
	.error {
		color: var(--danger);
	}
	.note {
		background: var(--surface-2);
		padding: 0.5rem 0.8rem;
		border-radius: var(--radius);
		font-size: 13px;
	}
	.edits {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		background: var(--st-review-bg);
		color: var(--st-review);
		padding: 0.55rem 0.9rem;
		border-radius: var(--radius);
		margin-top: 0.75rem;
		font-size: 13.5px;
	}
	.batch {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		background: var(--surface-2);
		padding: 0.5rem 0.9rem;
		border-radius: var(--radius);
		margin-top: 0.75rem;
		font-size: 13.5px;
	}
	.acts {
		display: flex;
		gap: 0.5rem;
	}
	.unsaved {
		list-style: none;
		margin: 0.4rem 0 0;
		padding: 0;
		font-size: 13px;
	}
	.unsaved li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		padding: 0.25rem 0.9rem;
	}
	.unsaved li.conflict {
		color: var(--danger);
	}
	.tabs {
		display: flex;
		gap: 0.25rem;
		border-bottom: 1px solid var(--line);
		margin: 1rem 0 1.5rem;
		overflow-x: auto;
	}
	.tabs a {
		padding: 0.5rem 0.8rem;
		text-decoration: none;
		color: var(--text-2);
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		white-space: nowrap;
	}
	.tabs a[aria-busy='true'] {
		color: var(--text);
		border-bottom-color: var(--accent);
	}
	.tabs a[aria-current='page'] {
		color: var(--text);
		border-bottom-color: var(--text);
		font-weight: 500;
	}
	.tabs-select {
		display: none;
		width: 100%;
		margin: 1rem 0 1.25rem;
		border: 1px solid var(--line-strong);
		background: var(--card);
		border-radius: var(--radius);
		padding: 0.45rem 0.6rem;
	}
	@media (max-width: 760px) {
		.tabs {
			display: none;
		}
		.tabs-select {
			display: block;
		}
		.batch-toggle {
			display: none;
		}
		/* A phone's first screen should show the list: no bar that only says batch edits exist. */
		.batch.idle {
			display: none;
		}
		.head {
			align-items: center;
			gap: 0.5rem;
		}
		.head h1 {
			font-size: 24px;
		}
		.crumb {
			display: none;
		}
		.sync {
			gap: 0.5rem;
			font-size: 12px;
		}
		/* The view menu shares a row with the list's Filters and Add buttons, so it is narrow. */
		.view {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: 0 0.5rem;
		}
		.view > :global(*) {
			flex: 1 1 100%;
		}
		.view > :global(.tools) {
			flex: 1 1 0;
			min-width: 0;
		}
		.tabs-select {
			flex: 0 0 auto;
			width: auto;
			max-width: 8rem;
			margin: 0.6rem 0 0.8rem;
		}
	}
	.count {
		font: 11px var(--mono);
		background: var(--surface-3);
		border-radius: 999px;
		padding: 0 0.4rem;
		margin-left: 0.4rem;
	}
	.history {
		position: relative;
	}
	.history summary {
		cursor: pointer;
		list-style: none;
	}
	.history .runs {
		position: absolute;
		right: 0;
		top: 1.75rem;
		z-index: 5;
		width: min(34rem, calc(100vw - 2rem));
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 0.75rem;
		box-shadow: 0 4px 16px rgb(0 0 0 / 0.12);
	}
	.runs table {
		width: 100%;
		border-collapse: collapse;
	}
	.runs th,
	.runs td {
		text-align: left;
		padding: 0.2rem 0.4rem 0.2rem 0;
		vertical-align: top;
	}
	.runs tr.bad td {
		color: var(--danger);
	}
</style>
