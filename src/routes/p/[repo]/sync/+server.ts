// The refresh button (spec §7.4): sync now and come back to the page.
import { syncNow } from '#lib/server/sync-runner.ts';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, request, url }) => {
	await syncNow(locals.project!.id);
	// Back to the page the button was on, when the Referer is a well-formed URL on this site.
	let to = '/';
	try {
		const back = new URL(request.headers.get('referer') ?? '');
		if (back.origin === url.origin) to = back.pathname;
	} catch {
		// No Referer, or not a URL: the overview.
	}
	redirect(303, to);
};
