// The stub provider's page, standing in for a payment provider's: it takes no money (§7.3).
import { db } from '#lib/server/db.ts';
import { provider, stubAbandon, stubComplete } from '#lib/server/billing.ts';
import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

async function mine(checkoutId: string, locals: App.Locals) {
	if (!provider() || !/^\d+$/.test(checkoutId)) error(404, 'Not found');
	const [c] = await db()<
		{
			tenant_id: string;
			status: string;
			ref: string | null;
			tier: string;
			interval: string | null;
			amount_minor: number | null;
			currency: string | null;
			tenant: string;
		}[]
	>`
		select c.tenant_id, c.status, s.provider_ref as ref, t.name as tier, p.interval, p.amount_minor, p.currency, tn.name as tenant
		from checkout c join subscription s on s.id = c.subscription_id join tier t on t.id = s.tier_id
		join tenant tn on tn.id = c.tenant_id left join billing_price p on p.id = s.price_id
		where c.id = ${checkoutId}`;
	// Only an admin of the tenant that started it may see it; to anyone else it doesn't exist.
	const admin = locals.tenants.some((t) => t.id === String(c?.tenant_id) && t.role === 'admin');
	if (!c || !admin) error(404, 'Not found');
	return c;
}

export const load: PageServerLoad = async ({ params, locals }) => {
	const c = await mine(params.checkout, locals);
	return {
		tenant: c.tenant,
		tier: c.tier,
		interval: c.interval,
		amountMinor: c.amount_minor,
		currency: c.currency,
		open: c.status === 'open'
	};
};

export const actions: Actions = {
	complete: async ({ params, locals }) => {
		const c = await mine(params.checkout, locals);
		if (c.ref) await stubComplete(c.ref);
		redirect(303, `/tenant/billing/return?checkout=${params.checkout}`);
	},
	abandon: async ({ params, locals }) => {
		const c = await mine(params.checkout, locals);
		if (c.ref) await stubAbandon(c.ref);
		redirect(303, `/tenant/billing/return?checkout=${params.checkout}`);
	}
};
