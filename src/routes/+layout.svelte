<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();
	const path = $derived(page.url.pathname);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if data.user}
	<div class="shell">
		<aside>
			<a class="brand" href="/">
				<span class="mark">M</span>
				<span>Project Magic</span>
			</a>
			<nav aria-label="Views">
				<a href="/" aria-current={path === '/' ? 'page' : undefined}>Overview</a>
				<a href="/search" aria-current={path === '/search' ? 'page' : undefined}>Search</a>
			</nav>
			<div class="label group">Projects</div>
			<nav aria-label="Projects">
				{#each data.projects as p (p.repo)}
					<a
						href="/p/{p.repo}"
						aria-current={path === `/p/${p.repo}` || path.startsWith(`/p/${p.repo}/`)
							? 'page'
							: undefined}
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
					<span>{data.user.name ?? data.user.login}</span>
					<form method="POST" action="/auth/signout"><button class="button">Sign out</button></form>
				</div>
			</header>
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
	.who {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		color: var(--text-2);
	}
	main {
		padding: 1.5rem 2rem 4rem;
		max-width: 1400px;
	}
	@media (max-width: 760px) {
		.shell {
			grid-template-columns: minmax(0, 1fr);
		}
		aside {
			position: static;
			height: auto;
			padding: 0.6rem 0.75rem;
		}
		.brand {
			padding-bottom: 0.5rem;
		}
		aside nav {
			flex-direction: row;
			flex-wrap: wrap;
			margin-bottom: 0.3rem;
		}
		.group {
			display: none;
		}
		header {
			flex-wrap: wrap;
		}
		header,
		main {
			padding-left: 1rem;
			padding-right: 1rem;
		}
	}
</style>
