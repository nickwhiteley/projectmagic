import { asApp } from '#lib/server/github-app.ts';
import { auditLog, moveTenant, tenantSummary, type TenantAction } from '#lib/server/platform.ts';
import { startSupport } from '#lib/server/support.ts';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const tenant = await tenantSummary(params.id);
	if (!tenant) error(404, 'Not found');
	return { tenant, audit: await auditLog(tenant.id, 20) };
};

const ACTIONS: TenantAction[] = ['approve', 'suspend', 'restore', 'delete', 'undelete'];

export const actions: Actions = {
	/** A read-only, one-hour look at the tenant, for a stated reason the tenant's admins can read (§6.3). */
	support: async ({ locals, params, request }) => {
		const r = await startSupport(
			locals.user!.id,
			params.id,
			String((await request.formData()).get('reason') ?? '')
		);
		if (!r.ok) return fail(400, { reason: r.reason });
		redirect(303, '/');
	},
	move: async ({ locals, params, request }) => {
		const form = await request.formData();
		const action = String(form.get('action')) as TenantAction;
		if (!ACTIONS.includes(action)) return fail(400, { reason: 'Unknown action.' });
		const tenant = await tenantSummary(params.id);
		if (!tenant) error(404, 'Not found');
		if (action === 'delete' && String(form.get('slug') ?? '').trim() !== tenant.slug)
			return fail(400, { reason: 'Type the tenant’s address to confirm deleting it.' });
		const r = await moveTenant(
			tenant.id,
			action,
			locals.user!.id,
			String(form.get('reason') ?? '')
		);
		if (!r.ok) return fail(400, { reason: r.reason });
		for (const id of r.detached)
			await asApp()
				.send('DELETE', `/app/installations/${id}`)
				.catch(() => null);
		return { done: `Done: ${action}.` };
	}
};
