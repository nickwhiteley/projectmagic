// Every request: who is signed in (re-read, so disabling takes effect at once), and whether the
// route allows them (spec §11.2). The rule for each route is in #lib/server/routes.
import { SESSION_SECRET } from '$app/env/private';
import { can } from '#lib/core/access.ts';
import { projectByRepo } from '#lib/server/projects.ts';
import { ROUTES } from '#lib/server/routes.ts';
import { clearSession, readSession, SESSION_COOKIE } from '#lib/server/session.ts';
import { membershipsOf, userById } from '#lib/server/users.ts';
import { error, redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';

export const handle: Handle = async ({ event, resolve }) => {
	const userId = readSession(event.cookies.get(SESSION_COOKIE), SESSION_SECRET);
	let user = userId ? await userById(userId) : null;
	if (user?.disabledAt || (userId && !user)) {
		clearSession(event.cookies);
		user = null;
	}
	event.locals.user = user;
	event.locals.memberships = user ? await membershipsOf(user.id) : [];
	event.locals.project = null;

	const id = event.route.id;
	if (id === null) return resolve(event); // no route: SvelteKit's 404
	const access = ROUTES[id];
	if (!access) error(500, `Route ${id} has no access rule`);

	switch (access.kind) {
		case 'public':
		case 'machine':
			break;
		case 'signed-in':
			if (!user) redirect(303, `/signin?next=${encodeURIComponent(event.url.pathname)}`);
			break;
		case 'system':
			if (!user) redirect(303, `/signin?next=${encodeURIComponent(event.url.pathname)}`);
			if (!can(user, access.action, null, event.locals.memberships)) error(403, 'Not allowed');
			break;
		case 'project': {
			if (!user) redirect(303, `/signin?next=${encodeURIComponent(event.url.pathname)}`);
			const repo = event.params.repo;
			const project = repo ? await projectByRepo(repo) : null;
			// A project the user can't see doesn't exist for them: 404, not 403.
			if (!project || !can(user, 'view', project, event.locals.memberships))
				error(404, 'Not found');
			if (!can(user, access.action, project, event.locals.memberships)) error(403, 'Not allowed');
			event.locals.project = project;
			break;
		}
	}
	return resolve(event);
};
