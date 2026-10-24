import { asApp } from '#lib/server/github-app.ts';
import { auditLog, moveTenant, tenantSummary, type TenantAction } from '#lib/server/platform.ts';
import { QUOTAS, QUOTA_LABEL } from '#lib/core/plans.ts';
import { planReport } from '#lib/server/plans.ts';
import {
	setFlagOverride,
	setQuotaOverride,
	setTierOverride,
	tenantOverrides,
	tiersView
} from '#lib/server/tiers.ts';
import { startSupport } from '#lib/server/support.ts';
import { attention } from '#lib/core/ops.ts';
import { snapshot } from '#lib/server/ops-view.ts';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const tenant = await tenantSummary(params.id);
	if (!tenant) error(404, 'Not found');
	const [report, overrides, view] = await Promise.all([
		planReport(tenant.id),
		tenantOverrides(tenant.id),
		tiersView()
	]);
	return {
		tenant,
		// This tenant's part of the Operations tab (PM51).
		attention: attention(await snapshot(tenant.id)),
		audit: await auditLog(tenant.id, 20),
		plan: {
			tier: report.plan.tier?.name ?? null,
			limits: QUOTAS.map((q) => ({
				key: q,
				label: QUOTA_LABEL[q],
				limit: report.plan.limits[q],
				used:
					q === 'members'
						? report.usage.members
						: q === 'projects'
							? report.usage.projects
							: report.usage.aiTokensToday
			})),
			flags: Object.entries(report.plan.flags).map(([key, on]) => ({ key, on }))
		},
		overrides,
		tiers: view.tiers.map((t) => ({ id: t.id, name: t.name })),
		flagKeys: view.flags.map((f) => ({ key: f.key, label: f.label }))
	};
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
	},
	tier: async ({ locals, params, request }) => {
		const t = String((await request.formData()).get('tier') ?? '');
		return done(await setTierOverride(locals.user!.id, params.id, t === '' ? null : t));
	},
	quota: async ({ locals, params, request }) => {
		const f = await request.formData();
		return done(
			await setQuotaOverride(
				locals.user!.id,
				params.id,
				String(f.get('quota')),
				String(f.get('value') ?? ''),
				String(f.get('reason') ?? ''),
				String(f.get('expires') ?? '')
			)
		);
	},
	flag: async ({ locals, params, request }) => {
		const f = await request.formData();
		const state = ['on', 'off', 'remove'].includes(String(f.get('state')))
			? (String(f.get('state')) as 'on')
			: 'remove';
		return done(
			await setFlagOverride(
				locals.user!.id,
				params.id,
				String(f.get('flag')),
				state,
				String(f.get('reason') ?? ''),
				String(f.get('expires') ?? '')
			)
		);
	}
};

const done = (r: { ok: true } | { ok: false; reason: string }) =>
	r.ok ? { done: 'Saved.' } : fail(400, { reason: r.reason });
