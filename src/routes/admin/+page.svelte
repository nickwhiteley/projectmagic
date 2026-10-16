<script lang="ts">
	let { data } = $props();
	const c = $derived(data.counts);
</script>

<svelte:head><title>Admin · Project Magic</title></svelte:head>

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
