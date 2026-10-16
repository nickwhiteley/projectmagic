import { removeMember, deleteAccount } from '#lib/server/members.ts';
import { clearSession } from '#lib/server/session.ts';
import { lastAdminProblem } from '#lib/server/users.ts';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => ({
	login: locals.user!.githubLogin,
	tenants: locals.tenants.map((t) => ({ id: t.id, name: t.name, role: t.role, status: t.status }))
});

export const actions: Actions = {
	leave: async ({ locals, request }) => {
		const id = String((await request.formData()).get('tenant'));
		const res = await removeMember(id, locals.user!.id, locals.user!.id);
		return res.ok ? { done: 'You left the tenant.' } : fail(400, { reason: res.reason });
	},
	delete: async ({ locals, request, cookies }) => {
		const typed = String((await request.formData()).get('login') ?? '').trim();
		if (typed.toLowerCase() !== locals.user!.githubLogin.toLowerCase())
			return fail(400, { reason: 'Type your GitHub login exactly to confirm.' });
		const res = await deleteAccount(locals.user!.id, await lastAdminProblem(locals.user!.id));
		if (!res.ok) return fail(400, { reason: res.reason });
		clearSession(cookies);
		redirect(303, '/signin');
	}
};
