<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	let busy = $state(false);

	// Going back from a linked item reloads this page without the answer. A snapshot keeps the last
	// result for the browser session, so the answer is still there, without asking the model again.
	type Result = { question?: string; html?: string; truncated?: boolean; reason?: string };
	let restored = $state<Result | null>(null);
	const shown = $derived<Result | null>(form ?? restored);
	export const snapshot = {
		capture: (): Result | null => (shown ? { ...shown } : null),
		restore: (v: Result | null) => (restored = v)
	};
</script>

<svelte:head><title>Ask · Project Magic</title></svelte:head>

<h1>Ask</h1>
<p class="muted">
	A question about your projects, answered from the backlogs as last synced: every item with its
	status, what it waits on, who it is for, and what shipped in the last 30 days. A model reads it,
	so check an answer against the items it links to.
</p>

{#if !data.available}
	<p class="muted">No model is configured, so there is nothing to ask.</p>
{:else if data.optedOut}
	<p class="muted">
		You have hidden AI features, so Ask is off. The button in the header turns them back on.
	</p>
{:else}
	<form
		method="POST"
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				await update({ reset: false });
				busy = false;
			};
		}}
	>
		<input
			name="q"
			type="search"
			value={shown?.question ?? ''}
			maxlength={data.max}
			placeholder="What is waiting on me? What shipped this week? What is blocked?"
			aria-label="Question"
			required
		/>
		<button class="button" disabled={busy}>{busy ? 'Asking…' : 'Ask'}</button>
	</form>

	{#if shown?.html}
		<div class="answer prose">{@html shown.html}</div>
		{#if shown.truncated}<p class="muted small">
				The digest was too long for the model, so some items were left out.
			</p>{/if}
	{:else if shown?.reason}
		<p class="error" role="alert">{shown.reason}</p>
	{/if}
{/if}

<style>
	form {
		display: flex;
		gap: 0.6rem;
		margin: 1rem 0;
	}
	input {
		flex: 1;
	}
	.answer {
		max-width: 46rem;
	}
	.small {
		font-size: 12.5px;
	}
	.error {
		color: var(--danger);
	}
</style>
