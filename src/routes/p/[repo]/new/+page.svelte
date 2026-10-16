<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import ItemForm from '#lib/components/ItemForm.svelte';

	let { data, form } = $props();
	const values = $derived(form?.values ?? data.values);
	// Adding commits, merges and syncs, which takes seconds: say so (PM17).
	let adding = $state(false);
</script>

<svelte:head><title>Add an item · {page.data.project.name}</title></svelte:head>

<h2>Add an item</h2>
{#if form?.message}
	<p class="message" role="alert">
		{form.message}
		{#if form.reauth}<a href="/auth/github?next={encodeURIComponent(page.url.pathname)}"
				>Sign in again</a
			>{/if}
	</p>
{/if}

<form
	method="POST"
	class="panel"
	use:enhance={() => {
		adding = true;
		return async ({ update }) => {
			await update({ reset: false });
			adding = false;
		};
	}}
>
	{#key values}
		<ItemForm
			{values}
			jobs={data.jobs}
			tasks={data.tasks}
			assignees={data.assignees}
			epics={data.epics}
			idHint="Next free: {data.suggested}. Or a plan task’s number, to add its reasoning."
		/>
	{/key}
	<div class="where">
		<label>
			<span class="label">Section</span>
			<select name="section">
				{#each data.sections as sec (sec.index)}
					<option value={sec.index} selected={sec.index === data.section}>{sec.title}</option>
				{/each}
			</select>
		</label>
		<label>
			<span class="label">Position</span>
			<select name="at">
				<option value="end">At the end (lowest priority in it)</option>
				<option value="start">At the top</option>
			</select>
		</label>
	</div>
	<div class="foot">
		<p class="muted small">
			Commits to <code>{page.data.project.main}</code> through the <code>projectmagic</code> branch, as
			you.
		</p>
		<button class="button primary" disabled={adding} aria-busy={adding}
			>{adding ? 'Adding…' : 'Add'}</button
		>
	</div>
</form>

<style>
	h2 {
		font-size: 28px;
		margin-bottom: 1rem;
	}
	.panel {
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: 1rem 1.2rem;
		max-width: 60rem;
	}
	.where {
		display: flex;
		gap: 1rem;
		margin-top: 1rem;
	}
	.where label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	select {
		border: 1px solid var(--line-strong);
		background: var(--card);
		border-radius: var(--radius);
		padding: 0.35rem;
	}
	.foot {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-top: 1rem;
		gap: 1rem;
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
</style>
