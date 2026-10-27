<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import FeedbackButton from '#lib/components/FeedbackButton.svelte';
	import { goto } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import { STATUS_NOTICE } from '#lib/core/tenants.ts';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();
	const path = $derived(page.url.pathname);
	// The user menu (PM34): the name opens it. It closes on a click elsewhere, Escape or a new page.
	let menuOpen = $state(false);
	let feedback = $state<ReturnType<typeof FeedbackButton> | null>(null);
	$effect(() => {
		void page.url.pathname;
		menuOpen = false;
	});
	// Where a navigation in progress is going, so the clicked link can say so at once (PM13).
	// The URL changes as soon as a navigation starts, so compare with where it came from.
	const going = $derived(navigating.to?.url.pathname ?? null);
	const from = $derived(navigating.from?.url.pathname ?? null);
	const busy = (href: string) =>
		!!going && going !== from && (going === href || going.startsWith(`${href}/`));
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<svelte:window
	onclick={(e) => {
		if (menuOpen && !(e.target as Element).closest('.usermenu')) menuOpen = false;
	}}
	onkeydown={(e) => {
		if (e.key === 'Escape') menuOpen = false;
	}}
/>

{#if navigating.to}
	<div class="nav-progress" role="progressbar" aria-label="Loading"></div>
{/if}

{#if data.user}
	<div class="shell">
		<aside>
			<a class="brand" href="/">
				<span class="mark">M</span>
				<span>Project Magic</span>
			</a>
			<nav aria-label="Views" class="views">
				<a
					href="/"
					aria-current={path === '/' ? 'page' : undefined}
					aria-busy={busy('/') && going === '/' ? true : undefined}>Overview</a
				>
				<a
					class="wide-only"
					href="/activity"
					aria-current={path === '/activity' ? 'page' : undefined}>Activity</a
				>
				<a href="/search" aria-current={path === '/search' ? 'page' : undefined}>Search</a>
				{#if data.ai}<a href="/ask" aria-current={path === '/ask' ? 'page' : undefined}>Ask</a>{/if}
			</nav>
			<div class="label group">Projects</div>
			<select
				class="project-select"
				aria-label="Project"
				onchange={(e) => void goto(e.currentTarget.value)}
			>
				<option value="/" selected={!path.startsWith('/p/')}>Projects…</option>
				{#each data.projects as p (p.param)}
					<option
						value="/p/{p.param}"
						selected={path === `/p/${p.param}` || path.startsWith(`/p/${p.param}/`)}
						>{p.name}</option
					>
				{/each}
			</select>
			<nav aria-label="Projects" class="projects">
				{#each data.projects as p (p.param)}
					<a
						href="/p/{p.param}"
						aria-current={path === `/p/${p.param}` || path.startsWith(`/p/${p.param}/`)
							? 'page'
							: undefined}
						aria-busy={busy(`/p/${p.param}`) || undefined}
					>
						<span class="dot" class:failed={p.failed}></span>{p.name}
					</a>
				{/each}
			</nav>
		</aside>
		<div class="main">
			<header>
				<form action="/search" method="GET" role="search">
					<input
						name="q"
						type="search"
						placeholder="Search ids, titles and text across projects"
						aria-label="Search"
						value={path === '/search' ? (page.url.searchParams.get('q') ?? '') : ''}
					/>
				</form>
				<div class="who">
					<!-- In the header for pre-launch (PM62), and in the user menu as well. -->
					<FeedbackButton bind:this={feedback} />
					<div class="usermenu">
						<button
							type="button"
							class="button who-btn"
							aria-haspopup="menu"
							aria-expanded={menuOpen}
							onclick={() => (menuOpen = !menuOpen)}
						>
							{data.user.name ?? 'Account'} <span aria-hidden="true">▾</span>
						</button>
						{#if menuOpen}
							<div class="panel" role="menu">
								<a
									role="menuitem"
									href="/settings"
									aria-current={path === '/settings' ? 'page' : undefined}>Settings</a
								>
								<button
									type="button"
									role="menuitem"
									onclick={() => {
										menuOpen = false;
										feedback?.open();
									}}>Feedback</button
								>
								{#if data.tenants.length > 1}
									<form method="POST" action="/tenant/switch" class="tenant">
										<select name="tenant" aria-label="Tenant">
											{#each data.tenants as t (t.id)}
												<option value={t.id} selected={t.id === data.tenant?.id}>{t.name}</option>
											{/each}
										</select>
										<button class="button">Switch</button>
									</form>
								{:else if data.tenant}
									<span class="tenant-name" title="Tenant">{data.tenant.name}</span>
								{/if}
								{#if data.tenant?.admin && data.tenant.status === 'active'}
									<a
										role="menuitem"
										href="/tenant"
										aria-current={path.startsWith('/tenant') ? 'page' : undefined}>Tenant</a
									>
								{/if}
								{#if data.user.admin}
									<a
										role="menuitem"
										href="/admin"
										aria-current={path.startsWith('/admin') ? 'page' : undefined}>Admin</a
									>
								{/if}
								<form method="POST" action="/auth/signout">
									<button role="menuitem">Sign out</button>
								</form>
							</div>
						{/if}
					</div>
				</div>
			</header>
			{#if data.tenant?.support}
				<form method="POST" action="/admin/support/end" class="notice support" role="status">
					<span>
						Support session on <b>{data.tenant.name}</b>: read-only, and the tenant's admins can see
						it. Ends {data.tenant.until
							? new Date(data.tenant.until).toLocaleTimeString()
							: 'within the hour'}.
					</span>
					<button class="button">End session</button>
				</form>
			{/if}
			{#if data.tenant && data.tenant.status !== 'active'}
				<p class="notice status-{data.tenant.status}" role="status">
					{STATUS_NOTICE[data.tenant.status]}
				</p>
			{/if}
			<main>{@render children()}</main>
		</div>
	</div>
{:else}
	{@render children()}
{/if}

<style>
	.shell {
		display: grid;
		grid-template-columns: var(--sidebar) minmax(0, 1fr);
		min-height: 100vh;
	}
	.main {
		min-width: 0;
	}
	aside {
		background: var(--surface-1);
		border-right: 1px solid var(--line);
		padding: 1rem 0.75rem;
		position: sticky;
		top: 0;
		height: 100vh;
		overflow-y: auto;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		font: 400 20px var(--serif);
		text-decoration: none;
		padding: 0 0.4rem 1rem;
	}
	.mark {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 6px;
		background: var(--text);
		color: var(--bg);
		font: 700 18px var(--serif);
	}
	.project-select {
		display: none;
		width: 100%;
		border: 1px solid var(--line-strong);
		background: var(--card);
		border-radius: var(--radius);
		padding: 0.4rem 0.5rem;
	}
	nav {
		display: flex;
		flex-direction: column;
		gap: 1px;
		margin-bottom: 1rem;
	}
	nav a {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.35rem 0.6rem;
		border-radius: var(--radius);
		text-decoration: none;
		color: var(--text-2);
	}
	nav a:hover {
		background: var(--surface-2);
		color: var(--text);
	}
	nav a[aria-busy='true'] {
		background: var(--surface-2);
		color: var(--text);
	}
	nav a[aria-busy='true']::after {
		content: '';
		margin-left: auto;
		width: 10px;
		height: 10px;
		border: 2px solid var(--line-strong);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	/* A thin bar across the top while a page loads; only after a moment, so quick ones don't flash. */
	.nav-progress {
		position: fixed;
		inset: 0 0 auto 0;
		height: 3px;
		z-index: 50;
		overflow: hidden;
		opacity: 0;
		animation: appear 0s linear 120ms forwards;
	}
	.nav-progress::before {
		content: '';
		position: absolute;
		inset: 0;
		width: 40%;
		background: var(--accent);
		animation: slide 1.1s ease-in-out infinite;
	}
	@keyframes appear {
		to {
			opacity: 1;
		}
	}
	@keyframes slide {
		from {
			transform: translateX(-100%);
		}
		to {
			transform: translateX(250%);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.nav-progress::before {
			animation: none;
			width: 100%;
			opacity: 0.6;
		}
		nav a[aria-busy='true']::after {
			animation: none;
		}
	}
	nav a[aria-current='page'] {
		background: var(--surface-3);
		color: var(--text);
		font-weight: 500;
	}
	.group {
		padding: 0 0.6rem 0.3rem;
	}
	.dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--line-strong);
	}
	.dot.failed {
		background: var(--danger);
	}
	header {
		position: sticky;
		top: 0;
		z-index: 5;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.6rem 2rem;
		background: color-mix(in srgb, var(--bg) 88%, transparent);
		backdrop-filter: blur(8px);
		border-bottom: 1px solid var(--line);
	}
	header form[role='search'] {
		flex: 1;
		max-width: 36rem;
	}
	header input {
		width: 100%;
		border: 1px solid var(--line);
		background: var(--surface-1);
		border-radius: var(--radius);
		padding: 0.4rem 0.7rem;
	}
	.notice {
		margin: 0;
		padding: 0.6rem 2rem;
		background: var(--warn-bg);
		color: var(--warn);
		border-bottom: 1px solid var(--line);
	}
	.notice.support {
		display: flex;
		gap: 1rem;
		align-items: center;
		justify-content: space-between;
	}
	.tenant {
		display: flex;
		gap: 0.4rem;
	}
	.tenant-name {
		font-weight: 600;
		color: var(--text-1, inherit);
	}
	.who {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		color: var(--text-2);
		margin-left: auto;
	}
	.usermenu {
		position: relative;
	}
	.panel {
		position: absolute;
		right: 0;
		top: calc(100% + 0.3rem);
		z-index: 20;
		min-width: 15rem;
		display: flex;
		flex-direction: column;
		gap: 1px;
		padding: 0.35rem;
		background: var(--card);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius);
		box-shadow: 0 6px 20px rgb(0 0 0 / 0.12);
	}
	.panel > a,
	.panel button[role='menuitem'],
	.panel form button[role='menuitem'] {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
		width: 100%;
		padding: 0.4rem 0.6rem;
		border: 0;
		background: none;
		border-radius: var(--radius);
		color: var(--text);
		text-align: left;
		text-decoration: none;
		font: inherit;
		cursor: pointer;
	}
	.panel > a:hover,
	.panel button[role='menuitem']:hover {
		background: var(--surface-2);
	}
	.panel > a[aria-current='page'] {
		background: var(--surface-3);
	}
	.panel .tenant,
	.panel .tenant-name {
		padding: 0.4rem 0.6rem;
	}
	.panel .tenant select {
		flex: 1;
		min-width: 0;
	}
	main {
		padding: 1.5rem 2rem 4rem;
		max-width: 1400px;
	}
	@media (max-width: 760px) {
		/* One flowing block: the logo and views, then the project picker with the user menu to its
		   right, then the page. The sidebar and the main column dissolve so the header can join. */
		.shell {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: 0.4rem 0.5rem;
			padding: 0.6rem 1rem 0;
		}
		aside,
		.main {
			display: contents;
		}
		.brand {
			padding: 0 0.4rem 0 0;
		}
		aside nav.views {
			flex-direction: row;
			margin: 0;
		}
		.wide-only,
		.projects,
		.group,
		header form[role='search'] {
			display: none;
		}
		/* The picker takes what Feedback and the user menu leave, so the name stays on one line. */
		.project-select {
			display: block;
			flex: 1 1 8rem;
			width: auto;
			min-width: 0;
		}
		header {
			flex: 0 0 auto;
			min-width: 0;
			position: static;
			padding: 0;
			border: 0;
			background: none;
			backdrop-filter: none;
		}
		.who {
			gap: 0.5rem;
			white-space: nowrap;
		}
		.notice {
			flex: 1 1 100%;
			padding-left: 0.8rem;
			padding-right: 0.8rem;
		}
		main {
			flex: 1 1 100%;
			min-width: 0;
			padding: 0.5rem 0 4rem;
		}
	}
</style>
