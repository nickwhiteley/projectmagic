<script lang="ts">
	import { ago } from '#lib/format.ts';

	let { data, form } = $props();
	const t = $derived(data.tenant);
</script>

<svelte:head><title>{t.name} · Admin · Project Magic</title></svelte:head>

<p><a href="/admin/tenants">← Tenants</a></p>
<h2>
	{t.name} <code class="muted">{t.slug}</code> <span class="pill {t.status}">{t.status}</span>
</h2>
{#if t.statusReason}<p class="muted">Reason: {t.statusReason}</p>{/if}

<div class="stats">
	<div class="stat"><b>{t.members}</b><span class="muted">members</span></div>
	<div class="stat"><b>{t.installations}</b><span class="muted">GitHub accounts</span></div>
	<div class="stat"><b>{t.projects}</b><span class="muted">projects</span></div>
</div>
<p class="muted small">
	Created {ago(t.createdAt, Date.now())}. Counts only: a tenant's content is not shown here.
</p>

{#if form?.done}<p class="flash" role="status">{form.done}</p>{/if}
{#if form?.reason}<p class="flash error" role="alert">{form.reason}</p>{/if}

<section class="panel">
	<h2>Actions</h2>
	{#if t.status === 'pending'}
		<form method="POST">
			<input type="hidden" name="action" value="approve" /><button class="button primary"
				>Approve</button
			>
		</form>
	{/if}
	{#if t.status === 'suspended'}
		<form method="POST">
			<input type="hidden" name="action" value="restore" /><button class="button primary"
				>Unsuspend</button
			>
		</form>
	{/if}
	{#if t.status === 'active'}
		<form method="POST" class="form">
			<input type="hidden" name="action" value="suspend" />
			<label
				><span>Reason (shown to the tenant's admins)</span><input
					type="text"
					name="reason"
					required
				/></label
			>
			<button class="button danger">Suspend</button>
		</form>
	{/if}
	{#if t.status === 'deleted'}
		<p class="muted">
			Deleted {t.deletedAt ? ago(t.deletedAt, Date.now()) : ''}. Its data is purged 30 days after
			deletion.
		</p>
		<form method="POST">
			<input type="hidden" name="action" value="undelete" /><button class="button primary"
				>Restore it</button
			>
		</form>
	{:else}
		<form method="POST" class="form">
			<input type="hidden" name="action" value="delete" />
			<label
				><span>Type <code>{t.slug}</code> to delete it</span><input
					type="text"
					name="slug"
					autocomplete="off"
				/></label
			>
			<button class="button danger">Delete tenant</button>
		</form>
	{/if}
</section>

<section>
	<h2>Audit</h2>
	{#if data.audit.length}
		<table class="data">
			<tbody>
				{#each data.audit as a (a.id)}
					<tr>
						<td><code>{a.action}</code></td>
						<td>{a.actor ?? 'the service'}</td>
						<td class="muted">{ago(a.at, Date.now())}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{:else}
		<p class="muted">Nothing yet.</p>
	{/if}
</section>
