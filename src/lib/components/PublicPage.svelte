<script lang="ts">
	// The frame of the public pages (home, About, Privacy): brand, sign-in and the footer's links.
	// Signed in, the app's own header is already there, so only the footer is added.
	import { page } from '$app/state';
	import { CONTACT, REPO } from '#lib/site.ts';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<div class="page">
	{#if !page.data.user}
		<header>
			<a class="brand" href="/"><span class="mark">M</span><span>Project Magic</span></a>
			<nav>
				<a href="/#self-host">Self-host</a>
				<a class="button" href="/signin">Sign in</a>
			</nav>
		</header>
	{/if}

	{@render children()}

	<footer class="muted">
		<span>Project Magic</span>
		<nav>
			<a href="/about">About</a>
			<a href="/privacy">Privacy</a>
			<a href={REPO}>Source on GitHub</a>
			<a href="mailto:{CONTACT}">{CONTACT}</a>
		</nav>
	</footer>
</div>

<style>
	.page {
		max-width: 72rem;
		margin: 0 auto;
		padding: 0 1.5rem 3rem;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.2rem 0;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		font: 400 22px var(--serif);
		text-decoration: none;
	}
	.mark {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: 6px;
		background: var(--text);
		color: var(--bg);
		font: 700 19px var(--serif);
	}
	header nav {
		display: flex;
		align-items: center;
		gap: 1.2rem;
		font-size: 14px;
	}
	header nav a:not(.button) {
		text-decoration: none;
		color: var(--text-2);
	}
	footer {
		display: flex;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.6rem 1.2rem;
		border-top: 1px solid var(--line);
		padding-top: 1.2rem;
		margin-top: 1rem;
		font-size: 13px;
	}
	footer nav {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 1.2rem;
	}
</style>
