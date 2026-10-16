import { asApp } from '#lib/server/github-app.ts';
import { moveTenant } from '#lib/server/platform.ts';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => ({ slug: locals.tenant!.slug });

export const actions: Actions = {
	default: async ({ locals, request }) => {
		const t = locals.tenant!;
		const typed = String((await request.formData()).get('slug') ?? '').trim();
		if (typed !== t.slug)
			return fail(400, { reason: 'Type the tenant’s address exactly to confirm.' });
		const r = await moveTenant(t.id, 'delete', locals.user!.id);
		if (!r.ok) return fail(400, { reason: r.reason });
		// The App is uninstalled from the accounts it was connected to; if GitHub refuses, an admin can do it there.
		for (const id of r.detached)
			await asApp()
				.send('DELETE', `/app/installations/${id}`)
				.catch(() => null);
		redirect(303, '/welcome');
	}
};
