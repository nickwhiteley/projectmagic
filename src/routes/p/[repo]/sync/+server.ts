// The refresh button (spec §7.4): sync now and come back to the page.
import { syncNow } from '#lib/server/sync-runner.ts';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, request, url }) => {
	await syncNow(locals.project!.id);
	const back = request.headers.get('referer');
	redirect(303, back && new URL(back).origin === url.origin ? new URL(back).pathname : '/');
};
