// End the support session, and go back to your own view.
import { endSupport } from '#lib/server/support.ts';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals }) => {
	await endSupport(locals.user!.id);
	redirect(303, '/admin/tenants');
};
