import { listUsers, setUserDisabled } from '#lib/server/users.ts';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const q = url.searchParams.get('q') ?? '';
	return { q, me: locals.user!.id, users: await listUsers(q) };
};

export const actions: Actions = {
	default: async ({ locals, request }) => {
		const f = await request.formData();
		const id = String(f.get('user'));
		if (id === locals.user!.id) return fail(400, { reason: 'You cannot disable yourself.' });
		const r = await setUserDisabled(id, locals.user!.id, f.get('disable') === '1');
		return r.ok ? { done: 'Saved.' } : fail(400, { reason: r.reason });
	}
};
