<script lang="ts">
	import type { SignupMode } from '#lib/core/tenants.ts';
	import StatusPill from './StatusPill.svelte';

	let { signup }: { signup: SignupMode } = $props();
	const REPO = 'https://github.com/nickwhiteley/projectmagic';
	const cta = $derived(
		signup === 'open'
			? {
					label: 'Start with GitHub',
					note: 'Sign in with GitHub, name your team, connect your repositories.'
				}
			: signup === 'approval'
				? {
						label: 'Request access with GitHub',
						note: 'Project Magic is in early access: sign in with GitHub and name your team, and we switch it on.'
					}
				: {
						label: 'Sign in with GitHub',
						note: 'For people with a team on Project Magic, or an invitation to one.'
					}
	);
</script>

<svelte:head>
	<title>Project Magic: see every project your agents are building</title>
	<meta
		name="description"
		content="One view over the backlogs, plans, branches and pull requests your AI agents keep in GitHub: what is in flight, what has stalled, and what is waiting on you."
	/>
</svelte:head>

<div class="page">
	<header>
		<a class="brand" href="/"><span class="mark">M</span><span>Project Magic</span></a>
		<nav>
			<a href="#features">Features</a>
			<a href="#trust">What it touches</a>
			<a href="#self-host">Self-host</a>
			<a class="button" href="/signin">Sign in</a>
		</nav>
	</header>

	<section class="hero">
		<div>
			<h1>See every project your agents are building, without asking each one.</h1>
			<p class="lede">
				When AI agents build your software, the backlog and the plan live as markdown in each
				repository. Project Magic reads them, with the branches and pull requests, across every
				repository you choose, and shows what is planned, what is in flight, what has stalled, and
				what is waiting on you.
			</p>
			<p class="ctas">
				<a class="button primary" href="/signin">{cta.label}</a>
				<a class="button" href="#how">How it works</a>
			</p>
			<p class="note muted">{cta.note}</p>
			<p class="agents muted">
				For anyone running several repositories with Claude Code, Codex, Cursor or any agent that
				reads <code>AGENTS.md</code>.
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

	<section class="features" id="features">
		<h2>What you get</h2>
		<div class="grid">
			<div>
				<h3>Know where everything is</h3>
				<p>
					A card per repository: what is in progress and on which branch, what is in review, what is
					blocked and why, and how far the plan has got. A Board, a list in priority order and the
					plan for each project, and an Activity feed of the last two weeks across all of them.
				</p>
			</div>
			<div>
				<h3>Accept finished work in one step</h3>
				<p>
					Built items wait on you with their evidence beside them: the preview deployment, the CI
					result, the size of the diff and the acceptance criteria. <em>Accept</em> or
					<em>Send back</em> with a comment, and get a daily Slack digest of what is waiting.
				</p>
			</div>
			<div>
				<h3>Catch work that has stalled or drifted</h3>
				<p>
					Items in progress with nothing moving, merged work still marked in review, and a plan that
					disagrees with the backlog are flagged, never silently resolved. <em>Ask the agent</em> writes
					the comment for you to send.
				</p>
			</div>
			<div>
				<h3>Ask across every project</h3>
				<p>
					“What is blocked on me?” “What shipped this week?” Ask in plain words and get an answer
					from the backlogs, linking to the items, or search every item at once.
				</p>
			</div>
			<div>
				<h3>Plan across repositories</h3>
				<p>
					Epics that group items in several repositories, bugs in their own lane, and how each
					project delivers against its own past: deployments, merged pull requests and CI.
				</p>
			</div>
			<div>
				<h3>Edit without leaving git</h3>
				<p>
					Add, change, reorder or remove items, or drag a card across the Board. Each edit is an
					ordinary commit to the backlog, made as you, and several can be saved as one.
				</p>
			</div>
		</div>
	</section>

	<section class="teams">
		<div>
			<h2>For a team, not just you</h2>
			<p>
				Connect your organisation once. People who can see its repositories on GitHub join when they
				sign in, and what they can do follows their GitHub permissions: read, edit or maintain.
				Invite anyone else by their GitHub login. One team can hold several organisations, and a
				person in several teams switches between them.
			</p>
		</div>
		<div>
			<h2>The files stay the record</h2>
			<p>
				Status comes from the backlog, the plan, branches and pull requests, not from a second
				database to keep in step. Agents and people read and write the same files, and if you stop
				using Project Magic, your backlog is still in your repositories.
			</p>
		</div>
	</section>

	<section class="how" id="how">
		<h2>How it works</h2>
		<ol>
			<li>
				<h3>Connect GitHub</h3>
				<p>
					Sign in with GitHub, name your team, and install the Project Magic App on the account or
					organisation, choosing the repositories to follow. A push or a pull request reaches
					Project Magic within seconds.
				</p>
			</li>
			<li>
				<h3>Your agents keep to a few conventions</h3>
				<p>
					Each new repository gets a <code>backlog.md</code> and a section in
					<code>AGENTS.md</code> and <code>CLAUDE.md</code> that tells agents what to write: an item
					is a <code>###</code> heading with an id and a status line, and branches name the item they
					work on.
				</p>
				<pre><code
						>### OR12 Invoices as PDF
**Status:** in progress · **Size:** M · **Branch:** `feat/or12-invoices`</code
					></pre>
			</li>
			<li>
				<h3>You read, and decide</h3>
				<p>
					The overview shows every project and what waits on you. Accept what is built, answer what
					is blocked, and leave the rest to the agents. An item with no status line gets one
					proposed from its text, marked as inferred.
				</p>
			</li>
		</ol>
	</section>

	<section class="trust" id="trust">
		<h2>What it reads, writes and keeps</h2>
		<dl>
			<dt>Reads</dt>
			<dd>
				Only the repositories you choose when you install the App: the backlog, the plan and the
				docs, branches, pull requests, deployments and CI runs.
			</dd>
			<dt>Writes</dt>
			<dd>
				The edits you make, as you, with your own GitHub permissions, on a
				<code>projectmagic</code> branch merged through a pull request. When a repository is first connected,
				one pull request adds the starter files; nothing that exists is changed.
			</dd>
			<dt>Keeps</dt>
			<dd>
				A cache of those files, which can be rebuilt from GitHub at any time, your GitHub login and
				name, and your GitHub sign-in, encrypted.
			</dd>
			<dt>AI</dt>
			<dd>
				Ask, and the status proposed for an item with no status line, send item text to a model
				provider. A project can turn proposals off, and each person can turn AI off for themselves.
			</dd>
		</dl>
	</section>

	<section class="setup" id="self-host">
		<h2>Or run your own copy</h2>
		<p>
			Project Magic is open source. You need a GitHub App, a Postgres database (Neon’s free tier is
			enough) and somewhere to host a SvelteKit app (it is set up for Vercel). Setting it up takes
			under an hour.
		</p>
		<p>
			<a class="button" href="{REPO}#setting-up">Read the setup guide</a>
			<a class="button" href={REPO}>Source on GitHub</a>
		</p>
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
	footer {
		display: flex;
		justify-content: space-between;
		border-top: 1px solid var(--line);
		padding-top: 1.2rem;
		font-size: 13px;
	}
	.note {
		font-size: 14px;
		margin: 0.7rem 0 0;
	}
	.agents {
		font-size: 14px;
		margin: 1.2rem 0 0;
	}
	.features,
	.teams,
	.trust {
		padding: 3rem 0;
		border-top: 1px solid var(--line);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 2rem 2.5rem;
		margin-top: 1.2rem;
	}
	.grid h3,
	.trust dt {
		font-size: 20px;
		margin-bottom: 0.4rem;
	}
	.teams {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 2.5rem;
	}
	.features p,
	.teams p,
	.trust dd {
		font: 16.5px/1.65 var(--serif);
		color: var(--text-2);
	}
	.trust dl {
		display: grid;
		grid-template-columns: 8rem minmax(0, 1fr);
		gap: 0.8rem 2rem;
		max-width: 56rem;
		margin: 1rem 0 0;
	}
	.trust dt {
		font-family: var(--sans);
		font-size: 15px;
		font-weight: 600;
		padding-top: 0.2rem;
	}
	.trust dd {
		margin: 0;
	}
	.setup p .button + .button {
		margin-left: 0.5rem;
	}
	@media (max-width: 900px) {
		.hero,
		.grid,
		.teams,
		.how ol {
			grid-template-columns: 1fr;
		}
		.trust dl {
			grid-template-columns: 1fr;
			gap: 0.2rem;
		}
		.hero {
			padding-top: 1.5rem;
			gap: 2rem;
		}
	}
</style>
