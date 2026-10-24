<script lang="ts">
	// Any error a page meets (PM48). A recorded one carries a reference, which the person can quote,
	// and which the Feedback dialog takes with it so a report finds the record.
	import { page } from '$app/state';
	import FeedbackButton from '#lib/components/FeedbackButton.svelte';

	let feedback = $state<ReturnType<typeof FeedbackButton> | null>(null);
	const status = $derived(page.status);
	const ref = $derived(page.error?.ref ?? null);
	const title = $derived(
		status === 404
			? 'Not found'
			: status === 403
				? 'Not allowed'
				: status === 401
					? 'Sign in first'
					: 'Something went wrong'
	);
</script>

<svelte:head><title>{title} · Project Magic</title></svelte:head>

<div class="error-page">
	<p class="code muted">{status}</p>
	<h1>{title}</h1>
	<p>
		{#if status === 404}
			There’s nothing here, or it isn’t yours to see.
		{:else if status >= 500}
			{page.error?.message ?? 'Something went wrong on our side.'} It has been recorded, and trying again
			in a moment often works.
		{:else}
			{page.error?.message}
		{/if}
	</p>
	{#if ref}
		<p class="ref">Reference <code>{ref}</code></p>
	{/if}
	<div class="actions">
		<a class="button primary" href="/">Go to the overview</a>
		{#if status >= 500}
			<button type="button" class="button" onclick={() => location.reload()}>Try again</button>
			<button
				type="button"
				class="button"
				onclick={() =>
					feedback?.open(
						`Something broke on ${page.url.pathname}${ref ? ` (reference ${ref})` : ''}: `
					)}>Tell us what you were doing</button
			>
		{/if}
	</div>
</div>
<FeedbackButton bind:this={feedback} trigger={false} />

<style>
	.error-page {
		max-width: 36rem;
		margin: 4rem auto;
		padding: 0 1rem;
	}
	.code {
		font-family: var(--mono);
		margin: 0;
	}
	h1 {
		margin: 0.25rem 0 1rem;
	}
	.ref code {
		font-family: var(--mono);
		background: var(--surface-2);
		padding: 0.1rem 0.4rem;
		border-radius: var(--radius);
		user-select: all;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 1.5rem;
	}
</style>
