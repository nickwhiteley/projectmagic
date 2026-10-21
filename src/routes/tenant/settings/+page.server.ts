import { nameProblem } from '#lib/core/tenants.ts';
import { slackWebhookProblem } from '#lib/core/evidence.ts';
import { saveTenantSettings, tenantSettings } from '#lib/server/tenants.ts';
import { sendDigestNow, setSlackWebhook, slackDigest } from '#lib/server/digest.ts';
import { forgetAiCache } from '#lib/server/plans.ts';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => ({
	name: locals.tenant!.name,
	slug: locals.tenant!.slug,
	settings: await tenantSettings(locals.tenant!.id),
	slack: await slackDigest(locals.tenant!.id)
});

export const actions: Actions = {
	save: async ({ locals, request }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '');
		const problem = nameProblem(name);
		if (problem) return fail(400, { reason: problem });
		await saveTenantSettings(locals.tenant!.id, locals.user!.id, name, {
			aiEnabled: form.get('ai') === 'on',
			batchEditsDefault: form.get('batch') === 'on'
		});
		forgetAiCache(locals.tenant!.id);
		return { done: 'Saved.' };
	},

	// The daily digest to Slack (PM39): set or remove the incoming webhook.
	slack: async ({ locals, request, url }) => {
		const form = await request.formData();
		if (form.get('remove') === 'yes') {
			await setSlackWebhook(locals.tenant!.id, locals.user!.id, null, url.origin);
			return { slackDone: 'The digest is off.' };
		}
		const webhook = String(form.get('webhook') ?? '').trim();
		const problem = slackWebhookProblem(webhook);
		if (problem) return fail(400, { slackReason: `The webhook ${problem}.` });
		await setSlackWebhook(locals.tenant!.id, locals.user!.id, webhook, url.origin);
		return { slackDone: 'Saved. The digest goes out each morning when something waits.' };
	},

	digest: async ({ locals, url }) => {
		try {
			const sent = await sendDigestNow(locals.tenant!.id, url.origin);
			return { slackDone: sent ? 'Sent.' : 'Nothing waits on anyone, so nothing was sent.' };
		} catch (e) {
			return fail(502, { slackReason: e instanceof Error ? e.message : String(e) });
		}
	}
};
