<script lang="ts">
	import { ago } from '#lib/format.ts';

	let { data } = $props();
</script>

<svelte:head><title>Tenants · Admin · Project Magic</title></svelte:head>

<form method="GET" role="search" class="form">
	<input
		type="search"
		name="q"
		value={data.q}
		placeholder="Search by name or address"
		aria-label="Search tenants"
	/>
</form>

{#if data.tenants.length}
	<table class="data">
		<thead>
			<tr
				><th>Tenant</th><th>Status</th><th>Members</th><th>Accounts</th><th>Projects</th><th
					>Created</th
				></tr
			>
		</thead>
		<tbody>
			{#each data.tenants as t (t.id)}
				<tr>
					<td
						><a href="/admin/tenants/{t.id}"><b>{t.name}</b></a>
						<code class="muted">{t.slug}</code></td
					>
					<td><span class="pill {t.status}">{t.status}</span></td>
					<td>{t.members}</td>
					<td>{t.installations}</td>
					<td>{t.projects}</td>
					<td class="muted">{ago(t.createdAt, Date.now())}</td>
				</tr>
			{/each}
		</tbody>
	</table>
{:else}
	<p class="muted">No tenants{data.q ? ' match' : ' yet'}.</p>
{/if}
