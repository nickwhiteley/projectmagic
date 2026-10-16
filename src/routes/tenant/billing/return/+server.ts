// Back from the provider's page: reconcile, and say how the checkout ended.
import { finishCheckout } from '#lib/server/billing.ts';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
	const result = await finishCheckout(locals.tenant!.id, url.searchParams.get('checkout') ?? '');
	redirect(303, `/tenant/billing?result=${result ?? 'unknown'}`);
};
