// Start signing in: send the browser to GitHub with a one-time state, kept in a short cookie.
import { authorizeUrl } from '#lib/server/github-app.ts';
import { randomToken } from '#lib/server/crypto.ts';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url, cookies }) => {
	const state = randomToken();
	const next = url.searchParams.get('next');
	cookies.set(
		'pm_oauth',
		JSON.stringify({ state, next: next && /^\/(?![/\\])/.test(next) ? next : '/' }),
		{
			path: '/auth/github',
			httpOnly: true,
			sameSite: 'lax',
			secure: true,
			maxAge: 600
		}
	);
	redirect(302, authorizeUrl(`${url.origin}/auth/github/callback`, state), {
		external: ['https://github.com']
	});
};
