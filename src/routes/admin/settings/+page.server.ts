import { SIGNUP_MODES, parseSignup } from '#lib/core/tenants.ts';
import { getSignup, setSignup } from '#lib/server/platform.ts';
import { setDefaultTier, tiersView } from '#lib/server/tiers.ts';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const v = await tiersView();
	return {
		signup: await getSignup(),
		modes: SIGNUP_MODES,
		tiers: v.tiers.filter((t) => t.enabled).map((t) => ({ id: t.id, name: t.name })),
		defaultTierId: v.defaultTierId
	};
};

export const actions: Actions = {
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
