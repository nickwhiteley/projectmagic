import { SIGNUP_MODES, parseSignup } from '#lib/core/tenants.ts';
import { getSignup, setSignup } from '#lib/server/platform.ts';
import { setDefaultTier, tiersView } from '#lib/server/tiers.ts';
import { alertSettings, setAlertWebhook, testAlert } from '#lib/server/alerts.ts';
import { errorText } from '#lib/core/ops.ts';
import { slackWebhookProblem } from '#lib/core/evidence.ts';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const v = await tiersView();
	return {
		signup: await getSignup(),
		modes: SIGNUP_MODES,
		tiers: v.tiers.filter((t) => t.enabled).map((t) => ({ id: t.id, name: t.name })),
		defaultTierId: v.defaultTierId,
		alerts: await alertSettings()
	};
};

export const actions: Actions = {
	/** Where alerts go (PM55): a Slack incoming webhook, kept encrypted. */
	alerts: async ({ locals, request, url }) => {
		const form = await request.formData();
		if (form.get('remove')) {
			await setAlertWebhook(null, url.origin, locals.user!.id);
			return { alertsDone: 'Alerts are off.' };
		}
		const hook = String(form.get('webhook') ?? '').trim();
		const problem = slackWebhookProblem(hook);
		if (problem) return fail(400, { alertsReason: `The webhook ${problem}.` });
		await setAlertWebhook(hook, url.origin, locals.user!.id);
		try {
			await testAlert();
		} catch (e) {
			return fail(400, {
				alertsReason: `Saved, but Slack refused a test message: ${errorText(e, 300)}`
			});
		}
		return { alertsDone: 'Saved, and a test message was sent.' };
	},
	testAlert: async () => {
		try {
			await testAlert();
			return { alertsDone: 'Sent a test message.' };
		} catch (e) {
			return fail(400, { alertsReason: errorText(e, 300) });
		}
	},
	signup: async ({ locals, request }) => {
		const raw = (await request.formData()).get('signup');
		if (!SIGNUP_MODES.includes(raw as never))
			return fail(400, { reason: 'Choose a sign-up mode.' });
		await setSignup(parseSignup(raw), locals.user!.id);
		return { done: 'Saved.' };
	},
	tier: async ({ locals, request }) => {
		const r = await setDefaultTier(
			locals.user!.id,
			String((await request.formData()).get('tier') ?? '')
		);
		return r.ok ? { done: 'Saved.' } : fail(400, { reason: r.reason });
	}
};
