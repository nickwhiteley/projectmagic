import { acceptInvitation, invitationByToken } from '#lib/server/members.ts';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const i = await invitationByToken(params.token);
	if (!i) return { invitation: null };
	return {
		invitation: { tenantName: i.tenantName, role: i.role, githubLogin: i.githubLogin },
		forYou: i.githubId === locals.user!.githubId,
		me: locals.user!.githubLogin
	};
};

export const actions: Actions = {
	default: async ({ params, locals }) => {
		const i = await invitationByToken(params.token);
		if (!i) return fail(404, { reason: 'That invitation has expired or was withdrawn.' });
		const r = await acceptInvitation(
			{ id: locals.user!.id, githubId: locals.user!.githubId },
			i.id
		);
		if (!r.ok) return fail(400, { reason: r.reason });
		redirect(303, '/');
	}
};
