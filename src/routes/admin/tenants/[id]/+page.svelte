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
		<form method="POST" action="?/move">
			<input type="hidden" name="action" value="approve" /><button class="button primary"
				>Approve</button
			>
		</form>
	{/if}
	{#if t.status === 'suspended'}
		<form method="POST" action="?/move">
			<input type="hidden" name="action" value="restore" /><button class="button primary"
				>Unsuspend</button
			>
		</form>
	{/if}
	{#if t.status === 'active'}
		<form method="POST" action="?/move" class="form">
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
		<form method="POST" action="?/move">
			<input type="hidden" name="action" value="undelete" /><button class="button primary"
				>Restore it</button
			>
		</form>
	{:else}
		<form method="POST" action="?/move" class="form">
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

{#if t.status !== 'deleted'}
	<form method="POST" action="?/support" class="panel form">
		<h2>Open as support</h2>
		<p class="muted small">
			A read-only view of this tenant's projects for one hour. You must say why; the reason is
			written to the audit log and shown to the tenant's admins.
		</p>
		<label><span>Reason</span><input type="text" name="reason" required minlength="5" /></label>
		<button class="button">Open as support</button>
	</form>
{/if}

<section class="panel">
	<h2>Plan: {data.plan.tier ?? 'none'}</h2>
	<table class="data">
		<tbody>
			{#each data.plan.limits as l (l.key)}
				<tr>
					<td>{l.label}</td>
					<td
						>{l.used.toLocaleString()} of {l.limit === null
							? 'unlimited'
							: l.limit.toLocaleString()}</td
					>
				</tr>
			{/each}
			{#each data.plan.flags as f (f.key)}
				<tr><td>{f.key}</td><td>{f.on ? 'on' : 'off'}</td></tr>
			{/each}
		</tbody>
	</table>

	<form method="POST" action="?/tier" class="form">
		<label>
			<span>Put on a tier without payment (a trial, a friend, an exception)</span>
			<select name="tier">
				<option value="" selected={data.overrides.tierOverrideId === null}
					>none: use the tier it pays for</option
				>
				{#each data.tiers as t (t.id)}
					<option value={t.id} selected={data.overrides.tierOverrideId === t.id}>{t.name}</option>
				{/each}
			</select>
		</label>
		<button class="button">Save</button>
	</form>

	<form method="POST" action="?/quota" class="form">
		<h3>Override a limit</h3>
		<label>
			<span>Limit</span>
			<select name="quota">
				{#each data.plan.limits as l (l.key)}<option value={l.key}>{l.label}</option>{/each}
			</select>
		</label>
		<label
			><span>Value (a number, “unlimited”, or “remove”)</span><input
				type="text"
				name="value"
				required
			/></label
		>
		<label><span>Reason</span><input type="text" name="reason" /></label>
		<label><span>Expires (optional)</span><input type="date" name="expires" /></label>
		<button class="button">Save override</button>
	</form>
	{#if data.overrides.quotas.length}
		<ul class="small">
			{#each data.overrides.quotas as o (o.quota)}
				<li>
					<code>{o.quota}</code> = {o.value === null ? 'unlimited' : o.value}: {o.reason}{o.expiresAt
						? `, until ${o.expiresAt.slice(0, 10)}`
						: ''}
				</li>
			{/each}
		</ul>
	{/if}

	{#each data.flagKeys as f (f.key)}
		<form method="POST" action="?/flag" class="form">
			<h3>{f.label}</h3>
			<input type="hidden" name="flag" value={f.key} />
			<label>
				<span>Override</span>
				<select name="state">
					<option value="remove">none: follow the plan</option>
					<option value="on">force on</option>
					<option value="off">force off</option>
				</select>
			</label>
			<label><span>Reason</span><input type="text" name="reason" /></label>
			<label><span>Expires (optional)</span><input type="date" name="expires" /></label>
			<button class="button">Save</button>
		</form>
	{/each}
	{#if data.overrides.flags.length}
		<ul class="small">
			{#each data.overrides.flags as o (o.flag)}
				<li>
					<code>{o.flag}</code> forced {o.on ? 'on' : 'off'}: {o.reason}{o.expiresAt
						? `, until ${o.expiresAt.slice(0, 10)}`
						: ''}
				</li>
			{/each}
		</ul>
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
