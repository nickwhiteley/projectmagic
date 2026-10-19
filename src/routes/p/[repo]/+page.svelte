<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import AssigneeFilter from '#lib/components/AssigneeFilter.svelte';
	import EpicFilter from '#lib/components/EpicFilter.svelte';
	import FilterBar from '#lib/components/FilterBar.svelte';
	import ItemRow from '#lib/components/ItemRow.svelte';
	import { assigneeFilter, assigneeMatches } from '#lib/core/assignee.ts';
	import { dragHandlers, type MoveState } from '#lib/move.ts';
	import { plural, STATUS_ORDER } from '#lib/format.ts';

	let { data } = $props();
	const repo = $derived(page.params.repo!);
	// Filters live in the page and are mirrored in the URL, so a filtered list can be shared.
	let status = $state(page.url.searchParams.get('status') ?? '');
	let job = $state(page.url.searchParams.get('job') ?? '');
	let assignee = $state(page.url.searchParams.get('for') ?? '');
	let epic = $state(page.url.searchParams.get('epic') ?? '');
	let type = $state(page.url.searchParams.get('type') ?? '');
	// Done items are hidden unless asked for (PM26), by the toggle or by choosing the done status.
	let showDone = $state(page.url.searchParams.get('done') === '1');
	const forPath = $derived(assigneeFilter(assignee, page.data.user?.login ?? null));
	const h = $derived(data.health);
	const notices = $derived(
		h.warnings.length +
			h.disagreements.length +
			h.dangling.length +
			h.unknownTasks.length +
			h.configWarnings.length +
			h.assignees.length +
			h.epics.length
	);

	function filter(key: 'status' | 'job' | 'for' | 'epic' | 'type', value: string) {
		if (key === 'status') status = value;
		else if (key === 'job') job = value;
		else if (key === 'epic') epic = value;
		else if (key === 'type') type = value;
		else assignee = value;
		const u = new URL(page.url.href);
		if (value) u.searchParams.set(key, value);
		else u.searchParams.delete(key);
		goto(u.href, { replace: true, shallow: true });
	}
	function toggleDone(on: boolean) {
		showDone = on;
		const u = new URL(page.url.href);
		if (on) u.searchParams.set('done', '1');
		else u.searchParams.delete('done');
		goto(u.href, { replace: true, shallow: true });
	}
	const hidingDone = $derived(!showDone && !status);
	const shown = (it: {
		status: string;
		job: string | null;
		assignee: string | null;
		epic: string | null;
		type: string | null;
	}) =>
		(status ? it.status === status : showDone || it.status !== 'done') &&
		(!job || it.job === job) &&
		(!epic || it.epic === epic) &&
		(!type || it.type === type) &&
		(!forPath || assigneeMatches(it.assignee, forPath));
	const filtered = $derived(!!status || !!job || !!epic || !!type || !!forPath);
	const moves = $state<MoveState>({ busy: null, message: null });
	// Reordering needs the whole list in view: not while filtered.
	const canDrag = $derived(page.data.project.canEdit && !filtered);
	// A dropped item shows in its new place while the move is saved, then the real data replaces it.
	let moving = $state<{ id: string; to: string } | null>(null);
	type Entry = (typeof data.top)[number];
	const arranged = $derived.by(() => {
		const same = { top: data.top, sections: data.sections };
		if (!moving) return same;
		const lists: Entry[][] = [data.top, ...data.sections.map((s) => s.entries)];
		let item: Entry | undefined;
		const rest = lists.map((l) =>
			l.filter((e) => {
				if (e.kind === 'item' && e.item.id === moving!.id) item = e;
				return !(e.kind === 'item' && e.item.id === moving!.id);
			})
		);
		if (!item) return same;
		const [where, arg] = moving.to.split(':');
		let placed = false;
		const out = rest.map((l, n) => {
			if (where === 'before' || where === 'after') {
				const i = l.findIndex((e) => e.kind === 'item' && e.item.id === arg);
				if (i < 0) return l;
				placed = true;
				const at = where === 'before' ? i : i + 1;
				return [...l.slice(0, at), item!, ...l.slice(at)];
			}
			if (n - 1 !== Number(arg)) return l;
			placed = true;
			return where === 'start' ? [item!, ...l] : [...l, item!];
		});
		if (!placed) return same;
		return {
			top: out[0],
			sections: data.sections.map((s, i) => ({ ...s, entries: out[i + 1] }))
		};
	});
	const drag = dragHandlers(
		page.params.repo!,
		moves,
		() => canDrag,
		undefined,
		() => true,
		{
			set: (id, to) => (moving = { id, to }),
			clear: () => (moving = null)
		}
	);
</script>

<svelte:head><title>{page.data.project.name} · Project Magic</title></svelte:head>

{#if !page.data.project.hasBacklog}
	<p class="muted">
		This repository has no backlog.md, so there is nothing to list. Its branches and docs are in the
		other tabs.
	</p>
{:else}
	<div class="tools">
		<p class="muted small">In the file’s order, which is its priority.</p>
		<FilterBar
			active={[status, job, epic, type, assignee].filter(Boolean).length + (showDone ? 1 : 0)}
		>
			<label
				>Status
				<select value={status} onchange={(e) => filter('status', e.currentTarget.value)}>
					<option value="">all</option>
					{#each STATUS_ORDER as s (s)}<option value={s}>{s}</option>{/each}
				</select>
			</label>
			<label
				>Job
				<select value={job} onchange={(e) => filter('job', e.currentTarget.value)}>
					<option value="">all</option>
					{#each data.jobs as j (j)}<option value={j}>{j}</option>{/each}
				</select>
			</label>
			<label
				><input
					type="checkbox"
					checked={showDone}
					disabled={!!status}
					onchange={(e) => toggleDone(e.currentTarget.checked)}
				/>
				Show done {#if data.doneCount}<span class="muted">({data.doneCount})</span>{/if}
			</label>
			{#if data.types.length}
				<label
					>Type
					<select value={type} onchange={(e) => filter('type', e.currentTarget.value)}>
						<option value="">all</option>
						{#each data.types as t (t)}<option value={t}>{t}</option>{/each}
					</select>
				</label>
			{/if}
			<EpicFilter value={epic} epics={data.epics} onchange={(v) => filter('epic', v)} />
			<AssigneeFilter
				value={assignee}
				assignees={data.assignees}
				signedIn={!!page.data.user}
				onchange={(v) => filter('for', v)}
			/>
		</FilterBar>
		{#if page.data.project.canEdit}
			<a class="button" href="/p/{repo}/new"
				><span class="wide">Add </span><span class="narrow">+ </span>item</a
			>
			<a class="button" href="/p/{repo}/new?bug=1"
				><span class="wide">Add </span><span class="narrow">+ </span>bug</a
			>
		{/if}
	</div>

	{#if notices}
		<details class="health" id="health">
			<summary>Health: {plural(notices, 'notice')}</summary>
			<ul>
				{#each h.disagreements as d (d)}<li><strong>Disagreement:</strong> {d}</li>{/each}
				{#each h.warnings as w (w.line + w.message)}<li>
						<strong>Backlog line {w.line}:</strong>
						{w.message}
					</li>{/each}
				{#each h.dangling as d (d)}<li><strong>Dangling reference:</strong> {d}</li>{/each}
				{#each h.unknownTasks as t (t)}<li>
						<strong>Plan task {t}:</strong> its status cell doesn’t start with a known word
					</li>{/each}
				{#each h.configWarnings as c (c)}<li><strong>.projectmagic.yml:</strong> {c}</li>{/each}
				{#each h.assignees as a (a)}<li><strong>For:</strong> {a}</li>{/each}
				{#each h.epics as x (x)}<li><strong>Epic:</strong> {x}</li>{/each}
			</ul>
			{#if h.notes.length}<p class="muted small">
					Notes (headings without an id): {h.notes.join(' · ')}
				</p>{/if}
		</details>
	{/if}

	{#if data.preambleHtml && !filtered}
		<details class="preamble">
			<summary>Preamble</summary>
			<div class="prose">{@html data.preambleHtml}</div>
		</details>
	{/if}

	{#snippet entries(list: typeof data.top)}
		{#each list as e (e.start)}
			{#if e.kind === 'item'}
				{#if shown(e.item)}
					<div
						data-id={e.item.id}
						draggable={canDrag}
						class="drag"
						class:busy={moves.busy === e.item.id}
					>
						<ItemRow item={e.item} {repo} />
					</div>
				{/if}
			{:else if !filtered}
				<details class="note">
					<summary>{e.title}</summary>
					<div class="prose">{@html e.html}</div>
				</details>
			{/if}
		{/each}
	{/snippet}

	{#if moves.message}<p class="move-error" role="alert">{moves.message}</p>{/if}
	{#if canDrag}<p class="muted small hint">
			Drag a row onto another to put it just before that one.
		</p>{/if}
	<div
		role="list"
		ondragstart={drag.ondragstart}
		ondragover={drag.ondragover}
		ondragend={drag.ondragend}
		ondrop={(e) => drag.ondrop(e)}
	>
		{@render entries(arranged.top)}
		{#each arranged.sections as sec, i (i)}
			{#if (!filtered && !hidingDone) || sec.entries.some((e) => e.kind === 'item' && shown(e.item))}
				<section>
					<h2>{sec.title}</h2>
					{#if sec.introHtml}<div class="intro">{@html sec.introHtml}</div>{/if}
					{@render entries(sec.entries)}
					{#if canDrag}<div class="zone" data-to="end:{i}">
							Drop here to put it last in {sec.title}
						</div>{/if}
				</section>
			{/if}
		{/each}
	</div>
{/if}

<style>
	.tools {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}
	.tools p {
		margin: 0 auto 0 0;
		flex-basis: 100%;
	}
	@media (min-width: 761px) {
		.tools p {
			flex-basis: auto;
		}
	}
	@media (max-width: 760px) {
		.tools {
			gap: 0.5rem;
			margin-bottom: 0.5rem;
		}
		.tools p,
		.hint {
			display: none;
		}
		.tools .button {
			padding-inline: 0.5rem;
		}
		.wide {
			display: none;
		}
	}
	@media (min-width: 761px) {
		.narrow {
			display: none;
		}
	}
	label {
		font-size: 13px;
		color: var(--text-2);
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}
	select {
		border: 1px solid var(--line-strong);
		background: var(--card);
		border-radius: var(--radius);
		padding: 0.2rem 0.4rem;
	}
	.small {
		font-size: 12.5px;
	}
	.health {
		background: var(--warn-bg);
		border-radius: var(--radius);
		padding: 0.6rem 0.9rem;
		margin-bottom: 1rem;
		font-size: 13.5px;
	}
	.health summary {
		cursor: pointer;
		color: var(--warn);
		font-weight: 500;
	}
	.health ul {
		margin: 0.5rem 0 0;
		padding-left: 1.2rem;
	}
	.note {
		background: var(--surface-1);
		border-radius: var(--radius);
		padding: 0.6rem 0.9rem;
		margin: 0.5rem 0 0.25rem;
	}
	/* The preamble is only a fold-out line above the list, so it takes no room of its own. */
	.preamble {
		margin: 0;
		padding: 0.1rem 0;
	}
	.preamble summary,
	.note summary {
		cursor: pointer;
		font: italic 16px var(--serif);
		color: var(--text-2);
	}
	.preamble .prose,
	.note .prose {
		margin-top: 0.75rem;
		font-size: 15px;
	}
	section {
		margin-top: 0.6rem;
	}
	.drag[draggable='true'] {
		cursor: grab;
	}
	.drag.busy {
		opacity: 0.4;
	}
	:global(.drop-target) {
		box-shadow: inset 0 3px 0 var(--accent);
	}
	.zone {
		font-size: 12px;
		color: var(--text-3);
		padding: 0.4rem 0.25rem;
		border: 1px dashed transparent;
		border-radius: var(--radius);
	}
	.zone:global(.drop-target) {
		border-color: var(--accent);
		box-shadow: none;
	}
	.hint {
		margin: 0 0 0.5rem;
	}
	.move-error {
		color: var(--danger);
	}
	h2 {
		font-size: 20px;
		line-height: 1.25;
		margin: 0;
		padding-bottom: 0.1rem;
	}
	.intro {
		font: italic 15px var(--serif);
		color: var(--text-2);
		margin: 0.2rem 0 0.5rem;
	}
	.intro :global(p) {
		margin: 0.2rem 0;
	}
</style>
