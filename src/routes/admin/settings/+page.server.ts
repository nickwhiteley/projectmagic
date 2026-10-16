import { SIGNUP_MODES, parseSignup } from '#lib/core/tenants.ts';
import { getSignup, setSignup } from '#lib/server/platform.ts';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({
	signup: await getSignup(),
	modes: SIGNUP_MODES
});

export const actions: Actions = {
	default: async ({ locals, request }) => {
		const raw = (await request.formData()).get('signup');
		if (!SIGNUP_MODES.includes(raw as never))
			return fail(400, { reason: 'Choose a sign-up mode.' });
		await setSignup(parseSignup(raw), locals.user!.id);
		return { done: 'Saved.' };
	}
};
