<script lang="ts">
	import { ago } from '#lib/format.ts';

	let { data, form } = $props();
	const HOW: Record<string, string> = {
		signup: 'created it',
		invited: 'invited',
		github: 'GitHub access'
	};
</script>

<svelte:head><title>Members · Project Magic</title></svelte:head>

{#if form?.done}<p class="flash" role="status">{form.done}</p>{/if}
{#if form?.link}<p class="flash"><code>{form.link}</code></p>{/if}
{#if form?.reason}<p class="flash error" role="alert">{form.reason}</p>{/if}

<table class="data">
	<thead>
		<tr><th>Person</th><th>Role</th><th>Joined</th><th>Projects</th><th>Last seen</th><th></th></tr>
	</thead>
	<tbody>
		{#each data.members as m (m.userId)}
			<tr>
				<td>
					<b>{m.login}</b>{#if m.name}<span class="muted small"> {m.name}</span>{/if}
					{#if m.disabled}<span class="pill suspended">disabled</span>{/if}
					{#if m.userId === data.me}<span class="muted small"> (you)</span>{/if}
				</td>
				<td>
					<form method="POST" action="?/role" class="inline">
						<input type="hidden" name="user" value={m.userId} />
						<select
							name="role"
							aria-label="Role of {m.login}"
							onchange={(e) => e.currentTarget.form?.requestSubmit()}
						>
							<option value="member" selected={m.role === 'member'}>member</option>
							<option value="admin" selected={m.role === 'admin'}>admin</option>
						</select>
						<noscript><button class="button">Set</button></noscript>
					</form>
				</td>
				<td class="muted"
					>{ago(m.joinedAt, Date.now())}<br /><span class="small">{HOW[m.source]}</span></td
				>
				<td>{m.role === 'admin' ? 'all' : m.projects}</td>
				<td class="muted">{m.lastSeenAt ? ago(m.lastSeenAt, Date.now()) : 'never'}</td>
				<td>
					<form method="POST" action="?/remove">
						<input type="hidden" name="user" value={m.userId} />
						<button class="button danger">{m.userId === data.me ? 'Leave' : 'Remove'}</button>
					</form>
				</td>
			</tr>
		{/each}
	</tbody>
</table>

<section class="panel">
	<h2>Invite someone</h2>
	<p class="muted small">
		By GitHub login; no email is needed. The invitation is valid for 14 days, and can be sent as a
		link.
	</p>
	<form method="POST" action="?/invite" class="form">
		<label
			><span>GitHub login</span><input
				type="text"
				name="login"
				required
				autocomplete="off"
			/></label
		>
		<label>
			<span>Role in the tenant</span>
			<select name="role"
				><option value="member">member</option><option value="admin">admin</option></select
			>
		</label>
		{#if data.managed && data.projects.length}
			<fieldset>
				<legend class="small muted">Project roles (this tenant sets roles itself)</legend>
				{#each data.projects as p (p.id)}
					<label class="check">
						<select name="pr_{p.id}" aria-label="Role on {p.name}">
							<option value="">no role</option>
							<option value="viewer">viewer</option>
							<option value="editor">editor</option>
							<option value="maintainer">maintainer</option>
						</select>
						<span>{p.name}</span>
					</label>
				{/each}
			</fieldset>
		{/if}
		<button class="button primary">Send invitation</button>
	</form>

	{#if data.invitations.length}
		<h3>Waiting to be accepted</h3>
		<table class="data">
			<tbody>
				{#each data.invitations as i (i.id)}
					<tr>
						<td><b>{i.githubLogin}</b> <span class="muted small">as {i.role}</span></td>
						<td class="muted">sent {ago(i.createdAt, Date.now())}</td>
						<td>
							<form method="POST" action="?/revoke">
								<input type="hidden" name="id" value={i.id} />
								<button class="button">Withdraw</button>
							</form>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<form method="POST" action="?/github" class="panel form">
	<h2>Joining by GitHub access</h2>
	<p class="muted small">
		Someone who signs in and can see one of your connected <em>organisations</em> on GitHub joins as a
		member, with no invitation. Turn it off to choose who joins.
	</p>
	<label class="check"
		><input type="checkbox" name="on" checked={data.joinByGithub} /> Let people join this way</label
	>
	<button class="button">Save</button>
</form>

<style>
	.inline {
		display: flex;
		gap: 0.4rem;
	}
	fieldset {
		border: 1px solid var(--line);
		border-radius: var(--radius);
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		width: 100%;
	}
</style>
