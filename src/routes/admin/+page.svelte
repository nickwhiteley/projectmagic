<script lang="ts">
	let { data } = $props();
	const c = $derived(data.counts);
</script>

<svelte:head><title>Admin · Project Magic</title></svelte:head>

{#if data.attention.total}
	<a class="attention" class:critical={data.attention.critical > 0} href="/admin/ops">
		<b
			>{data.attention.total} thing{data.attention.total === 1 ? ' needs' : 's need'} attention{data
				.attention.critical
				? `, ${data.attention.critical} critical`
				: ''}</b
		>
		<span>{data.attention.top.join(' · ')}{data.attention.total > 3 ? ' · …' : ''}</span>
	</a>
{:else}
	<a class="attention well" href="/admin/ops"><b>All is well.</b> <span>Operations</span></a>
{/if}
<div class="stats">
	<div class="stat"><b>{c.active}</b><span class="muted">active tenants</span></div>
	<div class="stat">
		<b>{c.pending}</b><span class="muted">waiting for approval</span>
		{#if c.pending}<a href="/admin/tenants">review</a>{/if}
	</div>
	<div class="stat"><b>{c.suspended}</b><span class="muted">suspended</span></div>
	<div class="stat"><b>{c.week}</b><span class="muted">created this week</span></div>
	<div class="stat">
		<b>{c.unclaimed}</b><span class="muted">unclaimed installations</span>
		{#if c.stale}<span class="pill unclaimed">{c.stale} over a week old</span>{/if}
	</div>
</div>

<p class="muted small">
	Platform admins see tenants' metadata, never their content. Members, projects and usage here are
	counts only.
</p>

<style>
	.attention {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding: 0.7rem 1rem;
		border-radius: 10px;
		text-decoration: none;
		color: var(--warn);
		background: var(--warn-bg);
		border: 1px solid var(--line);
	}
	.attention.critical {
		color: var(--danger);
		background: var(--del-bg);
	}
	.attention.well {
		flex-direction: row;
		gap: 0.5rem;
		color: var(--st-done);
		background: var(--st-done-bg);
	}
	.attention span {
		color: var(--text-2);
		font-size: 13px;
	}
</style>
