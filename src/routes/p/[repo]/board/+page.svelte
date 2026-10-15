<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import AssigneeFilter from '#lib/components/AssigneeFilter.svelte';
	import { assigneeFilter, assigneeMatches } from '#lib/core/assignee.ts';
	import StatusPill from '#lib/components/StatusPill.svelte';
	import { ago } from '#lib/format.ts';
	import { dragHandlers, setStatus, type MoveState } from '#lib/move.ts';

	let { data } = $props();
	const repo = $derived(page.params.repo!);
	// The For filter (PM16), mirrored in the URL like the List's filters.
	let assignee = $state(page.url.searchParams.get('for') ?? '');
	const forPath = $derived(assigneeFilter(assignee, page.data.user?.login ?? null));
	function setAssignee(value: string) {
		assignee = value;
		const u = new URL(page.url.href);
		if (value) u.searchParams.set('for', value);
		else u.searchParams.delete('for');
		goto(u.href, { replace: true, shallow: true });
	}
	const lanes = $derived(
		data.lanes
			.map((l) => ({
				...l,
				cells: l.cells.map((c) =>
					forPath ? c.filter((it) => assigneeMatches(it.assignee, forPath)) : c
				)
			}))
			.filter((l) => !forPath || l.cells.some((c) => c.length))
	);
	const moves = $state<MoveState>({ busy: null, message: null });
	// Dropping a card into another column sets its status (PM27). In progress and in review come
	// from branches and pull requests, so they can't be set. Blocked and built ask what they wait on.
	let ask = $state<{ id: string; status: string; waiting: string } | null>(null);
	function intoColumn(id: string, _from: string, to: string) {
		if (to === 'in progress' || to === 'in review') {
			moves.message = `${to} comes from branches and pull requests, so a card can't be dropped there.`;
			return;
		}
		const card = lanes.flatMap((l) => l.cells.flat()).find((c) => c.id === id);
		if ((to === 'blocked' || to === 'built') && !card?.waitingHtml)
			ask = { id, status: to, waiting: '' };
		else setStatus(page.params.repo!, id, to, null, moves);
	}
	async function confirmAsk() {
		if (!ask?.waiting.trim()) return;
		const { id, status, waiting } = ask;
		ask = null;
		await setStatus(page.params.repo!, id, status, waiting, moves);
	}
	const drag = dragHandlers(
		page.params.repo!,
		moves,
		() => page.data.project.canEdit,
		intoColumn,
		() => !forPath
	);
	const totals = $derived(
		data.columns.map((_, i) => lanes.reduce((n, l) => n + l.cells[i].length, 0))
	);
</script>

<svelte:head><title>Board · {page.data.project.name}</title></svelte:head>

<div class="tools">
	<p class="muted small">
		Columns come from the files and branches, so cards move when the work does. Lanes are the
		backlog’s sections, in order.
	</p>
	<AssigneeFilter
		value={assignee}
		assignees={data.assignees}
		signedIn={!!page.data.user}
		onchange={setAssignee}
	/>
</div>

{#if ask}
	<form
		class="ask"
		onsubmit={(e) => {
			e.preventDefault();
			confirmAsk();
		}}
	>
		<label
			>What is {ask.id}
			{ask.status === 'blocked' ? 'blocked on' : 'waiting on'}?
			<input bind:value={ask.waiting} required />
		</label>
		<button type="submit">Set {ask.status}</button>
		<button type="button" class="secondary" onclick={() => (ask = null)}>Cancel</button>
	</form>
{/if}
{#if moves.message}<p class="move-error" role="alert">{moves.message}</p>{/if}
{#if page.data.project.canEdit}<p class="muted small">
		Drag a card onto another in its column to put it before that one, or onto a lane’s empty space
		to put it last in that section. Drag it into another column to set its status: todo, blocked,
		built or done. In progress and in review come from branches and pull requests.
	</p>{/if}
<div
	class="board"
	style="--cols: {data.columns.length}"
	role="list"
	ondragstart={drag.ondragstart}
	ondragover={drag.ondragover}
	ondragend={drag.ondragend}
	ondrop={(e) => drag.ondrop(e)}
>
	<div class="colheads">
		{#each data.columns as c, i (c)}
			<div>
				<StatusPill status={c} />
				<span class="muted">{c === 'done' ? totals[i] + data.shipped.length : totals[i]}</span>
			</div>
		{/each}
	</div>
	{#each lanes as lane (lane.title)}
		<details open class="lane">
			<summary
				>{lane.title}
				<span class="muted">{lane.cells.reduce((n, c) => n + c.length, 0)}</span></summary
			>
			<div class="cells">
				{#each lane.cells as cell, i (i)}
					<div
						class="cell"
						data-status={data.columns[i]}
						data-to={lane.section === null ? undefined : `end:${lane.section}`}
					>
						{#each cell as it (it.id)}
							<a
								class="card"
								class:busy={moves.busy === it.id}
								href="/p/{repo}/i/{encodeURIComponent(it.id)}"
								data-id={it.id}
								draggable={page.data.project.canEdit}
							>
								<div class="top">
									<span class="id">{it.id}</span>{#if it.star}<span class="star">★</span>{/if}
									<span class="tags">
										{#if it.pending}<span class="tag pending">pending</span>{/if}
										{#if it.job}<span class="tag">{it.job}</span>{/if}
										{#if it.assignee}<span class="tag mono" title="For">{it.assignee}</span>{/if}
										{#if it.size}<span class="tag mono">{it.size}</span>{/if}
									</span>
								</div>
								<div class="title">{@html it.titleHtml}</div>
								{#if it.waitingHtml && (it.status === 'blocked' || it.status === 'built' || it.blocked)}
									<div class="waiting {it.status}">{@html it.waitingHtml}</div>
								{/if}
								<div class="source">{it.source}</div>
							</a>
						{/each}
					</div>
				{/each}
			</div>
		</details>
	{/each}
	{#if data.shipped.length}
		<details open class="lane">
			<summary>Shipped in the last 30 days <span class="muted">{data.shipped.length}</span></summary
			>
			<div class="cells">
				{#each data.columns as c (c)}
					<div class="cell">
						{#if c === 'done'}
							{#each data.shipped as d (d.id)}
								<a class="card" href="/p/{repo}/done#{d.id}">
									<div class="top"><span class="id">{d.id}</span></div>
									<div class="title">{d.title}</div>
									<div class="source">{ago(d.at)}</div>
								</a>
							{/each}
						{/if}
					</div>
				{/each}
			</div>
		</details>
	{/if}
</div>

<style>
	.tools {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.tools p {
		margin: 0 auto 0 0;
		flex: 1 1 20rem;
	}
	.small {
		font-size: 12.5px;
		margin-top: 0;
	}
	.board {
		overflow-x: auto;
	}
	.colheads,
	.cells {
		display: grid;
		grid-template-columns: repeat(var(--cols), minmax(13rem, 1fr));
		gap: 0.6rem;
		min-width: calc(var(--cols) * 13.6rem);
	}
	.colheads {
		padding: 0.5rem 0;
		font-size: 13px;
	}
	.lane {
		margin: 0.5rem 0 1rem;
	}
	.lane summary {
		font: 20px var(--serif);
		cursor: pointer;
		padding: 0.3rem 0;
		border-top: 1px solid var(--line);
	}
	.lane summary .muted {
		font: 12px var(--sans);
	}
	.cell {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-height: 2rem;
		background: var(--surface-1);
		border-radius: var(--radius);
		padding: 0.4rem;
	}
	.card {
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 0.55rem 0.6rem;
		text-decoration: none;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.card:hover {
		border-color: var(--line-strong);
	}
	.card.busy {
		opacity: 0.4;
	}
	:global(.drop-target) {
		box-shadow: 0 -3px 0 var(--accent);
	}
	.cell:global(.drop-target) {
		box-shadow: inset 0 0 0 2px var(--accent);
	}
	.ask {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
		margin: 0.5rem 0;
	}
	.ask input {
		min-width: 18rem;
	}
	.move-error {
		color: var(--danger);
	}
	.top {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}
	.id {
		font: 500 12px var(--mono);
	}
	.star {
		color: var(--warn);
	}
	.tags {
		margin-left: auto;
		display: flex;
		gap: 0.25rem;
	}
	.tag {
		font: 600 10px/15px var(--sans);
		border: 1px solid var(--line-strong);
		border-radius: 4px;
		padding: 0 0.3rem;
		color: var(--text-2);
	}
	.tag.mono {
		font-family: var(--mono);
		font-weight: 500;
	}
	.tag.pending {
		border-color: var(--accent);
		color: var(--accent);
	}
	.title {
		font: 15px/1.35 var(--serif);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.waiting {
		font-size: 12px;
		color: var(--warn);
	}
	.waiting.built {
		color: var(--st-built);
	}
	.source {
		font-size: 11.5px;
		color: var(--text-3);
	}
</style>
