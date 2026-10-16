<script lang="ts">
	let { data, form } = $props();
	const WHAT: Record<string, string> = {
		open: 'Anyone with a GitHub account can sign in and create a tenant.',
		approval:
			'Anyone can sign in and create a tenant, and a platform admin approves it before it can connect GitHub.',
		closed:
			'No new tenants. Only people who already have an account can sign in. This is how a self-hosted copy runs.'
	};
</script>

<svelte:head><title>Settings · Admin · Project Magic</title></svelte:head>

<form method="POST" action="?/signup" class="panel form">
	<h2>Sign-up</h2>
	{#if form?.done}<p class="flash" role="status">{form.done}</p>{/if}
	{#if form?.reason}<p class="flash error" role="alert">{form.reason}</p>{/if}
	{#each data.modes as m (m)}
		<label class="check">
			<input type="radio" name="signup" value={m} checked={data.signup === m} />
			<span><b>{m}</b>: {WHAT[m]}</span>
		</label>
	{/each}
	<button class="button primary">Save</button>
</form>

<form method="POST" action="?/tier" class="panel form">
	<h2>Default tier</h2>
	<p class="muted small">
		New tenants start on this tier. Tiers and their limits are set under Tiers & prices.
	</p>
	<label>
		<span>Tier for new tenants</span>
		<select name="tier">
			{#each data.tiers as t (t.id)}<option value={t.id} selected={t.id === data.defaultTierId}
					>{t.name}</option
				>{/each}
		</select>
	</label>
	<button class="button primary">Save</button>
</form>
