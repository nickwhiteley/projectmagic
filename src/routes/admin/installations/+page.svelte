<script lang="ts">
	import { ago } from '#lib/format.ts';

	let { data, form } = $props();
</script>

<svelte:head><title>Installations · Admin · Project Magic</title></svelte:head>

{#if form?.done}<p class="flash" role="status">{form.done}</p>{/if}
{#if form?.reason}<p class="flash error" role="alert">{form.reason}</p>{/if}

<p class="muted">
	Every GitHub account the App is installed on. One that no tenant has claimed syncs nothing; after
	{data.staleDays} days it is flagged here and can be uninstalled.
</p>

{#if data.installations.length}
	<table class="data">
		<thead
			><tr><th>Account</th><th>Tenant</th><th>Projects</th><th>Installed</th><th></th></tr></thead
		>
		<tbody>
			{#each data.installations as i (i.id)}
				<tr>
					<td
						><b>{i.accountLogin}</b>
						<span class="muted small">{i.accountType === 'User' ? 'personal' : 'organisation'}</span
						></td
					>
					<td>
						{#if i.tenantId}<a href="/admin/tenants/{i.tenantId}">{i.tenantName}</a>
						{:else}<span class="pill unclaimed">unclaimed</span>{#if i.stale}
								<span class="pill suspended">stale</span>{/if}{/if}
					</td>
					<td>{i.projects}</td>
					<td class="muted">{ago(i.createdAt, Date.now())}</td>
					<td>
						{#if !i.tenantId}
							<form method="POST" action="?/uninstall">
								<input type="hidden" name="installation" value={i.id} />
								<button class="button danger">Uninstall</button>
							</form>
						{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
{:else}
	<p class="muted">No installations.</p>
{/if}
