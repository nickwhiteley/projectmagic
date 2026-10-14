// The Merge button (spec §10.3): a maintainer merges the open edits PR as themselves.
import { edits } from '#lib/server/edits.ts';
import { ReauthRequired } from '#lib/server/user-token.ts';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, params }) => {
	let detail: string;
	try {
		detail = (await edits.mergeEdits(locals.user!, locals.project!)).detail;
	} catch (e) {
		if (!(e instanceof ReauthRequired)) throw e;
		detail = e.message;
	}
	redirect(303, `/p/${params.repo}?merge=${encodeURIComponent(detail)}`);
};
