<script lang="ts">
	import { ago } from '#lib/format.ts';

	let { data, form } = $props();
</script>

<svelte:head><title>Users · Admin · Project Magic</title></svelte:head>

{#if form?.done}<p class="flash" role="status">{form.done}</p>{/if}
{#if form?.reason}<p class="flash error" role="alert">{form.reason}</p>{/if}

<form method="GET" role="search" class="form">
	<input
		type="search"
		name="q"
		value={data.q}
		placeholder="Search by GitHub login or name"
		aria-label="Search users"
	/>
</form>

<table class="data">
	<thead><tr><th>Person</th><th>Tenants</th><th>Signed up</th><th></th></tr></thead>
	<tbody>
		{#each data.users as u (u.id)}
			<tr>
				<td>
					<b>{u.login}</b>{#if u.name}<span class="muted small"> {u.name}</span>{/if}
					{#if u.platformRole === 'admin'}<span class="pill">platform admin</span>{/if}
					{#if u.disabled}<span class="pill suspended">disabled</span>{/if}
				</td>
				<td>{u.tenants.map((t) => `${t.name} (${t.role})`).join(', ') || '—'}</td>
				<td class="muted">{ago(u.createdAt, Date.now())}</td>
				<td>
					{#if u.id !== data.me}
						<form method="POST">
							<input type="hidden" name="user" value={u.id} />
							<input type="hidden" name="disable" value={u.disabled ? '0' : '1'} />
							<button class="button {u.disabled ? '' : 'danger'}"
								>{u.disabled ? 'Enable' : 'Disable'}</button
							>
						</form>
					{/if}
				</td>
			</tr>
		{/each}
	</tbody>
</table>
