// The Operations tab (PM51): Project Magic's own health, for a platform admin. What needs attention
// first, each with a fix; then what is running, the cron, errors, background work, webhooks,
// GitHub's budget, AI and alerts. Metadata only, never a tenant's content.
import { attention } from '#lib/core/ops.ts';
import { safeBack } from '#lib/server/edit-actions.ts';
import { alertSettings, openAlerts } from '#lib/server/alerts.ts';
import { OPS_ACTIONS, runAction, type OpsAction } from '#lib/server/ops-actions.ts';
import {
	aiToday,
	budgets,
	cronRuns,
	deliverySummary,
	errorByRef,
	errorGroups,
	jobSummary,
	now,
	snapshot
} from '#lib/server/ops-view.ts';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

// Running the cron by hand can take minutes.
export const config = { maxDuration: 300 };

export const load: PageServerLoad = async () => {
	const [snap, current, runs, errors, jobs, deliveries, github, ai, open, alerts] =
		await Promise.all([
			snapshot(),
			now(),
			cronRuns(7),
			errorGroups(),
			jobSummary(),
			deliverySummary().catch(() => []),
			budgets(),
			aiToday(),
			openAlerts(),
			alertSettings()
		]);
	return {
		attention: attention(snap),
		now: current,
		runs,
		errors: errors.slice(0, 15),
		jobs,
		deliveries,
		github: github.map((b) => ({
			scope: b.scope,
			resource: b.resource,
			remaining: b.remaining,
			limit: b.limit,
			resetAt: b.reset_at.toISOString(),
			updatedAt: b.updated_at.toISOString()
		})),
		ai,
		open,
		alerts
	};
};

export const actions: Actions = {
	/** A fix from the attention list, from this page or another admin page, which it goes back to. */
	fix: async ({ locals, request }) => {
		const form = await request.formData();
		const action = String(form.get('action') ?? '') as OpsAction;
		if (!OPS_ACTIONS.includes(action)) return fail(400, { message: 'Unknown action.' });
		const params: Record<string, string> = {};
		for (const k of ['project', 'tenant', 'installation', 'fingerprint']) {
			const v = form.get(k);
			if (typeof v === 'string' && v) params[k] = v;
		}
		const r = await runAction(action, params, locals.user!.id);
		const back = safeBack(form.get('back'), '/admin/ops');
		const [path, hash] = back.split('#');
		const u = new URL(path, 'http://x');
		u.searchParams.set(r.ok ? 'done' : 'failed', r.message);
		redirect(303, `${u.pathname}${u.search}${hash ? `#${hash}` : ''}`);
	},
	/** A reference a person quoted, from the error page or Feedback. */
	ref: async ({ request }) => {
		const ref = String((await request.formData()).get('ref') ?? '').trim();
		const fp = ref ? await errorByRef(ref) : null;
		if (!fp) return fail(404, { message: `No error has the reference ${ref || '(none)'}.` });
		redirect(303, `/admin/ops/errors/${encodeURIComponent(fp)}?ref=${encodeURIComponent(ref)}`);
	}
};
