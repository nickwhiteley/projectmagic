<script lang="ts">
	import { page } from '$app/state';
	import StatusPill from '#lib/components/StatusPill.svelte';
	import { ago } from '#lib/format.ts';

	let { data } = $props();
	const repo = $derived(page.params.repo!);
	const RULES: Record<number, string> = {
		1: 'done in the backlog',
		2: 'a linked pull request is open',
		3: 'main says todo, but a branch shows work under way',
		4: 'the item’s meta line on main',
		5: 'no meta line, so the linked plan task',
		6: 'no meta line and no other evidence'
	};
</script>

<svelte:head><title>{data.item?.id ?? data.done?.id} · {page.data.project.name}</title></svelte:head
>

{#if data.done}
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
				{#if it.pending}<span class="tag pending">pending edit</span>{/if}
			</p>
			<h2>{@html it.titleHtml}</h2>
			<div class="prose">{@html it.bodyHtml}</div>

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
