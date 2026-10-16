<script lang="ts">
	let { data, form } = $props();
</script>

<svelte:head><title>Delete tenant · Project Magic</title></svelte:head>

<form method="POST" class="panel danger form">
	<h2>Delete this tenant</h2>
	<p>
		Everyone loses access at once, its GitHub accounts are disconnected and the App is uninstalled
		from them. The data is kept for 30 days, and a platform admin can restore it within that time.
		After that it is purged.
	</p>
	{#if form?.reason}<p class="flash error" role="alert">{form.reason}</p>{/if}
	<label>
		<span>Type <code>{data.slug}</code> to confirm</span>
		<input type="text" name="slug" autocomplete="off" required />
	</label>
	<button class="button danger">Delete tenant</button>
</form>
