<script lang="ts">
	let { data, form } = $props();
</script>

<svelte:head><title>Tenant settings · Project Magic</title></svelte:head>

<form method="POST" class="panel form">
	{#if form?.done}<p class="flash" role="status">{form.done}</p>{/if}
	{#if form?.reason}<p class="flash error" role="alert">{form.reason}</p>{/if}
	<label>
		<span>Name</span>
		<input type="text" name="name" value={data.name} maxlength="80" required />
	</label>
	<p class="muted small">Address: <code>{data.slug}</code> (it cannot be changed).</p>
	<label class="check">
		<input type="checkbox" name="ai" checked={data.settings.aiEnabled} />
		<span>Use AI features (proposed statuses for items with no meta line, and Ask)</span>
	</label>
	<label class="check">
		<input type="checkbox" name="batch" checked={data.settings.batchEditsDefault} />
		<span>Batch edits are on by default for new members</span>
	</label>
	<button class="button primary">Save</button>
</form>
