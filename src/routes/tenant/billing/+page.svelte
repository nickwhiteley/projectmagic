<script lang="ts">
	import { formatMoney } from '#lib/core/plans.ts';

	let { data, form } = $props();
	const MESSAGES: Record<string, string> = {
		complete: 'Your plan has changed.',
		abandoned: 'Checkout was abandoned. Nothing has changed.',
		open: 'Checkout is not finished yet.',
		unknown: 'We could not find that checkout.'
	};
	const active = $derived(
		data.subscriptions.find((s) => s.status === 'active' || s.status === 'past_due')
	);
</script>

<svelte:head><title>Plan & billing · Project Magic</title></svelte:head>

{#if data.result}<p class="flash" role="status">{MESSAGES[data.result]}</p>{/if}
{#if form?.done}<p class="flash" role="status">{form.done}</p>{/if}
{#if form?.reason}<p class="flash error" role="alert">{form.reason}</p>{/if}

<section class="panel">
	<h2>Your plan: {data.tier?.name ?? 'none'}</h2>
	{#if data.overridden}<p class="muted small">
			Set by the people who run this service, without payment.
		</p>{/if}
	<table class="data">
		<thead><tr><th>Limit</th><th>Used</th><th>Allowed</th></tr></thead>
		<tbody>
			{#each data.limits as l (l.quota)}
				<tr>
					<td>{l.label}</td>
					<td
						>{l.used.toLocaleString()}
						{#if l.level === 'warn'}<span class="pill pending">nearly there</span
							>{:else if l.level === 'over'}<span class="pill suspended">at the limit</span
							>{/if}</td
					>
					<td>{l.limit === null ? 'unlimited' : l.limit.toLocaleString()}</td>
				</tr>
			{/each}
		</tbody>
	</table>
	<p class="muted small">
		AI features (inferred statuses and Ask): <b
			>{data.ai ? 'included' : 'not included in this plan'}</b
		>. Going down a plan takes nothing away; it only stops you adding more.
	</p>
</section>

{#if data.subscriptions.length}
	<section>
		<h2>Subscription</h2>
		<table class="data">
			<tbody>
				{#each data.subscriptions as s (s.id)}
					<tr>
						<td
							><b>{s.tierName}</b>
							{#if s.amountMinor !== null}<span class="muted small"
									>{formatMoney(s.amountMinor, s.currency ?? 'GBP')} a {s.interval}</span
								>{/if}</td
						>
						<td
							><span
								class="pill {s.status === 'active'
									? 'active'
									: s.status === 'past_due'
										? 'pending'
										: ''}">{s.status.replace('_', ' ')}</span
							></td
						>
						<td class="muted">
							{#if s.currentPeriodEnd}
								{s.cancelAtPeriodEnd || s.status === 'cancelled' ? 'ends' : 'renews'}
								{new Date(s.currentPeriodEnd).toLocaleDateString()}
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
		{#if active && !active.cancelAtPeriodEnd}
			<form method="POST" action="?/cancel">
				<button class="button danger">Cancel at the end of the period</button>
			</form>
		{/if}
	</section>
{/if}

<section>
	<h2>Change plan</h2>
	{#if !data.billing}
		<p class="muted">
			Billing is not set up on this service, so plans are set by the people who run it.
		</p>
	{:else if data.forSale.length}
		<p class="muted small">
			This is a test billing page: no money is taken, and nothing here is a real payment.
		</p>
		<div class="plans">
			{#each data.forSale as t (t.id)}
				<form method="POST" action="?/subscribe" class="panel">
					<input type="hidden" name="tier" value={t.id} />
					<h3>{t.name}</h3>
					{#each t.prices as p (p.interval)}
						<label class="check">
							<input
								type="radio"
								name="interval"
								value={p.interval}
								checked={p.interval === 'month'}
							/>
							{formatMoney(p.amountMinor, p.currency)} a {p.interval}
						</label>
					{/each}
					<button class="button primary" disabled={data.tier?.id === t.id}>
						{data.tier?.id === t.id ? 'Your plan' : 'Choose'}
					</button>
				</form>
			{/each}
		</div>
	{:else}
		<p class="muted">No paid plans are on sale yet.</p>
	{/if}
</section>

<style>
	.plans {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
		gap: 0.75rem;
	}
</style>
