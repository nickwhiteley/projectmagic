<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { page } from '$app/state';
	import StatusPill from '#lib/components/StatusPill.svelte';
	import { refreshAll } from '$app/navigation';
	import { ago } from '#lib/format.ts';

	let { data } = $props();
	// An item just added that the sync hasn't brought in yet: look again shortly (PM17).
	$effect(() => {
		if (!data.adding) return;
		const t = setTimeout(() => refreshAll(), 2000);
		return () => clearTimeout(t);
	});
	const repo = $derived(page.params.repo!);
	const editUrl = $derived(`/p/${repo}/i/${encodeURIComponent(page.params.id!)}/edit`);
	const openPrs = $derived(
		(data.item?.prs ?? []).filter((p) => p.state === 'OPEN' && p.branch !== 'projectmagic')
	);
	// A comment for the agents (PM32). The action is the edit page's, so its answer is read here.
	let comment = $state('');
	let commenting = $state(false);
	let commentError = $state<string | null>(null);
	const sendComment: SubmitFunction = () => {
		commenting = true;
		commentError = null;
		return async ({ result, update }) => {
			if (result.type === 'failure')
				commentError = String(
					(result.data as { message?: string } | undefined)?.message ?? 'The comment wasn’t saved.'
				);
			else if (result.type === 'error') commentError = 'The comment wasn’t saved.';
			else {
				comment = '';
				await update();
			}
			commenting = false;
		};
	};
	const RULES: Record<number, string> = {
		1: 'done in the backlog',
		2: 'a linked pull request is open',
		3: 'main says todo, but a branch shows work under way',
		4: 'the item’s meta line on main',
		5: 'no meta line, so the linked plan task',
		6: 'no meta line and no other evidence'
	};
</script>

<svelte:head
	><title
		>{data.item?.id ?? data.done?.id ?? data.deleted?.id ?? page.params.id} · {page.data.project
			.name}</title
	></svelte:head
>

{#if !data.adding}
	<p class="back small"><a href="/p/{repo}">← All items</a></p>
{/if}

{#if data.adding}
	<p class="muted" role="status" aria-live="polite">
		Adding <code>{page.params.id}</code>. It shows here as soon as GitHub has it.
	</p>
{:else if data.deleted}
	<article class="item">
		<div class="main">
			<p class="muted"><code>{data.deleted.id}</code> · deleted</p>
			<h2>{data.deleted.title}</h2>
			<p class="muted small">
				Deleted from the backlog {ago(data.deleted.at)}{#if data.deleted.by}
					by @{data.deleted.by}{/if}
				in
				<a href="{data.repoUrl}/commit/{data.deleted.commit}"
					><code>{data.deleted.commit.slice(0, 7)}</code></a
				>. It was never shipped. Its last text on main:
			</p>
			<div class="prose">{@html data.deleted.bodyHtml}</div>
		</div>
	</article>
{:else if data.done}
	<article class="item">
		<div class="main">
			<p class="muted"><code>{data.done.id}</code> · shipped</p>
			<h2>{data.done.title}</h2>
			<p class="muted small">
				Removed from the backlog {ago(data.done.at)}
				{#if data.done.commit}in <a href="{data.repoUrl}/commit/{data.done.commit}"
						><code>{data.done.commit.slice(0, 7)}</code></a
					>{/if}
				{#if data.done.pr}· <a href="{data.repoUrl}/pull/{data.done.pr}">PR #{data.done.pr}</a
					>{/if}. Its last text on main:
			</p>
			<div class="prose">{@html data.done.bodyHtml}</div>
		</div>
	</article>
{:else if data.item}
	{@const it = data.item}
	<article class="item">
		<div class="main">
			<p class="meta-line">
				<code class="id">{it.id}</code>
				{#if it.star}<span class="tag star">★ on the cut line</span>{/if}
				{#if it.job}<span class="tag">{it.job}</span>{/if}
				{#if it.size}<span class="tag mono">{it.size}</span>{/if}
				{#if it.assignee}<span class="tag mono" title="For">for {it.assignee}</span>{/if}
				{#if it.type === 'bug'}<span class="tag bug">bug</span>{/if}
				{#if it.epic}<a class="tag mono" href="/p/{repo}/epics#{it.epic}" title="Epic">{it.epic}</a
					>{/if}
				{#if it.pending}<span class="tag pending">pending edit</span>{/if}
			</p>
			<div class="title-row">
				<h2>{@html it.titleHtml}</h2>
				{#if page.data.project.canEdit}<a
						class="button"
						href="/p/{repo}/i/{encodeURIComponent(it.id)}/edit">Edit</a
					>{/if}
			</div>
			{#if it.found || it.raised}<p class="muted small">
					{#if it.found}Found in {it.found}.{/if}
					{#if it.raised}Raised {it.raised}.{/if}
				</p>{/if}
			{#if page.url.searchParams.get('pending')}<p class="muted small">
					Saved. It reaches {data.main} when the edits PR is merged.
				</p>{/if}
			{#if it.reply}
				<div class="reply-notice small" role="status">
					<span>An agent replied to a comment on {it.reply}. Its reply is under Comments.</span>
					{#if page.data.project.canEdit}
						<form method="POST" action="{editUrl}?/read" use:enhance>
							<button class="button">Mark read</button>
						</form>
					{/if}
				</div>
			{/if}
			<div class="prose">{@html it.bodyHtml}</div>

			{#if page.data.project.canEdit}
				<form
					method="POST"
					action="{editUrl}?/comment"
					class="comment-form"
					use:enhance={sendComment}
				>
					<label class="label" for="comment">Comment for the agents</label>
					<textarea
						id="comment"
						name="text"
						rows="4"
						maxlength="4000"
						bind:value={comment}
						placeholder="What should the agent working on {it.id} know?"></textarea>
					<p class="muted small">
						It is added to the item under Comments, signed and dated, with <code>Comment:</code> set
						so the agents read it{#if it.status === 'built' || it.status === 'done'}, and {it.id} goes
							back to todo{/if}.{#if openPrs.length}
							It is also posted on {#each openPrs as p, i (p.number)}{i ? ' and ' : ''}PR #{p.number}{/each}.{/if}
					</p>
					{#if commentError}<p class="error small" role="alert">{commentError}</p>{/if}
					<button class="button" disabled={commenting || !comment.trim()} aria-busy={commenting}
						>{commenting ? 'Commenting…' : 'Comment'}</button
					>
				</form>
			{/if}

			{#if it.olderCopies.length}
				<p class="muted small older">
					Other branches carry a different copy of this item, usually because they are behind main:
					{#each it.olderCopies as b, i (b)}{i ? ', ' : ''}<code>{b}</code>{/each}.
				</p>
			{/if}
			{#if it.diffs.length}
				<section class="diffs">
					<h3>On branches</h3>
					{#each it.diffs as d (d.branch)}
						<p class="muted small">Main’s version against <code>{d.branch}</code>’s:</p>
						<pre class="diff">{#each d.lines as l, i (i)}<span class={l.kind}
									>{l.kind === 'add' ? '+ ' : l.kind === 'del' ? '- ' : '  '}{l.text}
</span>{/each}</pre>
					{/each}
				</section>
			{/if}
		</div>

		<aside>
			<section>
				<div class="label">Status</div>
				<p>
					<StatusPill status={it.status} />{#if it.blocked && it.status !== 'blocked'}
						<StatusPill status="blocked" small />{/if}
				</p>
				<p class="small">{it.source}</p>
				<p class="muted small">
					From {RULES[it.rule]}{it.rule === 2 || it.rule === 3 ? ` (${it.sourceDetail})` : ''}.
				</p>
				{#if it.waitingHtml}<p class="waiting small">Waiting on {@html it.waitingHtml}</p>{/if}
				{#if it.comment}<p class="small">
						A comment of {it.comment} is waiting for an agent to read it.
					</p>{/if}
				{#if it.inferred && !page.data.ai?.optedOut}
					<p class="small">
						<em>Inferred</em>: <StatusPill
							status={it.inferred.status}
							small
						/>{#if it.inferred.waiting}
							waiting on {it.inferred.waiting}{/if}
					</p>
					<p class="muted small">
						Proposed by {it.inferred.model} from this item’s text. Add a meta line to replace it.
					</p>
				{/if}
				{#if page.data.project.canEdit && it.status === 'built'}
					<form method="POST" action="/p/{repo}/i/{encodeURIComponent(it.id)}/edit?/status">
						<input type="hidden" name="status" value="done" />
						<input type="hidden" name="back" value="/p/{repo}/i/{encodeURIComponent(it.id)}" />
						<button class="button" title="Mark {it.id} done">Accept</button>
					</form>
				{/if}
			</section>

			{#if it.disagreements.length || it.hints.length || it.noMeta}
				<section class="notice">
					{#each it.disagreements as d (d)}<p class="small">{d}</p>{/each}
					{#each it.hints as h (h)}<p class="small">Hint: {h}</p>{/each}
					{#if it.noMeta}<p class="small">
							This item has no meta line, so its status is inferred.
						</p>{/if}
				</section>
			{/if}

			{#if it.meta.length}
				<section>
					<div class="label">Meta line</div>
					<dl>
						{#each it.meta as e (e.key)}<dt>{e.key}</dt>
							<dd>{@html e.html}</dd>{/each}
					</dl>
				</section>
			{/if}

			<section>
				<div class="label">Linked</div>
				{#if !it.branches.length && !it.prs.length && !it.tasks.length && !it.inferredBranches.length}<p
						class="muted small"
					>
						Nothing yet.
					</p>{/if}
				<ul>
					{#each it.branches as b (b.name)}
						<li>
							<a href="{data.repoUrl}/tree/{b.name}"><code>{b.name}</code></a>
							<span class="muted"
								>{b.ahead} ahead · {ago(b.committedAt)}{b.active ? '' : ' · stale'}</span
							>
						</li>
					{/each}
					{#each it.inferredBranches as b (b)}
						<li class="inferred">
							<a href="{data.repoUrl}/tree/{b}"><code>{b}</code></a>
							<span class="muted">inferred from the branch’s name; not used for status</span>
						</li>
					{/each}
					{#each it.prs as p (p.number)}
						<li>
							<a href={p.url}>PR #{p.number}</a>
							{p.title} <span class="muted">{p.state.toLowerCase()}{p.draft ? ', draft' : ''}</span>
						</li>
					{/each}
					{#each it.tasks as t (t.number)}
						<li>
							<a href="/p/{repo}/plan#task-{t.number}">Plan task <code>{t.number}</code></a>
							<StatusPill status={t.status} small /> <span class="muted">{@html t.titleHtml}</span>
						</li>
					{/each}
				</ul>
			</section>

			<section>
				<div class="label">Where</div>
				<p class="small">
					{it.section ?? 'Before the first section'} ·
					<a href="{data.repoUrl}/blob/{data.main}/backlog.md#L{it.line}"
						>backlog.md line {it.line}</a
					>
				</p>
			</section>
		</aside>
	</article>
{/if}

<style>
	.back {
		margin: 0 0 0.5rem;
	}
	.back a {
		text-decoration: none;
		color: var(--text-2);
	}
	.item {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 20rem;
		gap: 2.5rem;
		align-items: start;
	}
	h2 {
		font-size: 32px;
		margin: 0.3rem 0 1.25rem;
	}
	.title-row {
		display: flex;
		justify-content: space-between;
		align-items: start;
		gap: 1rem;
	}
	.title-row .button {
		margin-top: 0.6rem;
	}
	.meta-line {
		display: flex;
		gap: 0.4rem;
		align-items: center;
		margin: 0;
	}
	.id {
		font-size: 14px;
	}
	.tag {
		font: 600 10.5px/16px var(--sans);
		border: 1px solid var(--line-strong);
		border-radius: 4px;
		padding: 0 0.35rem;
		color: var(--text-2);
	}
	.tag.mono {
		font-family: var(--mono);
		font-weight: 500;
	}
	.tag.star {
		color: var(--warn);
		border-color: var(--warn);
	}
	.tag.bug {
		border-color: var(--danger);
		color: var(--danger);
	}
	.tag.pending {
		color: var(--accent);
		border-color: var(--accent);
	}
	.small {
		font-size: 13px;
		margin: 0.3rem 0;
	}
	aside {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		position: sticky;
		top: 4rem;
	}
	aside section {
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 8px;
		padding: 0.75rem 0.9rem;
	}
	aside .notice {
		background: var(--warn-bg);
		border-color: transparent;
		color: var(--warn);
	}
	.waiting {
		color: var(--warn);
	}
	.reply-notice {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		background: var(--warn-bg);
		color: var(--warn);
		border-radius: 8px;
		padding: 0.5rem 0.9rem;
		margin: 0 0 1rem;
	}
	.reply-notice form {
		margin: 0;
	}
	.comment-form {
		display: flex;
		flex-direction: column;
		align-items: start;
		gap: 0.4rem;
		margin-top: 2rem;
	}
	.comment-form textarea {
		border: 1px solid var(--line-strong);
		background: var(--card);
		border-radius: var(--radius);
		padding: 0.4rem 0.55rem;
		width: 100%;
		font: inherit;
		font-size: 14px;
		line-height: 1.55;
		resize: vertical;
	}
	.error {
		color: var(--danger);
	}
	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.2rem 0.75rem;
		margin: 0.4rem 0 0;
		font-size: 13px;
	}
	dt {
		color: var(--text-3);
	}
	dd {
		margin: 0;
	}
	ul {
		list-style: none;
		padding: 0;
		margin: 0.4rem 0 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		font-size: 13px;
	}
	.diffs {
		margin-top: 2.5rem;
	}
	.inferred {
		border-left: 2px dashed var(--line-strong);
		padding-left: 0.4rem;
	}
	.older {
		margin-top: 2rem;
	}
	.diffs h3 {
		font-size: 22px;
	}
	.diff {
		background: var(--surface-1);
		border-radius: var(--radius);
		padding: 0.6rem 0;
		font: 12.5px/1.55 var(--mono);
		overflow-x: auto;
		white-space: pre-wrap;
	}
	.diff span {
		display: block;
		padding: 0 0.8rem;
	}
	.diff .add {
		background: var(--add-bg);
	}
	.diff .del {
		background: var(--del-bg);
	}
	@media (max-width: 1000px) {
		.item {
			grid-template-columns: 1fr;
		}
		aside {
			position: static;
		}
	}
</style>
