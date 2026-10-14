<script lang="ts">
	import { page } from '$app/state';
	import { ago } from '#lib/format.ts';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();
	const p = $derived(data.project);
	const base = $derived(`/p/${p.repo}`);
	const tabs = $derived([
		{ href: base, label: 'List', count: p.counts.items },
		{ href: `${base}/board`, label: 'Board' },
		{ href: `${base}/plan`, label: 'Plan', hide: !p.hasPlan },
		{ href: `${base}/done`, label: 'Done', count: p.counts.done },
		{ href: `${base}/branches`, label: 'Branches', count: p.counts.branches },
		{ href: `${base}/docs`, label: 'Docs' }
	]);
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
		<span class="muted">synced {ago(p.lastSyncAt)}</span>
		<form method="POST" action="{base}/sync"><button class="button">Refresh</button></form>
	</div>
</div>
{#if p.lastError}<p class="error" role="alert">Last sync failed: {p.lastError}</p>{/if}

<nav class="tabs" aria-label="Project">
	{#each tabs.filter((t) => !t.hide) as t (t.href)}
		<a href={t.href} aria-current={current(t.href) ? 'page' : undefined}>
			{t.label}{#if t.count !== undefined}<span class="count">{t.count}</span>{/if}
		</a>
	{/each}
</nav>

{@render children()}

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
	.tabs a[aria-current='page'] {
		color: var(--text);
		border-bottom-color: var(--text);
		font-weight: 500;
	}
	.count {
		font: 11px var(--mono);
		background: var(--surface-3);
		border-radius: 999px;
		padding: 0 0.4rem;
		margin-left: 0.4rem;
	}
</style>
