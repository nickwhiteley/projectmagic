<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';

	let { data, form } = $props();
	const repo = $derived(page.params.repo!);
	// svelte-ignore state_referenced_locally
	let text = $state(form?.text ?? data.text);
	// The text the box opened with, to notice a change on main since (a conflict returns the new one).
	const base = $derived(form?.base ?? data.text);
	let saving = $state(false);
</script>

<svelte:head><title>Edit {data.path} · {page.data.project.name}</title></svelte:head>

<h2>Edit <code>{data.path}</code></h2>
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
	action="?/save"
	use:enhance={() => {
		saving = true;
		return async ({ update }) => {
			await update({ reset: false });
			saving = false;
		};
	}}
>
	<input type="hidden" name="base" value={base} />
	<textarea name="text" bind:value={text} rows="32" spellcheck="true" aria-label="Document"
	></textarea>
	<div class="foot">
		<p class="muted small">
			Commits to <code>{page.data.project.main}</code> through the <code>projectmagic</code> branch, as
			you.
		</p>
		<a class="button" href="/p/{repo}/docs/{data.path}">Cancel</a>
		<button class="button primary" disabled={saving} aria-busy={saving}
			>{saving ? 'Saving…' : 'Save'}</button
		>
	</div>
</form>

<style>
	h2 {
		font-size: 24px;
		margin-bottom: 0.8rem;
	}
	textarea {
		width: 100%;
		font: 13.5px/1.5 var(--mono);
		padding: 0.8rem;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--card);
		color: inherit;
		resize: vertical;
	}
	.foot {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		margin-top: 0.8rem;
	}
	.foot p {
		margin-right: auto;
	}
	.small {
		font-size: 12.5px;
	}
	.message {
		color: var(--danger);
	}
</style>
