<script lang="ts">
	import { ago } from '#lib/format.ts';

	let { data, form } = $props();
</script>

<svelte:head><title>Installations · Project Magic</title></svelte:head>

<p class="muted">
	Each GitHub account (a person or an organisation) that Project Magic is installed on. Its
	repositories become this tenant's projects.
</p>

{#if data.ok}<p class="flash" role="status">{data.ok}</p>{/if}
{#if data.error}<p class="flash error" role="alert">{data.error}</p>{/if}
{#if form?.done}<p class="flash" role="status">{form.done}</p>{/if}
{#if form?.reason}<p class="flash error" role="alert">{form.reason}</p>{/if}

{#if data.installations.length}
	<table class="data">
		<thead>
			<tr><th>Account</th><th>Repositories</th><th>Projects</th><th>Connected</th><th></th></tr>
		</thead>
		<tbody>
			{#each data.installations as i (i.id)}
				<tr>
					<td>
						<b>{i.accountLogin}</b>
						<span class="muted small">{i.accountType === 'User' ? 'personal' : 'organisation'}</span
						>
						{#if i.suspendedAt}<span class="pill suspended">suspended on GitHub</span>{/if}
					</td>
					<td>{i.repositorySelection === 'all' ? 'all' : 'selected'}</td>
					<td>{i.projects}</td>
					<td class="muted">{i.claimedAt ? ago(i.claimedAt, Date.now()) : ''}</td>
					<td>
						<form method="POST" action="?/disconnect" class="disconnect">
							<input type="hidden" name="installation" value={i.id} />
							<label class="small"
								><input type="checkbox" name="uninstall" /> also uninstall the App on GitHub</label
							>
							<button class="button danger">Disconnect</button>
						</form>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
{:else}
	<p class="muted">Nothing is connected yet.</p>
{/if}

<section class="panel">
	<h2>Connect GitHub</h2>
	<p>
		This takes you to GitHub to choose the account and the repositories, then brings you back. You
		need to own the account, or be an owner of the organisation.
	</p>
	<form method="POST" action="/tenant/installations/connect">
		<button class="button primary">Install on a GitHub account</button>
	</form>
	{#if data.existing.length}
		<h3>Already installed, not yet connected</h3>
		<p class="muted small">Installations you control that no tenant has claimed.</p>
		{#each data.existing as e (e.id)}
			<form method="POST" action="/tenant/installations/claim" class="inline">
				<input type="hidden" name="installation" value={e.id} />
				<span>{e.accountLogin}</span>
				<button class="button">Connect</button>
			</form>
		{/each}
	{/if}
	{#if data.reauth}
		<p class="muted small">
			Your GitHub sign-in has expired, so existing installations can't be listed.
			<a href="/auth/github?next=/tenant/installations">Sign in again</a>.
		</p>
	{/if}
</section>

<style>
	.disconnect {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		align-items: flex-start;
	}
	.inline {
		display: flex;
		gap: 0.6rem;
		align-items: center;
	}
</style>
