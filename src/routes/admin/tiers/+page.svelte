<script lang="ts">
	import { formatMoney } from '#lib/core/plans.ts';

	let { data, form } = $props();
	const val = (v: number | null | undefined) =>
		v === undefined ? '' : v === null ? 'unlimited' : String(v);
	const price = (t: (typeof data.view.tiers)[number], interval: string) =>
		t.prices.find((p) => p.interval === interval && p.active);
</script>

<svelte:head><title>Tiers & prices · Admin · Project Magic</title></svelte:head>

<p class="muted">
	Tiers, their limits and their prices are set here, never in code. A tier inherits a limit it
	doesn’t set from the nearest tier below it; “unlimited” is an explicit choice that beats an
	inherited number. Changing a limit applies to its tenants at once, and going down takes nothing
	away: it only stops tenants adding more.
</p>

{#if form?.done}<p class="flash" role="status">{form.done}</p>{/if}
{#if form?.reason}<p class="flash error" role="alert">{form.reason}</p>{/if}

{#each data.view.tiers as t, i (t.id)}
	<section class="panel tier">
		<h2>
			{t.name}
			{#if t.isDefault}<span class="pill active">default for new tenants</span>{/if}
			{#if !t.enabled}<span class="pill suspended">disabled</span>{/if}
			<span class="muted small">{t.tenants} tenant{t.tenants === 1 ? '' : 's'}</span>
		</h2>
		<div class="row">
			<form method="POST" action="?/update" class="inline">
				<input type="hidden" name="tier" value={t.id} />
				<input type="text" name="name" value={t.name} aria-label="Name" required maxlength="40" />
				<label class="check"
					><input type="checkbox" name="enabled" checked={t.enabled} /> can be chosen</label
				>
				<button class="button">Save</button>
			</form>
			<form method="POST" action="?/move" class="inline">
				<input type="hidden" name="tier" value={t.id} />
				<button class="button" name="dir" value="up" disabled={i === 0} aria-label="Move up"
					>↑</button
				>
				<button
					class="button"
					name="dir"
					value="down"
					disabled={i === data.view.tiers.length - 1}
					aria-label="Move down">↓</button
				>
			</form>
		</div>

		<form method="POST" action="?/quota" class="form">
			<input type="hidden" name="tier" value={t.id} />
			<div class="grid">
				{#each data.quotas as q (q.key)}
					<label>
						<span>{q.label}</span>
						<input
							type="text"
							name={q.key}
							value={val(t.quotas[q.key as keyof typeof t.quotas])}
							placeholder="inherit"
						/>
					</label>
				{/each}
			</div>
			<span class="muted small">A number, “unlimited”, or blank to inherit.</span>
			<button class="button">Save limits</button>
		</form>

		<form method="POST" action="?/price" class="form">
			<input type="hidden" name="tier" value={t.id} />
			<div class="grid">
				<label
					><span>Monthly price (£)</span><input
						type="text"
						name="month"
						value={price(t, 'month') ? (price(t, 'month')!.amountMinor / 100).toFixed(2) : ''}
						placeholder="not for sale"
					/></label
				>
				<label
					><span>Yearly price (£)</span><input
						type="text"
						name="year"
						value={price(t, 'year') ? (price(t, 'year')!.amountMinor / 100).toFixed(2) : ''}
						placeholder="not for sale"
					/></label
				>
			</div>
			<span class="muted small">
				Blank takes it off sale: nobody moves, but it can’t be bought.
				{#if price(t, 'month')}Now {formatMoney(
						price(t, 'month')!.amountMinor,
						price(t, 'month')!.currency
					)} a month.{/if}
			</span>
			<button class="button">Save prices</button>
		</form>
	</section>
{/each}

<form method="POST" action="?/create" class="panel form">
	<h2>Add a tier</h2>
	<label><span>Name</span><input type="text" name="name" required maxlength="40" /></label>
	<span class="muted small">It is added at the top. Use the arrows to place it.</span>
	<button class="button primary">Add tier</button>
</form>

<section>
	<h2>Features</h2>
	{#each data.view.flags as f (f.key)}
		<form method="POST" action="?/flag" class="panel form">
			<input type="hidden" name="flag" value={f.key} />
			<b>{f.label}</b>
			<label class="check"
				><input type="checkbox" name="enabled" checked={f.enabled} /> switched on for the service</label
			>
			<label>
				<span>Included from tier</span>
				<select name="min">
					<option value="" selected={f.minTierId === null}>every tier</option>
					{#each data.view.tiers as t (t.id)}
						<option value={t.id} selected={f.minTierId === t.id}>{t.name} and above</option>
					{/each}
				</select>
			</label>
			<button class="button">Save</button>
		</form>
	{/each}
</section>

<style>
	.tier h2 {
		display: flex;
		gap: 0.6rem;
		align-items: baseline;
		flex-wrap: wrap;
	}
	.row {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.inline {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
		gap: 0.6rem;
		width: 100%;
	}
	.tier .form {
		max-width: none;
	}
</style>
