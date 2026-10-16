import { QUOTAS, QUOTA_LABEL } from '#lib/core/plans.ts';
import {
	cancelSubscription,
	provider,
	startCheckout,
	subscriptionsOf,
	type Interval
} from '#lib/server/billing.ts';
import { db } from '#lib/server/db.ts';
import { planReport } from '#lib/server/plans.ts';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const t = locals.tenant!;
	const report = await planReport(t.id);
	const p = provider();
	const tiers = p
		? await db()<
				{
					id: string;
					name: string;
					position: number;
					interval: Interval;
					amount_minor: number;
					currency: string;
				}[]
			>`
			select t.id, t.name, t.position, bp.interval, bp.amount_minor, bp.currency
			from tier t join billing_price bp on bp.tier_id = t.id and bp.provider = ${p.name} and bp.active
			where t.enabled order by t.position, bp.interval`
		: [];
	const sell = new Map<
		string,
		{
			id: string;
			name: string;
			prices: { interval: Interval; amountMinor: number; currency: string }[];
		}
	>();
	for (const r of tiers) {
		const e = sell.get(String(r.id)) ?? { id: String(r.id), name: r.name, prices: [] };
		e.prices.push({ interval: r.interval, amountMinor: r.amount_minor, currency: r.currency });
		sell.set(String(r.id), e);
	}
	return {
		billing: !!p,
		tier: report.plan.tier,
		overridden: report.plan.overridden,
		limits: QUOTAS.map((q) => ({
			quota: q,
			label: QUOTA_LABEL[q],
			limit: report.plan.limits[q],
			used:
				q === 'members'
					? report.usage.members
					: q === 'projects'
						? report.usage.projects
						: report.usage.aiTokensToday,
			level: report.levels[q]
		})),
		ai: report.plan.flags.ai,
		subscriptions: await subscriptionsOf(t.id),
		forSale: [...sell.values()],
		result: url.searchParams.get('result')
	};
};

export const actions: Actions = {
	subscribe: async ({ locals, request }) => {
		const f = await request.formData();
		const interval = String(f.get('interval')) as Interval;
		if (!['month', 'year'].includes(interval))
			return fail(400, { reason: 'Choose monthly or yearly.' });
		const r = await startCheckout(
			locals.tenant!.id,
			locals.user!.id,
			String(f.get('tier')),
			interval
		);
		if (!r.ok) return fail(400, { reason: r.reason });
		redirect(303, r.url);
	},
	cancel: async ({ locals }) => {
		const ok = await cancelSubscription(locals.tenant!.id, locals.user!.id);
		return ok
			? { done: 'Your subscription will end at the close of the period you have paid for.' }
			: fail(400, { reason: 'There is no subscription to cancel.' });
	}
};
