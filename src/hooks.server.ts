// Every request: who is signed in (re-read, so disabling takes effect at once), which tenant they
// are working in, and whether the route allows them (specs/tenants.md §5, §6.4). The rule for
// each route is in #lib/server/routes.
import { SESSION_SECRET } from '$app/env/private';
import { can } from '#lib/core/access.ts';
import { projectByRepo, tenantsWithRepo } from '#lib/server/projects.ts';
import { ROUTES } from '#lib/server/routes.ts';
import { clearSession, readSession, SESSION_COOKIE } from '#lib/server/session.ts';
import {
	claimGithubRefresh,
	githubRolesDue,
	refreshGithubRoles
} from '#lib/server/github-roles.ts';
import { db } from '#lib/server/db.ts';
import {
	accessCtx,
	currentTenant,
	supportTenant,
	switchTenant,
	tenantsOf
} from '#lib/server/tenants.ts';
import { userClient } from '#lib/server/user-token.ts';
import { waitUntil } from '@vercel/functions';
import { sessionUser } from '#lib/server/users.ts';
import { error, redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;
	event.locals.memberships = [];
	event.locals.tenant = null;
	event.locals.tenants = [];
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
			event.locals.tenants = await tenantsOf(found.user.id);
			event.locals.tenant = currentTenant(event.locals.tenants);
			// A platform admin in a support session sees that tenant, read-only (specs/tenants.md §6.3).
			if (found.user.platformRole === 'admin')
				event.locals.tenant = (await supportTenant(found.user.id)) ?? event.locals.tenant;
			const t = event.locals.tenant;
			if (t && !t.support) {
				// Their GitHub permissions decide their roles, refreshed in the background when due (§6.1),
				// and a note of when they were last here, at most every ten minutes.
				const uid = found.user.id;
				if (t.access === 'github' && t.status === 'active' && githubRolesDue(t.githubSyncedAt))
					waitUntil(
						claimGithubRefresh(uid, t.id)
							.then(async (go) => {
								if (go) await refreshGithubRoles(userClient(uid), uid, t.id);
							})
							.catch((e) => console.error('github roles:', e instanceof Error ? e.message : e))
					);
				waitUntil(
					Promise.resolve(
						db()`update tenant_member set last_seen_at = now() where tenant_id = ${t.id} and user_id = ${uid}
							and (last_seen_at is null or last_seen_at < now() - interval '10 minutes')`
					).catch(() => {})
				);
			}
		} else if (userId) clearSession(event.cookies);
	}
	const user = event.locals.user;
	if (!access) return resolve(event); // no route: SvelteKit's 404

	const signIn = () => redirect(303, `/signin?next=${encodeURIComponent(event.url.pathname)}`);
	const ctx = () => accessCtx(event.locals);
	switch (access.kind) {
		case 'public':
		case 'machine':
			break;
		case 'signed-in':
			if (!user) signIn();
			break;
		case 'platform':
			if (!user) signIn();
			if (!can(user, access.action, ctx())) error(403, 'Not allowed');
			break;
		case 'tenant':
			if (!user) signIn();
			if (!can(user, access.action, ctx())) error(403, 'Not allowed');
			break;
		case 'project': {
			if (!user) signIn();
			const repo = event.params.repo;
			const tenant = event.locals.tenant;
			const project = repo && tenant ? await projectByRepo(tenant.id, repo) : null;
			// A link from another of your tenants (`/p/web` when this tenant has no `web`) switches to
			// the one tenant of yours that has it. If several do, it is a 404 until the switcher asks.
			if (!project && repo && event.request.method === 'GET') {
				const others = event.locals.tenants.filter((t) => t.id !== tenant?.id);
				const hits = await tenantsWithRepo(
					others.map((t) => t.id),
					repo
				);
				if (hits.length === 1 && (await switchTenant(user!.id, hits[0])))
					redirect(303, event.url.pathname + event.url.search);
			}
			// A project the user can't see, or that is another tenant's, doesn't exist for them:
			// 404, not 403.
			if (!project || !can(user, 'view', accessCtx(event.locals, project))) error(404, 'Not found');
			if (!can(user, access.action, accessCtx(event.locals, project))) error(403, 'Not allowed');
			event.locals.project = project;
			break;
		}
	}
	return resolve(event);
};
