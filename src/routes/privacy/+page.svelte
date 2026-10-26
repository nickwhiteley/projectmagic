<script lang="ts">
	import PublicPage from '#lib/components/PublicPage.svelte';
	import { CONTACT } from '#lib/site.ts';
</script>

<svelte:head>
	<title>Privacy · Project Magic</title>
	<meta
		name="description"
		content="What the hosted Project Magic service collects, why, and your rights."
	/>
</svelte:head>

<PublicPage>
	<article class="prose">
		<h1>Privacy policy</h1>
		<p class="muted">Last updated 26 October 2026</p>

		<h2>Who we are</h2>
		<p>
			The hosted Project Magic service is run by Nick Whiteley, in the United Kingdom, who is the
			controller of the personal data it holds under UK data protection law (the UK GDPR and the
			Data Protection Act 2018). Contact: <a href="mailto:{CONTACT}">{CONTACT}</a>.
		</p>
		<p>
			Project Magic is also open source. A copy that someone else runs is theirs, and this policy
			does not cover it.
		</p>

		<h2>What we collect</h2>
		<ul>
			<li>
				<strong>Your GitHub account</strong>, when you sign in with GitHub: your numeric GitHub id,
				your login and your name. We also keep a GitHub sign-in token, encrypted, so the edits you
				make here are made as you.
			</li>
			<li>
				<strong>Your teams</strong>: the teams you belong to, your role in each, invitations (by
				GitHub login), and a record of admin actions such as inviting or removing someone.
			</li>
			<li>
				<strong>The repositories you connect</strong>: the backlog, bugs, plan, epics and settings
				files on each active branch, the docs you open, branch names, commit headlines, pull request
				titles and descriptions, and deployment and CI results. These can include names and anything
				else written in them.
			</li>
			<li>
				<strong>What you do here</strong>: the edits and comments you make (which are also commits
				in your repositories on GitHub), your preferences, and feedback you send.
			</li>
			<li>
				<strong>A team’s Slack webhook</strong>, encrypted, if a team admin sets up the daily
				digest.
			</li>
			<li>
				<strong>Fault records</strong>: when something fails, the page, the error and the time,
				linked to your account and team so it can be put right.
			</li>
		</ul>
		<p>
			We don’t collect payment details today. When paid plans start, this policy will say what is
			collected and by whom before anything is.
		</p>

		<h2>Cookies</h2>
		<p>
			Two cookies, both needed for the service to work: one keeps you signed in (for up to 30 days),
			and one holds the state of a sign-in while you are on GitHub. There are no analytics,
			advertising or tracking cookies.
		</p>

		<h2>Why, and on what basis</h2>
		<ul>
			<li>
				<strong>To provide the service you asked for</strong> (performing our contract with you): signing
				you in, showing your teams’ projects, and making your edits.
			</li>
			<li>
				<strong>To keep it secure and working</strong> (our legitimate interests): fault records, limits
				on use, and the record of admin actions.
			</li>
		</ul>
		<p>We don’t sell personal data, and we don’t use it for advertising.</p>

		<h2>Who else handles it</h2>
		<ul>
			<li>
				<strong>GitHub</strong>: sign-in, and the source of everything Project Magic reads and
				writes.
			</li>
			<li><strong>Vercel</strong>: hosts the service, and keeps request logs.</li>
			<li><strong>Neon</strong>: the database, in London.</li>
			<li>
				<strong>Ollama</strong>: its hosted models answer <em>Ask</em> and propose a status for an item
				that has none. They receive the text of items, not your account details.
			</li>
			<li>
				<strong>Slack</strong>: only if a team admin sets up the digest, and then only to that
				team’s own Slack.
			</li>
		</ul>
		<p>
			Some of these process data outside the UK, including in the United States. Where they do, the
			transfer relies on the safeguards they provide, such as the UK International Data Transfer
			Addendum or the UK Extension to the EU–US Data Privacy Framework.
		</p>

		<h2>AI</h2>
		<p>
			A project can turn status proposals off in its <code>.projectmagic.yml</code>
			(<code>inference: false</code>), and then its items are not sent for them. Each person can
			hide proposals in <em>Settings</em> and choose not to use <em>Ask</em>.
		</p>

		<h2>How long we keep it</h2>
		<ul>
			<li>
				Repository content is a cache: it is refreshed from GitHub, and file text that is no longer
				current is dropped after 14 days.
			</li>
			<li>Fault and background-job records: 90 days. Invitations: 14 days unless accepted.</li>
			<li>
				A deleted team, with its projects and records, is removed for good 30 days after it is
				deleted.
			</li>
			<li>
				Deleting your account (<em>Settings → Delete your account</em>) removes your account, your
				GitHub token, your preferences and your feedback at once. Records of edits and admin actions
				stay with their team, no longer linked to you. Commits you made stay in your repositories on
				GitHub.
			</li>
		</ul>

		<h2>Your rights</h2>
		<p>
			You can ask for a copy of your personal data, have it corrected or deleted, restrict or object
			to how it is used, and have it moved to another service. Write to
			<a href="mailto:{CONTACT}">{CONTACT}</a>; we answer within a month. If you are unhappy with
			how we handle your data, you can complain to the Information Commissioner’s Office at
			<a href="https://ico.org.uk/make-a-complaint/">ico.org.uk</a>.
		</p>

		<h2>Children</h2>
		<p>
			Project Magic needs a GitHub account, which GitHub allows only from the age of 13, and it is
			meant for people building software at work.
		</p>

		<h2>Changes</h2>
		<p>
			When this policy changes, the date at the top changes with it. A change in what we collect or
			who handles it will be announced in the service before it takes effect.
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
		margin-bottom: 0.4rem;
	}
	.prose h2 {
		font-size: 24px;
		margin: 2rem 0 0.5rem;
	}
	.prose p,
	.prose li {
		font: 17px/1.65 var(--serif);
		color: var(--text-2);
	}
	.prose li {
		margin-bottom: 0.5rem;
	}
	.prose ul {
		padding-left: 1.2rem;
	}
</style>
