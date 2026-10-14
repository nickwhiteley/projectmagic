<script lang="ts">
	let { data } = $props();
</script>

<svelte:head><title>Sign in · Project Magic</title></svelte:head>

<main>
	<h1>Project Magic</h1>
	{#if data.message}<p role="alert">{data.message}</p>{/if}
	<a href={data.href}>Sign in with GitHub</a>
</main>
