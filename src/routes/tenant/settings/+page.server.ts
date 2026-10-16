import { nameProblem } from '#lib/core/tenants.ts';
import { saveTenantSettings, tenantSettings } from '#lib/server/tenants.ts';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => ({
	name: locals.tenant!.name,
	slug: locals.tenant!.slug,
	settings: await tenantSettings(locals.tenant!.id)
});

export const actions: Actions = {
	default: async ({ locals, request }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '');
		const problem = nameProblem(name);
		if (problem) return fail(400, { reason: problem });
		await saveTenantSettings(locals.tenant!.id, locals.user!.id, name, {
			aiEnabled: form.get('ai') === 'on',
			batchEditsDefault: form.get('batch') === 'on'
		});
		return { done: 'Saved.' };
	}
};
