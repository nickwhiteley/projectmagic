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
	<title>Project Magic: your backlog, versioned with your code</title>
	<meta
		name="description"
		content="Keep the backlog, the plan and the docs in the repository, versioned and branched with the code. Project Magic reads every branch's copy across your repositories, reports what is really happening, and guides people and agents to delivery."
	/>
</svelte:head>

<div class="page">
	<header>
		<a class="brand" href="/"><span class="mark">M</span><span>Project Magic</span></a>
		<nav>
			<a href="#self-host">Self-host</a>
			<a class="button" href="/signin">Sign in</a>
		</nav>
	</header>

	<section class="hero">
		<div>
			<h1>Your backlog belongs next to your code. Project Magic reads every version of it.</h1>
			<p class="lede">
				Keep the backlog, the plan and the docs as markdown in the repository, and the truth about
				your product is versioned, branched, reviewed and merged just like the code. Project Magic
				reads every branch’s copy across all your repositories, reports what is really happening,
				and guides people and agents to delivery.
			</p>
			<p class="ctas">
				<a class="button primary" href="/signin">{cta.label}</a>
			</p>
			<p class="note muted">{cta.note}</p>
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

	<section class="why" id="why">
		<h2>Why the backlog lives in the repository</h2>
		<p class="intro">
			A spreadsheet or Jira can list the same items. But they hold one copy, kept somewhere else,
			that someone has to remember to update, so it drifts from the code it describes.
		</p>
		<div class="grid">
			<div>
				<h3>Versioned with the code</h3>
				<p>
					Every change to an item, the plan or a doc is a commit. It has an author, a history and a
					diff, and can be reverted. The backlog as it stood at a release is the backlog at that
					tag.
				</p>
			</div>
			<div>
				<h3>Branched with the code</h3>
				<p>
					An agent claims an item and adds plan tasks on its own branch. That version of the truth
					is reviewed in the same pull request as the work and merges with it. There is no ticket to
					update separately, so none falls out of step.
				</p>
			</div>
			<div>
				<h3>Where the agents already work</h3>
				<p>
					Agents read <code>backlog.md</code> and the docs from their checkout, with no API, token or
					integration to set up. People and agents read and write the same files.
				</p>
			</div>
		</div>
		<p class="catch">
			The cost is that the truth is spread across repositories and branches, and no one can read it
			all. Project Magic does.
		</p>
	</section>

	<section class="sees" id="sees">
		<h2>What Project Magic sees</h2>
		<div class="grid">
			<div>
				<h3>Into every branch</h3>
				<p>
					It reads the backlog, bugs and plan on every active branch, not only on main. An item
					marked in progress on a branch shows as in progress before anything merges, and plan tasks
					a branch adds are counted. A branch that names no item is shown as work not in the
					backlog.
				</p>
			</div>
			<div>
				<h3>Where the versions disagree</h3>
				<p>
					A backlog that says one thing and a plan that says another, a reference to a task that
					doesn’t exist, merged work still marked in review, and work in progress with nothing
					moving. Each is shown, never quietly resolved.
				</p>
			</div>
			<div>
				<h3>What shipped, from git</h3>
				<p>
					An item removed from main’s backlog is done, and the history says when and in which pull
					request. Epics and references can span repositories, so work that depends on another
					repository is visible from both.
				</p>
			</div>
		</div>
	</section>

	<section class="guides">
		<div>
			<h2>It reports</h2>
			<ul>
				<li>
					An overview of every project: in flight, blocked and why, and how far the plan has got.
				</li>
				<li>
					<em>Waiting on you</em>: built work with its preview, CI result and diff, to accept or
					send back in one step, and a daily Slack digest.
				</li>
				<li>Delivery against each project’s own past: deployments, merged pull requests and CI.</li>
				<li><em>Ask</em> in plain words across every backlog, plus search and an activity feed.</li>
			</ul>
		</div>
		<div>
			<h2>It guides people and agents</h2>
			<ul>
				<li>
					Each connected repository gets the conventions written into <code>AGENTS.md</code> and
					<code>CLAUDE.md</code>, so Claude Code, Codex, Cursor and the rest know what to write.
				</li>
				<li>
					A comment for the agents goes into the item and onto its open pull request, flagged for
					the agent to act on. Agents reply in the same place.
				</li>
				<li>
					When work stalls or drifts, <em>Ask the agent</em> writes the comment for you to send.
				</li>
				<li>
					Edits made here, including dragging a card across the Board, are commits made as you, so
					people change the truth the same way agents do.
				</li>
			</ul>
		</div>
	</section>

	<section class="teams">
		<h2>For a team, not just you</h2>
		<p>
			Connect your organisation once. People who can see its repositories on GitHub join when they
			sign in, and what they can do follows their GitHub permissions. Invite anyone else by their
			GitHub login. One team can hold several organisations, and a person in several teams switches
			between them.
		</p>
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

	<section class="pricing">
		<h2>Pricing</h2>
		<p>
			We intend to charge for larger hosted teams, with more people and more projects. Running your
			own copy stays free.
		</p>
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
	.why,
	.sees,
	.pricing,
	.guides,
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
	.guides {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 2.5rem;
	}
	.guides ul {
		padding-left: 1.1rem;
		margin: 0;
	}
	.guides li {
		margin-bottom: 0.6rem;
	}
	.pricing > *,
	.teams > * {
		max-width: 46rem;
	}
	.intro,
	.catch {
		max-width: 46rem;
	}
	.catch {
		margin-top: 2rem;
		font-style: italic;
	}
	.why p,
	.sees p,
	.guides li,
	.teams p,
	.pricing p,
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
		.guides,
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
