<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { page } from '$app/state';
	import ItemForm from '#lib/components/ItemForm.svelte';

	let { data, form } = $props();
	const repo = $derived(page.params.repo!);
	const id = $derived(page.params.id!);
	const values = $derived(form?.values ?? data.values);
	const base = $derived(form?.base ?? data.base);
	const conflict = $derived(form?.conflict ?? null);
	const others = $derived(data.items.filter((i) => i.id !== id));
	let removing = $state(false);
	// Each action commits, merges and syncs, which takes seconds: say which is under way (PM17).
	let busy = $state<'save' | 'move' | 'remove' | null>(null);
	const track =
		(action: 'save' | 'move' | 'remove'): SubmitFunction =>
		() => {
			busy = action;
			return async ({ update }) => {
				await update({ reset: false });
				busy = null;
			};
		};
</script>

<svelte:head><title>Edit {id} · {page.data.project.name}</title></svelte:head>

<div class="head">
	<h2>Edit <code>{id}</code></h2>
	<a class="button" href="/p/{repo}/i/{encodeURIComponent(id)}">Cancel</a>
</div>

{#if form?.message}
	<p class="message" role="alert">
		{form.message}
		{#if form.reauth}<a href="/auth/github?next={encodeURIComponent(page.url.pathname)}"
				>Sign in again</a
			>{/if}
	</p>
{/if}

{#if conflict}
	<section class="conflict" role="alert">
		<p><strong>{id} changed on main since you opened it.</strong> Nothing has been saved.</p>
		{#if conflict.theirs}
			<p class="small">What changed on main:</p>
			<pre class="diff">{#each conflict.theirs as l, i (i)}<span class={l.kind}
						>{l.kind === 'add' ? '+ ' : l.kind === 'del' ? '- ' : '  '}{l.text}
</span>{/each}</pre>
		{:else}
			<p class="small">It has been removed from main.</p>
		{/if}
		<p class="small">What your edit would change, against main’s version now:</p>
		<pre class="diff">{#each conflict.mine as l, i (i)}<span class={l.kind}
					>{l.kind === 'add' ? '+ ' : l.kind === 'del' ? '- ' : '  '}{l.text}
</span>{/each}</pre>
		<p class="small">
			Save again to <strong>keep yours</strong> (it replaces main’s version),
			<a href="/p/{repo}/i/{encodeURIComponent(id)}/edit">reopen the form</a>
			to <strong>take theirs</strong>, or edit the fields below to combine them.
		</p>
	</section>
{/if}

<form method="POST" action="?/save" class="panel" use:enhance={track('save')}>
	<input type="hidden" name="base" value={base} />
	{#key values}<ItemForm {values} jobs={data.jobs} tasks={data.tasks} />{/key}
	<div class="foot">
		<p class="muted small">
			Commits to <code>{page.data.project.main}</code> through the <code>projectmagic</code> branch, as
			you; its pull request is merged straight away.
		</p>
		<button class="button primary" disabled={!!busy} aria-busy={busy === 'save'}
			>{busy === 'save' ? 'Saving…' : conflict ? 'Save mine' : 'Save'}</button
		>
	</div>
</form>

<div class="side">
	<form method="POST" action="?/move" class="panel" use:enhance={track('move')}>
		<div class="label">Move</div>
		<select name="to" required>
			<option value="">Choose a place…</option>
			{#each data.sections as sec (sec.index)}
				<optgroup label={sec.title}>
					<option value="start:{sec.index}">Top of {sec.title}</option>
					{#each others.filter((o) => o.section === sec.index) as o (o.id)}
						<option value="after:{o.id}">After {o.id} {o.title.slice(0, 50)}</option>
					{/each}
				</optgroup>
			{/each}
		</select>
		<button class="button" disabled={!!busy} aria-busy={busy === 'move'}
			>{busy === 'move' ? 'Moving…' : 'Move'}</button
		>
	</form>

	<form method="POST" action="?/remove" class="panel danger" use:enhance={track('remove')}>
		<div class="label">Remove</div>
		{#if !removing}
			<button type="button" class="button" onclick={() => (removing = true)}>Remove {id}…</button>
		{:else}
			<label
				><input type="radio" name="mode" value="done" checked /> Mark it done; the agents prune it later</label
			>
			<label><input type="radio" name="mode" value="delete" /> Delete it from the backlog now</label
			>
			<label><input type="checkbox" name="confirm" value="yes" required /> I mean it</label>
			<button class="button" disabled={!!busy} aria-busy={busy === 'remove'}
				>{busy === 'remove' ? 'Removing…' : 'Remove'}</button
			>
		{/if}
	</form>
</div>

<style>
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}
	h2 {
		font-size: 28px;
	}
	.panel {
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: 1rem 1.2rem;
		margin-bottom: 1rem;
		max-width: 60rem;
	}
	.foot {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		margin-top: 1rem;
	}
	.small {
		font-size: 12.5px;
	}
	.message {
		background: var(--del-bg);
		color: var(--danger);
		padding: 0.6rem 0.9rem;
		border-radius: var(--radius);
		max-width: 60rem;
	}
	.conflict {
		background: var(--warn-bg);
		border-radius: 10px;
		padding: 0.8rem 1.1rem;
		margin-bottom: 1rem;
		max-width: 60rem;
	}
	.diff {
		background: var(--card);
		border-radius: var(--radius);
		padding: 0.5rem 0;
		font: 12px/1.5 var(--mono);
		white-space: pre-wrap;
		max-height: 18rem;
		overflow: auto;
	}
	.diff span {
		display: block;
		padding: 0 0.7rem;
	}
	.diff .add {
		background: var(--add-bg);
	}
	.diff .del {
		background: var(--del-bg);
	}
	.side {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
		gap: 1rem;
		max-width: 60rem;
	}
	.side .panel {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		align-items: start;
		margin: 0;
	}
	.side select {
		width: 100%;
		border: 1px solid var(--line-strong);
		background: var(--card);
		border-radius: var(--radius);
		padding: 0.3rem;
	}
	.side label {
		font-size: 13px;
	}
</style>
