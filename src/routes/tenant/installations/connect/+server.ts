// Send the person to GitHub's install page, with a single-use state that brings them back to this tenant.
import { GITHUB_APP_SLUG } from '$app/env/private';
import { newSetupState } from '#lib/server/installations.ts';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals }) => {
	if (!GITHUB_APP_SLUG)
		redirect(
			303,
			`/tenant/installations?error=${encodeURIComponent('GITHUB_APP_SLUG is not set, so the install link cannot be made.')}`
		);
	const state = await newSetupState(locals.user!.id, locals.tenant!.id);
	redirect(
		303,
		`https://github.com/apps/${encodeURIComponent(GITHUB_APP_SLUG)}/installations/new?state=${state}`,
		{
			external: ['https://github.com']
		}
	);
};
