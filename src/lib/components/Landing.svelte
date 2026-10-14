<script lang="ts">
	import StatusPill from './StatusPill.svelte';

	const REPO = 'https://github.com/nickwhiteley/projectmagic';
</script>

<svelte:head>
	<title>Project Magic: see every project your agents are building</title>
	<meta
		name="description"
		content="A dashboard over the backlogs, plans, branches and pull requests that AI agents keep in markdown in GitHub."
	/>
</svelte:head>

<div class="page">
	<header>
		<a class="brand" href="/"><span class="mark">M</span><span>Project Magic</span></a>
		<nav>
			<a href="{REPO}#readme">Set it up</a>
			<a href={REPO}>GitHub</a>
			<a class="button" href="/signin">Sign in</a>
		</nav>
	</header>

	<section class="hero">
		<div>
			<h1>See every project your agents are building, without asking each one.</h1>
			<p class="lede">
				When AI agents build your software, they keep the backlog and the plan as markdown in each
				repository. Project Magic reads those files, the branches and the pull requests across all
				your repositories, and shows what is planned, what is in flight, what is done, and what is
				waiting on you.
			</p>
			<p class="ctas">
				<a class="button primary" href="{REPO}#setting-up">Run it for your projects</a>
				<a class="button" href="#how">How it works</a>
			</p>
		</div>

		<div class="sample" aria-label="An example project card">
			<div class="card">
				<div class="top">
					<h3>Orchard</h3>
					<span class="badge">1 notice</span>
				</div>
				<p class="muted small">last commit 2 h ago on <code>feat/or12-invoices</code></p>
				<p class="counts">
					<span><StatusPill status="in progress" /> 2</span>
					<span><StatusPill status="blocked" /> 1</span>
					<span><StatusPill status="built" /> 3</span>
					<span><StatusPill status="todo" /> 14</span>
				</p>
				<div class="block">
					<div class="label">Waiting on you · 4</div>
					<p class="row"><code>OR7</code> Renewal reminders <StatusPill status="built" small /></p>
					<p class="muted small">the email copy checked against the terms</p>
				</div>
				<div class="block">
					<div class="label">In flight · 2</div>
					<p class="row"><code>feat/or12-invoices</code> → <code>OR12</code> Invoices as PDF</p>
					<p class="muted small">3 ahead · PR #41 · “Number invoices per tenant”</p>
					<p class="row"><code>spike/hosting</code> <span class="warn">not in the backlog</span></p>
				</div>
				<div class="block">
					<div class="plan">
						<span>Phase 3: billing</span><span class="muted small">6 of 9 done</span>
					</div>
					<div class="bar"><span style="width: 66%"></span></div>
				</div>
			</div>
		</div>
	</section>

	<section class="why">
		<div>
			<h2>One place for every project</h2>
			<p>
				A card per repository: what is in progress and on which branch, what is in review, what is
				blocked and why, and the plan’s next task. No more opening each repository, or asking each
				agent, to find out where things are.
			</p>
		</div>
		<div>
			<h2>What is waiting on you</h2>
			<p>
				Agents can build and merge, but some things need a person: an acceptance check, a decision,
				an account. Items marked <em>built</em> or <em>blocked</em> carry what they wait on, so your own
				queue is on the front page.
			</p>
		</div>
		<div>
			<h2>The files stay the record</h2>
			<p>
				Nothing is held anywhere else. Status comes from the backlog, the plan, branches and pull
				requests, and an edit made here is an ordinary commit to the backlog, merged to main through
				a pull request, as you. Agents and people read the same files.
			</p>
		</div>
	</section>

	<section class="how" id="how">
		<h2>How it works</h2>
		<ol>
			<li>
				<h3>The agents follow a few conventions</h3>
				<p>
					Each backlog item is a <code>###</code> heading that starts with an id, with a status line
					under it. Branches name the item they work on, and pull requests say what they build. A
					block of instructions in each repository’s <code>CLAUDE.md</code> or
					<code>AGENTS.md</code>
					asks the agents to keep to them.
				</p>
				<pre><code
						>### OR12 Invoices as PDF — MONEY
**Status:** in progress · **Size:** M · **Branch:** `feat/or12-invoices`</code
					></pre>
			</li>
			<li>
				<h3>A GitHub App reads the repositories</h3>
				<p>
					Install it on the repositories you want to follow. A push or a pull request reaches
					Project Magic within seconds, and it re-reads only what changed: the branches, the backlog
					and the plan, and the history that shows what shipped.
				</p>
			</li>
			<li>
				<h3>You read, and edit when you need to</h3>
				<p>
					An overview, then per project a list in priority order, a board, the plan, what is done,
					the branches and the documents. Change an item’s status, add one, reorder or remove them;
					each edit is a commit you made.
				</p>
			</li>
		</ol>
	</section>

	<section class="setup">
		<h2>Run it for your projects</h2>
		<p>
			Project Magic is open source and runs on your own accounts. You need a GitHub account, a
			Postgres database (Neon’s free tier is enough) and somewhere to host a SvelteKit app (it is
			set up for Vercel). Setting it up takes under an hour:
		</p>
		<ol class="steps">
			<li>Paste the conventions into each repository’s agent instructions.</li>
			<li>Register a GitHub App and install it on those repositories.</li>
			<li>Create the database and deploy the app with its environment.</li>
			<li>Sign in with GitHub.</li>
		</ol>
		<p><a class="button primary" href="{REPO}#setting-up">Read the setup guide</a></p>
	</section>

	<footer class="muted">
		<span>Project Magic</span>
		<a href={REPO}>Source on GitHub</a>
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
	.hero {
		display: grid;
		grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
		gap: 3rem;
		align-items: center;
		padding: 3.5rem 0 4rem;
	}
	h1 {
		font-size: clamp(34px, 4.6vw, 54px);
		line-height: 1.08;
		letter-spacing: -0.02em;
	}
	.lede {
		font: 19px/1.6 var(--serif);
		color: var(--text-2);
		max-width: 38rem;
		margin: 1.3rem 0 1.6rem;
	}
	.ctas {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
	}
	.ctas .button,
	.setup .button {
		padding: 0.55rem 1rem;
		font-size: 14px;
	}
	.sample .card {
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 12px;
		padding: 1.1rem 1.3rem;
		box-shadow: 0 18px 50px -24px rgb(60 40 20 / 0.25);
		font-size: 13.5px;
	}
	.top {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.card h3 {
		font-size: 26px;
	}
	.badge {
		font-size: 12px;
		padding: 0.1rem 0.55rem;
		border-radius: 999px;
		background: var(--warn-bg);
		color: var(--warn);
	}
	.small {
		font-size: 12.5px;
		margin: 0.15rem 0;
	}
	.counts {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 0.9rem;
		margin: 0.7rem 0;
	}
	.counts span {
		display: inline-flex;
		gap: 0.3rem;
		align-items: center;
	}
	.block {
		border-top: 1px solid var(--line);
		padding: 0.6rem 0 0.2rem;
	}
	.row {
		margin: 0.35rem 0 0;
		display: flex;
		gap: 0.4rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.warn {
		color: var(--warn);
	}
	.plan {
		display: flex;
		justify-content: space-between;
	}
	.bar {
		height: 6px;
		background: var(--surface-3);
		border-radius: 3px;
		margin: 0.4rem 0;
		overflow: hidden;
	}
	.bar span {
		display: block;
		height: 100%;
		background: var(--st-done);
	}
	section h2 {
		font-size: 28px;
		margin-bottom: 0.6rem;
	}
	.why {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 2.5rem;
		padding: 3rem 0;
		border-top: 1px solid var(--line);
	}
	.why h2 {
		font-size: 24px;
	}
	.why p,
	.how p,
	.setup p {
		font: 16.5px/1.65 var(--serif);
		color: var(--text-2);
	}
	.how,
	.setup {
		padding: 3rem 0;
		border-top: 1px solid var(--line);
	}
	.how ol {
		list-style: none;
		padding: 0;
		margin: 1rem 0 0;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 2.5rem;
		counter-reset: step;
	}
	.how li {
		counter-increment: step;
	}
	.how li::before {
		content: counter(step);
		display: inline-grid;
		place-items: center;
		width: 1.8rem;
		height: 1.8rem;
		border-radius: 50%;
		background: var(--surface-3);
		font: 500 14px var(--sans);
		margin-bottom: 0.7rem;
	}
	.how h3 {
		font-size: 20px;
		margin-bottom: 0.4rem;
	}
	.how pre {
		background: var(--surface-2);
		border-radius: var(--radius);
		padding: 0.7rem 0.9rem;
		font-size: 12px;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.setup > * {
		max-width: 46rem;
	}
	.setup .button {
		font-family: var(--sans);
	}
	.steps {
		font: 16.5px/1.9 var(--serif);
		padding-left: 1.3rem;
	}
	footer {
		display: flex;
		justify-content: space-between;
		border-top: 1px solid var(--line);
		padding-top: 1.2rem;
		font-size: 13px;
	}
	@media (max-width: 900px) {
		.hero,
		.why,
		.how ol {
			grid-template-columns: 1fr;
		}
		.hero {
			padding-top: 1.5rem;
			gap: 2rem;
		}
	}
</style>
