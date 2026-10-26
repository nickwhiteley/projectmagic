<script lang="ts">
	import PublicPage from '#lib/components/PublicPage.svelte';
	import { CONTACT, REPO } from '#lib/site.ts';
</script>

<svelte:head>
	<title>About · Project Magic</title>
	<meta name="description" content="Who builds Project Magic, and why." />
</svelte:head>

<PublicPage>
	<article class="prose">
		<h1>About Project Magic</h1>
		<p>
			Project Magic keeps the backlog, the plan and the docs where the code is: as markdown in the
			repository, versioned, branched, reviewed and merged with it. It reads every branch’s copy
			across your repositories, reports what is really happening, and guides the people and the AI
			agents doing the work towards delivery.
		</p>

		<h2>Who builds it</h2>
		<p>
			Project Magic is built by Nick Whiteley, in the UK. It began as the tool Nick needed to follow
			several products being built by AI agents at once, without opening each repository or asking
			each agent where things were. It is built with itself: its own backlog is a
			<code>backlog.md</code> that Project Magic reads.
		</p>

		<h2>Open source</h2>
		<p>
			The code is open source under the MIT licence. You can use the hosted service, or
			<a href="/#self-host">run your own copy</a> from
			<a href={REPO}>the repository on GitHub</a>.
		</p>

		<h2>Get in touch</h2>
		<p>
			Write to <a href="mailto:{CONTACT}">{CONTACT}</a>. Signed in, you can also send feedback from
			the menu under your name.
		</p>
	</article>
</PublicPage>

<style>
	.prose {
		max-width: 44rem;
		padding: 2rem 0 3rem;
	}
	.prose h1 {
		font-size: clamp(32px, 4vw, 44px);
		margin-bottom: 1.2rem;
	}
	.prose h2 {
		font-size: 24px;
		margin: 2rem 0 0.5rem;
	}
	.prose p {
		font: 17px/1.65 var(--serif);
		color: var(--text-2);
	}
</style>
