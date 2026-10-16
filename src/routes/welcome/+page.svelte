<script lang="ts">
	import { slugify } from '#lib/core/tenants.ts';

	let { data, form } = $props();
	let name = $state('');
	let slug = $state('');
	let touched = $state(false);
	$effect(() => {
		if (!touched) slug = slugify(name);
	});
</script>

<svelte:head><title>Welcome · Project Magic</title></svelte:head>

<div class="admin">
	<h1>Welcome to Project Magic</h1>

	{#if data.tenants.length}
		<p class="muted">
			You already belong to {data.tenants.map((t) => t.name).join(', ')}. <a href="/">Go to it</a>,
			or create another tenant here.
		</p>
	{:else}
		<p class="muted">
			You are not in a tenant yet. A tenant is your team: its people, its GitHub accounts and its
			settings. Create one, or ask a colleague to invite you to theirs.
		</p>
	{/if}

	{#if data.canCreate}
		<form method="POST" class="panel form">
			<h2>Create a tenant</h2>
			{#if form?.reason}<p class="flash error" role="alert">{form.reason}</p>{/if}
			<label>
				<span>Name</span>
				<input type="text" name="name" bind:value={name} maxlength="80" required />
			</label>
			<label>
				<span>Address</span>
				<input
					type="text"
					name="slug"
					bind:value={slug}
					oninput={() => (touched = true)}
					maxlength="40"
					pattern="[a-z0-9\-]+"
					aria-describedby="slug-help"
				/>
				<small id="slug-help" class="muted"
					>Lower-case letters, numbers and hyphens. It cannot be changed later.</small
				>
			</label>
			{#if data.waits}
				<p class="muted small">
					New tenants wait for approval before they can connect GitHub. You will see a notice here
					until it is approved.
				</p>
			{/if}
			<button class="button primary">Create tenant</button>
		</form>
	{:else}
		<p class="panel">
			Creating tenants is closed. Ask a colleague who already uses Project Magic to invite you.
		</p>
	{/if}
</div>
