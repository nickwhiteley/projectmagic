<script lang="ts">
	import { page } from '$app/state';

	let { data, form } = $props();
</script>

<svelte:head><title>Settings · Project Magic</title></svelte:head>

<div class="admin">
	<h1>Your settings</h1>
	{#if form?.done}<p class="flash" role="status">{form.done}</p>{/if}
	{#if form?.reason}<p class="flash error" role="alert">{form.reason}</p>{/if}

	<section>
		<h2>Your account</h2>
		<p>Signed in with GitHub as <code>@{data.login}</code>.</p>
	</section>

	{#if page.data.ai}
		<section>
			<h2>Inferred statuses</h2>
			<p class="muted">
				For an item with no meta line, a model can propose a status. They are
				<b>{page.data.ai.optedOut ? 'hidden' : 'shown'}</b> in your views. This is your choice alone.
			</p>
			<form method="POST" action="/settings/ai">
				<input type="hidden" name="optOut" value={page.data.ai.optedOut ? '0' : '1'} />
				<input type="hidden" name="back" value="/settings" />
				<button class="button">{page.data.ai.optedOut ? 'Show' : 'Hide'} inferred statuses</button>
			</form>
		</section>
	{/if}

	<section>
		<h2>Your tenants</h2>
		{#if data.tenants.length}
			<table class="data">
				<tbody>
					{#each data.tenants as t (t.id)}
						<tr>
							<td><b>{t.name}</b> <span class="muted small">{t.role}</span></td>
							<td>
								<form method="POST" action="?/leave">
									<input type="hidden" name="tenant" value={t.id} />
									<button class="button danger">Leave</button>
								</form>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{:else}
			<p class="muted">
				You are not in a tenant. <a href="/welcome">Create one or accept an invitation</a>.
			</p>
		{/if}
	</section>

	<form method="POST" action="?/delete" class="panel danger form">
		<h2>Delete your account</h2>
		<p>
			Removes you from every tenant, erases your stored GitHub sign-in and deletes your account.
			Your edits stay in the repositories and in each project's edit history, without your name. You
			cannot do this while you are the only admin of a tenant.
		</p>
		<label
			><span>Type <code>{data.login}</code> to confirm</span><input
				type="text"
				name="login"
				autocomplete="off"
				required
			/></label
		>
		<button class="button danger">Delete my account</button>
	</form>
</div>
