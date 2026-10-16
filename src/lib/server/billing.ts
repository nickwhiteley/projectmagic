// Billing (specs/tenants.md §7.3), ported from plinth: a checkout is an attempt; a subscription is a
// relationship; the provider is the authority on its state. Only the stub provider exists, and it
// takes no money. Reconcile is the one way state comes in, and it moves the tenant's tier.
import { BILLING_PROVIDER, BILLING_STUB, VERCEL_ENV } from '$app/env/private';
import { stubAvailable, tierFromSubscriptions, type SubscriptionStatus } from '#lib/core/plans.ts';
import { db } from './db.ts';
import { forgetAiCache } from './plans.ts';
import { applyProjectLimit, loadPlanData } from './plan-queries.ts';

export type Interval = 'month' | 'year';

export interface ProviderState {
	status: SubscriptionStatus;
	periodEnd: string | null;
	cancelAtPeriodEnd: boolean;
}

/** What a payment provider does for us. A real one is a second implementation of this. */
export interface BillingProvider {
	name: string;
	ensureCustomer(tenant: { id: string; name: string }): Promise<string>;
	/** Begins a subscription and returns where to send the admin to pay. */
	start(args: {
		subscriptionId: string;
		checkoutId: string;
		interval: Interval;
	}): Promise<{ ref: string; url: string }>;
	fetch(ref: string): Promise<ProviderState | null>;
	cancel(ref: string): Promise<void>;
}

const DAY = 86_400_000;
const periodMs = (i: Interval) => (i === 'year' ? 365 : 30) * DAY;

/** The stub: its own record of what it was asked (`stub_subscription`), which reconcile reads
 * instead of our subscription row. It renews itself, and ends when cancelled and the period runs out. */
export const stubProvider: BillingProvider = {
	name: 'stub',
	async ensureCustomer(tenant) {
		const ref = `stub_cus_${tenant.id}`;
		await db()`insert into billing_customer (tenant_id, provider, provider_ref) values (${tenant.id}, 'stub', ${ref})
			on conflict (tenant_id, provider) do nothing`;
		return ref;
	},
	async start({ subscriptionId, checkoutId, interval }) {
		const ref = `stub_sub_${subscriptionId}`;
		await db()`insert into stub_subscription (ref, interval) values (${ref}, ${interval}) on conflict (ref) do nothing`;
		return { ref, url: `/billing/stub/${checkoutId}` };
	},
	async fetch(ref) {
		const [s] = await db()<
			{
				status: string;
				period_end: Date | null;
				cancel_at_period_end: boolean;
				interval: Interval;
			}[]
		>`select status, period_end, cancel_at_period_end, interval from stub_subscription where ref = ${ref}`;
		if (!s) return null;
		if (s.status !== 'active')
			return {
				status: s.status as SubscriptionStatus,
				periodEnd: s.period_end?.toISOString() ?? null,
				cancelAtPeriodEnd: false
			};
		let end = s.period_end!;
		if (end.getTime() <= Date.now()) {
			if (s.cancel_at_period_end)
				return { status: 'cancelled', periodEnd: end.toISOString(), cancelAtPeriodEnd: true };
			// It renews, as a card would.
			while (end.getTime() <= Date.now()) end = new Date(end.getTime() + periodMs(s.interval));
			await db()`update stub_subscription set period_end = ${end} where ref = ${ref}`;
		}
		return {
			status: 'active',
			periodEnd: end.toISOString(),
			cancelAtPeriodEnd: s.cancel_at_period_end
		};
	},
	async cancel(ref) {
		await db()`update stub_subscription set cancel_at_period_end = true where ref = ${ref} and status = 'active'`;
		await db()`update stub_subscription set status = 'cancelled' where ref = ${ref} and status <> 'active'`;
	}
};

/** The stub's own pages: pay, or walk away. */
export async function stubComplete(ref: string): Promise<void> {
	const [s] = await db()<
		{ interval: Interval }[]
	>`select interval from stub_subscription where ref = ${ref}`;
	if (!s) return;
	await db()`update stub_subscription set status = 'active', period_end = ${new Date(Date.now() + periodMs(s.interval))}
		where ref = ${ref} and status = 'incomplete'`;
}
export async function stubAbandon(ref: string): Promise<void> {
	await db()`update stub_subscription set status = 'cancelled' where ref = ${ref} and status = 'incomplete'`;
}

/** The configured provider, or null where billing is off. */
export function provider(): BillingProvider | null {
	return stubAvailable({ provider: BILLING_PROVIDER, stub: BILLING_STUB, vercelEnv: VERCEL_ENV })
		? stubProvider
		: null;
}

export type Started = { ok: true; url: string } | { ok: false; reason: string };

/** An admin chooses a tier and an interval: make the customer once, a subscription and a checkout,
 * and send them to the provider's page. A card is only ever entered there. */
export async function startCheckout(
	tenantId: string,
	userId: string,
	tierId: string,
	interval: Interval
): Promise<Started> {
	const p = provider();
	if (!p) return { ok: false, reason: 'Billing is not set up on this service.' };
	const [price] = await db()<{ id: string; tier_enabled: boolean }[]>`
		select bp.id, t.enabled as tier_enabled from billing_price bp join tier t on t.id = bp.tier_id
		where bp.tier_id = ${tierId} and bp.interval = ${interval} and bp.provider = ${p.name} and bp.active`;
	if (!price || !price.tier_enabled) return { ok: false, reason: 'That plan is not on sale.' };
	const [tenant] = await db()<
		{ id: string; name: string; status: string }[]
	>`select id, name, status from tenant where id = ${tenantId}`;
	if (!tenant || tenant.status === 'deleted') return { ok: false, reason: 'No such tenant.' };
	await p.ensureCustomer({ id: tenantId, name: tenant.name });
	const [sub] = await db()<{ id: string }[]>`
		insert into subscription (tenant_id, tier_id, price_id, provider) values (${tenantId}, ${tierId}, ${price.id}, ${p.name}) returning id`;
	const [co] = await db()<{ id: string }[]>`
		insert into checkout (tenant_id, subscription_id, created_by) values (${tenantId}, ${sub.id}, ${userId}) returning id`;
	const started = await p.start({
		subscriptionId: String(sub.id),
		checkoutId: String(co.id),
		interval
	});
	await db()`update subscription set provider_ref = ${started.ref} where id = ${sub.id}`;
	await db()`insert into audit_log (tenant_id, actor_user_id, action, target, data_json)
		values (${tenantId}, ${userId}, 'billing.checkout', ${`tier:${tierId}`}, ${db().json({ interval, provider: p.name })})`;
	return { ok: true, url: started.url };
}

export interface SubscriptionRow {
	id: string;
	tierId: string;
	tierName: string;
	status: SubscriptionStatus;
	currentPeriodEnd: string | null;
	cancelAtPeriodEnd: boolean;
	interval: Interval | null;
	amountMinor: number | null;
	currency: string | null;
}

export async function subscriptionsOf(tenantId: string): Promise<SubscriptionRow[]> {
	const rows = await db()<
		{
			id: string;
			tier_id: string;
			name: string;
			status: SubscriptionStatus;
			current_period_end: Date | null;
			cancel_at_period_end: boolean;
			interval: Interval | null;
			amount_minor: number | null;
			currency: string | null;
		}[]
	>`select s.id, s.tier_id, t.name, s.status, s.current_period_end, s.cancel_at_period_end, p.interval, p.amount_minor, p.currency
		from subscription s join tier t on t.id = s.tier_id left join billing_price p on p.id = s.price_id
		where s.tenant_id = ${tenantId} and s.status <> 'incomplete' order by s.created_at desc`;
	return rows.map((r) => ({
		id: String(r.id),
		tierId: String(r.tier_id),
		tierName: r.name,
		status: r.status,
		currentPeriodEnd: r.current_period_end?.toISOString() ?? null,
		cancelAtPeriodEnd: r.cancel_at_period_end,
		interval: r.interval,
		amountMinor: r.amount_minor,
		currency: r.currency
	}));
}

/** The one way provider state comes in (§7.3): a return from the provider's page, a provider
 * webhook, and the daily cron each call it. It copies the provider's state onto our subscriptions
 * and moves the tenant to the tier of its best entitled one, else the default tier. */
export async function reconcile(tenantId: string): Promise<{ tierId: string; changed: boolean }> {
	const p = provider();
	const subs = await db()<
		{ id: string; tier_id: string; provider_ref: string | null; status: SubscriptionStatus }[]
	>`
		select id, tier_id, provider_ref, status from subscription
		where tenant_id = ${tenantId} and status <> 'cancelled' or (tenant_id = ${tenantId} and current_period_end > now())`;
	for (const s of subs) {
		if (!p || !s.provider_ref) continue;
		const state = await p.fetch(s.provider_ref);
		if (!state) continue;
		await db()`update subscription set status = ${state.status}, current_period_end = ${state.periodEnd},
			cancel_at_period_end = ${state.cancelAtPeriodEnd} where id = ${s.id}`;
	}
	const data = await loadPlanData(db());
	const all = await db()<
		{ tier_id: string; status: SubscriptionStatus; current_period_end: Date | null }[]
	>`
		select tier_id, status, current_period_end from subscription where tenant_id = ${tenantId}`;
	const tierId = tierFromSubscriptions(
		all.map((s) => ({
			tierId: String(s.tier_id),
			status: s.status,
			currentPeriodEnd: s.current_period_end?.toISOString() ?? null
		})),
		data.tiers,
		data.defaultTierId ?? data.tiers[0]?.id ?? ''
	);
	const [before] = await db()<
		{ tier_id: string | null }[]
	>`select tier_id from tenant where id = ${tenantId}`;
	const changed = String(before?.tier_id ?? '') !== tierId;
	if (changed) {
		await db()`update tenant set tier_id = ${tierId} where id = ${tenantId}`;
		await db()`insert into audit_log (tenant_id, actor_user_id, action, target, data_json)
			values (${tenantId}, null, 'billing.tier', ${`tenant:${tenantId}`}, ${db().json({ before: before?.tier_id ?? null, after: tierId })})`;
		forgetAiCache(tenantId);
		await applyProjectLimit(db(), tenantId);
	}
	return { tierId, changed };
}

/** Coming back from the provider's page: reconcile, record how the checkout ended, and end any
 * older subscription the new one replaces. */
export async function finishCheckout(
	tenantId: string,
	checkoutId: string
): Promise<'complete' | 'abandoned' | 'open' | null> {
	const [co] = await db()<{ id: string; subscription_id: string }[]>`
		select id, subscription_id from checkout where id = ${checkoutId} and tenant_id = ${tenantId}`;
	if (!co) return null;
	await reconcile(tenantId);
	const [sub] = await db()<
		{ status: SubscriptionStatus }[]
	>`select status from subscription where id = ${co.subscription_id}`;
	const result =
		sub.status === 'active' ? 'complete' : sub.status === 'cancelled' ? 'abandoned' : 'open';
	await db()`update checkout set status = ${result} where id = ${co.id} and status = 'open' and ${result} <> 'open'`;
	if (result === 'complete') {
		const p = provider();
		const older = await db()<{ id: string; provider_ref: string | null }[]>`
			select id, provider_ref from subscription
			where tenant_id = ${tenantId} and id <> ${co.subscription_id} and status = 'active' and not cancel_at_period_end`;
		for (const o of older) if (p && o.provider_ref) await p.cancel(o.provider_ref);
		if (older.length) await reconcile(tenantId);
	}
	return result;
}

/** Ends the tenant's subscription at the period's end, keeping its tier until then. */
export async function cancelSubscription(tenantId: string, userId: string): Promise<boolean> {
	const p = provider();
	if (!p) return false;
	const active = await db()<{ id: string; provider_ref: string | null }[]>`
		select id, provider_ref from subscription where tenant_id = ${tenantId} and status = 'active' and not cancel_at_period_end`;
	if (!active.length) return false;
	for (const s of active) if (s.provider_ref) await p.cancel(s.provider_ref);
	await reconcile(tenantId);
	await db()`insert into audit_log (tenant_id, actor_user_id, action, target) values (${tenantId}, ${userId}, 'billing.cancelled', ${`tenant:${tenantId}`})`;
	return true;
}

/** The cron's pass: every tenant with a subscription is reconciled. */
export async function reconcileAll(): Promise<number> {
	const ids = await db()<{ tenant_id: string }[]>`select distinct tenant_id from subscription`;
	for (const t of ids)
		await reconcile(String(t.tenant_id)).catch((e) => console.error('reconcile', t.tenant_id, e));
	return ids.length;
}
