// GitHub sends the browser back here with a code: check the state, exchange the code, find the
// user (or create the bootstrap administrator), and start a session.
import { SESSION_SECRET } from '$app/env/private';
import { currentUser, exchangeCode } from '#lib/server/github-app.ts';
import { setSession } from '#lib/server/session.ts';
import { signIn } from '#lib/server/users.ts';
import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const saved = cookies.get('pm_oauth');
	cookies.delete('pm_oauth', { path: '/auth/github' });
	const { state, next } = saved
		? (JSON.parse(saved) as { state: string; next: string })
		: { state: null, next: '/' };
	const code = url.searchParams.get('code');
	if (!code || !state || url.searchParams.get('state') !== state)
		error(400, 'The sign-in link expired or was not started here. Try again.');

	const tokens = await exchangeCode(code, `${url.origin}/auth/github/callback`);
	const result = await signIn(await currentUser(tokens.accessToken), tokens);
	if (!result.ok) redirect(303, `/signin?error=${result.reason}`);
	setSession(cookies, result.user.id, SESSION_SECRET);
	redirect(303, next);
};
