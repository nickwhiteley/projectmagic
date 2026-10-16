// The header's tenant switcher (specs/tenants.md §3.1): remember the tenant, go back to where you were.
import { switchTenant } from '#lib/server/tenants.ts';
import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const form = await request.formData();
	const id = String(form.get('tenant') ?? '');
	if (!/^\d+$/.test(id) || !(await switchTenant(locals.user!.id, id))) error(404, 'Not found');
	// Back to the overview: the page we were on probably isn't in the other tenant.
	redirect(303, '/');
};
