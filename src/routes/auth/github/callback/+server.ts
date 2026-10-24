// GitHub sends the browser back here with a code: check the state, exchange the code, find the
// user (or create them, if sign-up or an invitation allows it), join them to the tenants that admit
// them by GitHub access, read their roles, and start a session.
import { SESSION_SECRET } from '$app/env/private';
import { currentUser, exchangeCode } from '#lib/server/github-app.ts';
import { tokenClient } from '#lib/server/github-client.ts';
import { githubAccessWith } from '#lib/server/github-access.ts';
import { refreshGithubRoles } from '#lib/server/github-roles.ts';
import { admitsStranger, joinByGithub } from '#lib/server/members.ts';
import { getSignup } from '#lib/server/platform.ts';
import { setSession } from '#lib/server/session.ts';
import { tenantsOf } from '#lib/server/tenants.ts';
import { signIn } from '#lib/server/users.ts';
import { failed } from '#lib/server/ops.ts';
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
	const gh = await currentUser(tokens.accessToken);
	const client = tokenClient(async () => tokens.accessToken);
	const access = githubAccessWith(client);
	const result = await signIn(gh, tokens, await getSignup(), () =>
		admitsStranger(String(gh.id), access)
	);
	if (!result.ok) redirect(303, `/signin?error=${result.reason}`);

	// Their GitHub access decides which tenants they join and what they can do in them. A failure
	// here must not stop the sign-in: the next request tries again.
	let full: string[] = [];
	try {
		full = (await joinByGithub(result.user.id, access)).full;
		for (const t of await tenantsOf(result.user.id))
			if (t.access === 'github' && t.status === 'active')
				await refreshGithubRoles(client, result.user.id, t.id);
	} catch (e) {
		await failed('github roles', {}, e, { step: 'sign-in' });
	}
	setSession(cookies, result.user.id, SESSION_SECRET);
	// A tenant at its member limit could not take them: say so.
	if (full.length && !(await tenantsOf(result.user.id)).length)
		redirect(303, `/welcome?full=${encodeURIComponent(full.join(', '))}`);
	redirect(303, next);
};
