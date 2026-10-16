<script lang="ts">
	import StatusPill from '#lib/components/StatusPill.svelte';
	import { ago, duration, plural, STATUS_ORDER } from '#lib/format.ts';

	import type { Summary } from '#lib/server/summary.ts';
	import type { cardLine } from '#lib/server/delivery.ts';

	let {
		data
	}: {
		data: {
			cards: (Summary & { canEdit: boolean; delivery: ReturnType<typeof cardLine> | null })[];
			now: number;
		};
	} = $props();
	const tracked = $derived(data.cards.filter((c) => c.hasBacklog));
	const others = $derived(data.cards.filter((c) => !c.hasBacklog));
	const waiting = $derived(tracked.reduce((n, c) => n + c.waitingCount, 0));
	const inFlight = $derived(tracked.reduce((n, c) => n + c.inFlight.length, 0));
</script>

<svelte:head><title>Overview · Project Magic</title></svelte:head>

<div class="head">
	<div>
		<h1>Overview</h1>
		<p class="muted">What is planned, in flight and done, across every project.</p>
	</div>
	<p class="totals">
		{plural(tracked.length, 'project')} · {inFlight} in flight ·
		<strong>{waiting} waiting on you</strong>
	</p>
</div>

<div class="cards">
	{#each tracked as c (c.repo)}
		<section class="card">
			<div class="top">
				<div>
					<h2><a href="/p/{c.repo}">{c.name}</a></h2>
					{#if c.lastCommit}
						<p class="muted small">
							last commit {ago(c.lastCommit.at, data.now)} on <code>{c.lastCommit.branch}</code>
						</p>
					{/if}
				</div>
				<div class="badges">
					{#if c.pending}<span class="badge"
							>{c.pending} pending edit{c.pending === 1 ? '' : 's'}</span
						>{/if}
					{#if c.notices}<a class="badge warn" href="/p/{c.repo}#health"
							>{plural(c.notices, 'notice')}</a
						>{/if}
				</div>
			</div>

			{#if c.lastError}<p class="error" role="alert">Last sync failed: {c.lastError}</p>{/if}

			<div class="counts">
				{#each STATUS_ORDER.filter((s) => s !== 'done' && c.counts[s]) as s (s)}
					<a href="/p/{c.repo}?status={encodeURIComponent(s)}"
						><StatusPill status={s} /> {c.counts[s]}</a
					>
				{/each}
				<span><StatusPill status="done" /> {c.done14} in 14 days</span>
			</div>

			{#if c.delivery?.has}
				<p class="delivery small">
					<a href="/p/{c.repo}/delivery#deploys"
						>{plural(c.delivery.deploysThisWeek, 'deploy')} this week</a
					>
					·
					<a href="/p/{c.repo}/delivery#lead">lead time {duration(c.delivery.leadTimeHours)}</a>
					·
					<a href="/p/{c.repo}/delivery#restore"
						>{plural(c.delivery.bugs, 'production bug')} in 4 weeks</a
					>
					·
					<a href="/p/{c.repo}/delivery#queue">{c.delivery.queue} in the queue</a>
				</p>
			{/if}

			{#if c.waiting.length}
				<div class="block">
					<div class="label">Waiting on you · {c.waitingCount}</div>
					<ul class="waiting">
						{#each c.waiting as w (w.id)}
							<li>
								<a href="/p/{c.repo}/i/{w.id}"><code>{w.id}</code> {w.title}</a>
								<StatusPill status={w.status} small />
								{#if c.canEdit && w.status === 'built'}
									<form class="accept" method="POST" action="/p/{c.repo}/i/{w.id}/edit?/status">
										<input type="hidden" name="status" value="done" />
										<input type="hidden" name="back" value="/" />
										<button class="button small" title="Mark {w.id} done">Accept</button>
									</form>
								{/if}
								<div class="muted small">{@html w.waitingHtml}</div>
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			<div class="block">
				<div class="label">In flight · {c.inFlight.length}</div>
				{#if c.inFlight.length}
					<ul class="flight">
						{#each c.inFlight as b (b.name)}
							<li class:unlinked={b.unlinked}>
								<div class="row">
									<code>{b.name}</code>
									{#if b.items.length}
										<span
											>→ {#each b.items as it, i (it.id)}{i ? ', ' : ''}<a
													href="/p/{c.repo}/i/{it.id}"><code>{it.id}</code> {it.title}</a
												>{/each}</span
										>
									{:else if b.inferred}
										<span
											>→ <a class="inferred" href="/p/{c.repo}/i/{b.inferred.id}"
												><code>{b.inferred.id}</code> {b.inferred.title}</a
											> <span class="muted">(inferred)</span></span
										>
									{:else if b.tasks.length}
										<span>→ plan {b.tasks.join(', ')}</span>
									{:else}
										<span class="warn-text">not in the backlog</span>
									{/if}
								</div>
								<div class="muted small">
									{b.ahead} ahead · {b.behind} behind ·
									{#if b.pr}<a href={b.pr.url}>PR #{b.pr.number}{b.pr.draft ? ' (draft)' : ''}</a
										>{:else}no PR{/if}
									· {ago(b.committedAt, data.now)} · “{b.message}”
								</div>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="muted small">No branches with work on them.</p>
				{/if}
			</div>

			{#if c.plan}
				<div class="block">
					<div class="plan-head">
						<span>{c.plan.group}</span>
						<span class="muted small">{c.plan.done} of {c.plan.total} done</span>
					</div>
					<div class="bar">
						<span style="width: {(100 * c.plan.done) / Math.max(1, c.plan.total)}%"></span>
					</div>
					<p class="small">
						<span class="label">Next</span>
						<a href="/p/{c.repo}/plan#task-{c.plan.next.number}"
							><code>{c.plan.next.number}</code></a
						>
						<span class="next-title">{@html c.plan.next.titleHtml}</span>
					</p>
				</div>
			{/if}

			<p class="foot muted small">synced {ago(c.lastSyncAt, data.now)}</p>
		</section>
	{/each}
</div>

{#if others.length}
	<p class="muted small others">
		Also installed, without a backlog: {#each others as o, i (o.repo)}{i ? ', ' : ''}<a
				href="/p/{o.repo}">{o.repo}</a
			>{/each}.
	</p>
{/if}

<style>
	.delivery {
		margin: 0.4rem 0 0;
		color: var(--muted);
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: end;
		gap: 1rem;
		margin-bottom: 1.5rem;
		flex-wrap: wrap;
	}
	h1 {
		font-size: 34px;
	}
	.head p {
		margin: 0.25rem 0 0;
	}
	.totals {
		background: var(--surface-2);
		padding: 0.35rem 0.8rem;
		border-radius: 999px;
		font-size: 13px;
	}
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 520px), 1fr));
		gap: 1.25rem;
	}
	.card {
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: 1.1rem 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}
	.top {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
	}
	h2 {
		font-size: 26px;
	}
	h2 a {
		text-decoration: none;
	}
	.small {
		font-size: 12.5px;
		margin: 0.15rem 0 0;
	}
	.badges {
		display: flex;
		gap: 0.4rem;
		align-items: start;
	}
	.badge {
		font-size: 12px;
		padding: 0.1rem 0.55rem;
		border-radius: 999px;
		background: var(--surface-3);
		text-decoration: none;
		white-space: nowrap;
	}
	.badge.warn {
		background: var(--warn-bg);
		color: var(--warn);
	}
	.error {
		color: var(--danger);
		margin: 0;
		font-size: 13px;
	}
	.counts {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 0.9rem;
		font-size: 13px;
	}
	.counts a,
	.counts span {
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
	}
	.block {
		border-top: 1px solid var(--line);
		padding-top: 0.75rem;
	}
	ul {
		list-style: none;
		margin: 0.4rem 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
	}
	ul a {
		text-decoration: none;
	}
	ul a:hover {
		text-decoration: underline;
	}
	.accept {
		display: inline;
		margin-left: 0.4rem;
	}
	.waiting li {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0 0.5rem;
	}
	.waiting .muted {
		grid-column: 1 / -1;
	}
	.flight li {
		padding-left: 0.6rem;
		border-left: 2px solid var(--line);
	}
	.flight li.unlinked {
		border-left-color: var(--warn);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.5rem;
	}
	.inferred {
		border-bottom: 1px dashed var(--text-3);
	}
	.warn-text {
		color: var(--warn);
		font-size: 12.5px;
	}
	.plan-head {
		display: flex;
		justify-content: space-between;
		font-size: 13.5px;
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
	.foot {
		margin-top: auto;
		text-align: right;
	}
	.next-title {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.others {
		margin-top: 1.5rem;
	}
</style>
