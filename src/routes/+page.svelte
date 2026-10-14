<script lang="ts">
	let { data } = $props();
</script>

<svelte:head><title>Project Magic</title></svelte:head>

<header>
	<h1>Project Magic</h1>
	<span>{data.user.name ?? data.user.login}</span>
	<form method="POST" action="/auth/signout"><button>Sign out</button></form>
</header>

<main>
	{#if data.projects.length}
		<ul>
			{#each data.projects as p (p.repo)}
				<li>{p.owner}/{p.repo} · {p.lastSyncAt ? `synced ${p.lastSyncAt}` : 'not synced yet'}</li>
			{/each}
		</ul>
	{:else}
		<p>No projects yet: they appear after the first sync (phase 3.3).</p>
	{/if}
</main>
