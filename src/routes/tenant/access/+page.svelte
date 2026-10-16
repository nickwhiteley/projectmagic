<script lang="ts">
	import { goto } from '$app/navigation';

	let { data, form } = $props();
	const FROM: Record<string, string> = {
		admin: 'tenant admin',
		manual: 'set by an admin',
		github: 'from GitHub',
		default: 'the default',
		none: ''
	};
</script>

<svelte:head><title>Access · Project Magic</title></svelte:head>

{#if form?.done}<p class="flash" role="status">{form.done}</p>{/if}
{#if form?.reason}<p class="flash error" role="alert">{form.reason}</p>{/if}

<form method="POST" action="?/mode" class="panel form">
	<h2>How project roles are decided</h2>
	<label class="check">
		<input type="radio" name="access" value="github" checked={data.access === 'github'} />
		<span>
			<b>From GitHub.</b> A member's role on a project follows their permission on the repository: admin
			or maintain is maintainer, push is editor, read or triage is viewer. It is read with their own sign-in
			and refreshed hourly.
		</span>
	</label>
	<label class="check">
		<input type="radio" name="access" value="managed" checked={data.access === 'managed'} />
		<span>
			<b>Managed here.</b> Roles are only what admins set below. For people without GitHub access to the
			repositories, such as a client following progress.
		</span>
	</label>
	<label>
		<span>With managed access, a project nobody set a role on gives members</span>
		<select name="default">
			<option value="none" selected={data.defaultRole === 'none'}>no access</option>
			<option value="viewer" selected={data.defaultRole === 'viewer'}>viewer</option>
			<option value="editor" selected={data.defaultRole === 'editor'}>editor</option>
		</select>
	</label>
	<button class="button primary">Save</button>
</form>

<section>
	<h2>Roles on a project</h2>
	{#if data.project}
		<label class="pick">
			<span class="muted">Project</span>
			<select
				value={data.project.param}
				onchange={(e) => goto(`?project=${encodeURIComponent(e.currentTarget.value)}`)}
			>
				{#each data.projects as p (p.id)}<option value={p.param}>{p.name}</option>{/each}
			</select>
		</label>
		<p class="muted small">
			A role set here beats the one from GitHub or the default, up or down. GitHub still refuses a
			write the person has no right to.
		</p>
		<table class="data">
			<thead><tr><th>Person</th><th>Role</th><th></th></tr></thead>
			<tbody>
				{#each data.members as m (m.userId)}
					<tr>
						<td
							><b>{m.login}</b>
							{#if m.tenantRole === 'admin'}<span class="pill">admin</span>{/if}</td
						>
						<td>
							{#if m.source === 'admin'}
								maintainer <span class="muted small">(tenant admin)</span>
							{:else}
								<form method="POST" action="?/role" class="inline">
									<input type="hidden" name="project" value={data.project.id} />
									<input type="hidden" name="user" value={m.userId} />
									<select
										name="role"
										aria-label="Role of {m.login}"
										onchange={(e) => e.currentTarget.form?.requestSubmit()}
									>
										<option value="none" selected={m.role === 'none'}>no access</option>
										<option value="viewer" selected={m.role === 'viewer'}>viewer</option>
										<option value="editor" selected={m.role === 'editor'}>editor</option>
										<option value="maintainer" selected={m.role === 'maintainer'}>maintainer</option
										>
									</select>
									<noscript><button class="button">Set</button></noscript>
									{#if FROM[m.source]}<span class="muted small">{FROM[m.source]}</span>{/if}
								</form>
							{/if}
						</td>
						<td>
							{#if m.source === 'manual'}
								<form method="POST" action="?/role">
									<input type="hidden" name="project" value={data.project.id} />
									<input type="hidden" name="user" value={m.userId} />
									<input type="hidden" name="role" value="inherit" />
									<button class="button">Clear override</button>
								</form>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{:else}
		<p class="muted">No projects yet. Connect a GitHub account first.</p>
	{/if}
</section>

<style>
	.inline {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}
	.pick {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}
</style>
