<script lang="ts">
	let { data } = $props();
</script>

<svelte:head><title>Sign in · Project Magic</title></svelte:head>

<main>
	<a class="brand" href="/"><span class="mark">M</span><span>Project Magic</span></a>
	<div class="card">
		<h1>Sign in</h1>
		{#if data.message}<p class="error" role="alert">{data.message}</p>{/if}
		{#if data.signup === 'approval'}
			<div class="preview">
				<span class="tag">Preview</span>
				<p>
					Project Magic is in preview. A new team needs the developer's approval before it can
					connect GitHub, so you won't see your projects straight away. If you have been invited to
					a team, you can use it as soon as you sign in.
				</p>
			</div>
		{/if}
		<a class="button primary" href={data.href}>Sign in with GitHub</a>
		{#if data.signup === 'approval'}
			<p class="muted small">
				Sign in with GitHub to request a team, or to join one you have been invited to.
			</p>
		{:else if data.signup === 'open'}
			<p class="muted small">
				Sign in with GitHub to create a tenant for your team, or to join one you have been invited
				to.
			</p>
		{:else}
			<p class="muted small">
				This instance is for the people its owner has invited. To follow your own projects, run your
				own:
				<a href="https://github.com/seethespark/projectmagic#setting-up">the setup guide</a>.
			</p>
		{/if}
	</div>
</main>

<style>
	main {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1.5rem;
		padding: 1.5rem;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		font: 400 22px var(--serif);
		text-decoration: none;
	}
	.mark {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: 6px;
		background: var(--text);
		color: var(--bg);
		font: 700 19px var(--serif);
	}
	.card {
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 12px;
		padding: 1.6rem 1.8rem;
		max-width: 26rem;
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		align-items: start;
	}
	h1 {
		font-size: 28px;
	}
	.button {
		padding: 0.55rem 1rem;
		font-size: 14px;
	}
	.preview {
		background: var(--warn-bg);
		color: var(--warn);
		border-radius: 8px;
		padding: 0.75rem 0.9rem;
		display: flex;
		flex-direction: column;
		align-items: start;
		gap: 0.4rem;
		font-size: 14px;
	}
	.preview p {
		margin: 0;
	}
	.tag {
		font: 600 10.5px/16px var(--sans);
		letter-spacing: 0.04em;
		text-transform: uppercase;
		border: 1px solid var(--warn);
		border-radius: 4px;
		padding: 0 0.35rem;
	}
	.error {
		color: var(--danger);
		margin: 0;
	}
	.small {
		font-size: 13px;
		margin: 0;
	}
</style>
