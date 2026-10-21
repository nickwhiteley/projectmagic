<script lang="ts">
	let { data, form } = $props();
</script>

<svelte:head><title>Tenant settings · Project Magic</title></svelte:head>

<form method="POST" action="?/save" class="panel form">
	{#if form?.done}<p class="flash" role="status">{form.done}</p>{/if}
	{#if form?.reason}<p class="flash error" role="alert">{form.reason}</p>{/if}
	<label>
		<span>Name</span>
		<input type="text" name="name" value={data.name} maxlength="80" required />
	</label>
	<p class="muted small">Address: <code>{data.slug}</code> (it cannot be changed).</p>
	<label class="check">
		<input type="checkbox" name="ai" checked={data.settings.aiEnabled} />
		<span>Use AI features (proposed statuses for items with no meta line, and Ask)</span>
	</label>
	<label class="check">
		<input type="checkbox" name="batch" checked={data.settings.batchEditsDefault} />
		<span>Batch edits are on by default for new members</span>
	</label>
	<button class="button primary">Save</button>
</form>

{#if data.slack}
	<section class="panel form">
		<h2>Daily digest to Slack</h2>
		{#if form?.slackDone}<p class="flash" role="status">{form.slackDone}</p>{/if}
		{#if form?.slackReason}<p class="flash error" role="alert">{form.slackReason}</p>{/if}
		<p class="muted small">
			Each morning, after the sync, a message lists what waits on a person in every project: built
			items to check, blocked items, and agents' replies. Nothing is sent when nothing waits.
			Everyone in the channel sees every project's items.
		</p>
		{#if data.slack.connected}
			<p>A webhook is set.</p>
			<div class="row">
				<form method="POST" action="?/digest">
					<button class="button">Send now</button>
				</form>
				<form method="POST" action="?/slack">
					<input type="hidden" name="remove" value="yes" />
					<button class="button">Remove</button>
				</form>
			</div>
		{/if}
		<form method="POST" action="?/slack">
			<label>
				<span>{data.slack.connected ? 'Replace the webhook' : 'Incoming webhook URL'}</span>
				<input
					type="url"
					name="webhook"
					placeholder="https://hooks.slack.com/services/…"
					autocomplete="off"
					required
				/>
			</label>
			<p class="muted small">
				In Slack: create an app for your workspace, turn on <em>Incoming Webhooks</em>, add one to
				the channel, and paste its URL here. It is stored encrypted.
			</p>
			<button class="button primary">Save webhook</button>
		</form>
	</section>
{/if}

<style>
	section {
		margin-top: 1.5rem;
	}
	h2 {
		font-size: 1rem;
		margin: 0;
	}
	.row {
		display: flex;
		gap: 0.5rem;
	}
</style>
