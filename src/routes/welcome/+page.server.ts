import { nameProblem, slugify, slugProblem } from '#lib/core/tenants.ts';
import { getSignup } from '#lib/server/platform.ts';
import { acceptInvitation, invitationsFor } from '#lib/server/members.ts';
import { createTenant } from '#lib/server/tenants.ts';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

/** A platform admin may always create a tenant, and is never made to wait for approval. */
const canCreate = (signup: string, platformAdmin: boolean) => signup !== 'closed' || platformAdmin;

export const load: PageServerLoad = async ({ locals }) => {
	const signup = await getSignup();
	const admin = locals.user!.platformRole === 'admin';
	return {
		signup,
		canCreate: canCreate(signup, admin),
		waits: signup === 'approval' && !admin,
		tenants: locals.tenants.map((t) => ({ name: t.name, status: t.status })),
		invitations: await invitationsFor(locals.user!.githubId)
	};
};

export const actions: Actions = {
	accept: async ({ locals, request }) => {
		const r = await acceptInvitation(
			{ id: locals.user!.id, githubId: locals.user!.githubId },
			String((await request.formData()).get('invitation'))
		);
		if (!r.ok) return fail(400, { accept: r.reason });
		redirect(303, '/');
	},
	create: async ({ locals, request }) => {
		const signup = await getSignup();
		const admin = locals.user!.platformRole === 'admin';
		if (!canCreate(signup, admin))
			return fail(403, { reason: 'New tenants are not being created at the moment.' });
		const form = await request.formData();
		const name = String(form.get('name') ?? '');
		const slug = String(form.get('slug') ?? '').trim() || slugify(name);
		const problem = nameProblem(name) ?? slugProblem(slug);
		if (problem) return fail(400, { reason: problem, name, slug });
		const status = signup === 'approval' && !admin ? 'pending' : 'active';
		const made = await createTenant(locals.user!.id, name, slug, status);
		if (!made.ok) return fail(400, { reason: made.reason, name, slug });
		redirect(303, status === 'active' ? '/tenant/installations' : '/');
	}
};
