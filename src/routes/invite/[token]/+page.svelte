<script lang="ts">
	let { data, form } = $props();
</script>

<svelte:head><title>Invitation · Project Magic</title></svelte:head>

<div class="admin">
	<h1>Invitation</h1>
	{#if !data.invitation}
		<p class="panel">This invitation has expired or was withdrawn. Ask for a new one.</p>
	{:else if !data.forYou}
		<p class="panel">
			This invitation to <b>{data.invitation.tenantName}</b> is for the GitHub account
			<b>{data.invitation.githubLogin}</b>, and you are signed in as <b>{data.me}</b>. Sign out and
			sign in as {data.invitation.githubLogin} to accept it.
		</p>
	{:else}
		<form method="POST" class="panel form">
			<p>
				Join <b>{data.invitation.tenantName}</b> as {data.invitation.role === 'admin'
					? 'an admin'
					: 'a member'}.
			</p>
			{#if form?.reason}<p class="flash error" role="alert">{form.reason}</p>{/if}
			<button class="button primary">Join</button>
		</form>
	{/if}
</div>
