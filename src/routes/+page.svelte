<script lang="ts">
	import Landing from '#lib/components/Landing.svelte';
	import Overview from '#lib/components/Overview.svelte';

	let { data } = $props();
</script>

{#if data.landing}
	<Landing />
{:else}
	<Overview {data} />
{/if}
