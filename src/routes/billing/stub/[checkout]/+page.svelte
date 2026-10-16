<script lang="ts">
	import { formatMoney } from '#lib/core/plans.ts';

	let { data } = $props();
</script>

<svelte:head><title>Test payment · Project Magic</title></svelte:head>

<div class="admin">
	<h1>Test payment page</h1>
	<p class="flash warn" role="note">
		This is a stand-in for a payment provider. <b>No money is taken</b> and no card is asked for.
	</p>
	<div class="panel">
		<p>
			<b>{data.tenant}</b> is changing to <b>{data.tier}</b>
			{#if data.amountMinor !== null}at {formatMoney(data.amountMinor, data.currency ?? 'GBP')} a {data.interval}{/if}.
		</p>
		{#if data.open}
			<form method="POST" action="?/complete">
				<button class="button primary">Complete</button>
			</form>
			<form method="POST" action="?/abandon"><button class="button">Abandon</button></form>
		{:else}
			<p class="muted">
				This checkout is finished. <a href="/tenant/billing">Back to Plan & billing</a>
			</p>
		{/if}
	</div>
</div>
