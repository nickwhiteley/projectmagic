// Every request: who is signed in (re-read, so disabling takes effect at once), and whether the
// route allows them (spec §11.2). The rule for each route is in #lib/server/routes.
import { SESSION_SECRET } from '$app/env/private';
import { can } from '#lib/core/access.ts';
import { projectByRepo } from '#lib/server/projects.ts';
import { ROUTES } from '#lib/server/routes.ts';
import { clearSession, readSession, SESSION_COOKIE } from '#lib/server/session.ts';
import { sessionUser } from '#lib/server/users.ts';
import { error, redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;
	event.locals.memberships = [];
	event.locals.project = null;
	event.locals.states = new Map();

	const id = event.route.id;
	const access = id === null ? null : ROUTES[id];
	if (id !== null && !access) error(500, `Route ${id} has no access rule`);

	// Machine endpoints check their own caller; everything else needs to know who is signed in.
	if (access?.kind !== 'machine') {
		const userId = readSession(event.cookies.get(SESSION_COOKIE), SESSION_SECRET);
		const found = userId ? await sessionUser(userId) : null;
		if (found && !found.user.disabledAt) {
			event.locals.user = found.user;
			event.locals.memberships = found.memberships;
		} else if (userId) clearSession(event.cookies);
	}
	const user = event.locals.user;
	if (!access) return resolve(event); // no route: SvelteKit's 404

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
