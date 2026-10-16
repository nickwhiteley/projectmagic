import { TENANT_ROLES, type ProjectRole, type TenantRole } from '#lib/core/access.ts';
import { lookupGithubUser } from '#lib/server/github-access.ts';
import {
	createInvitation,
	listMembers,
	removeMember,
	revokeInvitation,
	setJoinByGithub,
	setMemberRole,
	tenantInvitations
} from '#lib/server/members.ts';
import { allProjects } from '#lib/server/projects.ts';
import { userClient } from '#lib/server/user-token.ts';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

const PROJECT_ROLES = ['viewer', 'editor', 'maintainer'];

export const load: PageServerLoad = async ({ locals }) => {
	const t = locals.tenant!;
	return {
		me: locals.user!.id,
		members: await listMembers(t.id),
		invitations: await tenantInvitations(t.id),
		joinByGithub: t.joinByGithub,
		managed: t.access === 'managed',
		projects: (await allProjects(t.id)).map((p) => ({ id: p.id, name: p.name }))
	};
};

const role = (v: FormDataEntryValue | null): TenantRole | null =>
	(TENANT_ROLES as readonly string[]).includes(String(v)) ? (String(v) as TenantRole) : null;

export const actions: Actions = {
	role: async ({ locals, request }) => {
		const f = await request.formData();
		const r = role(f.get('role'));
		if (!r) return fail(400, { reason: 'Choose a role.' });
		const res = await setMemberRole(locals.tenant!.id, locals.user!.id, String(f.get('user')), r);
		return res.ok ? { done: 'Role changed.' } : fail(400, { reason: res.reason });
	},
	remove: async ({ locals, request }) => {
		const res = await removeMember(
			locals.tenant!.id,
			locals.user!.id,
			String((await request.formData()).get('user'))
		);
		return res.ok ? { done: 'Removed.' } : fail(400, { reason: res.reason });
	},
	invite: async ({ locals, request, url }) => {
		const f = await request.formData();
		const login = String(f.get('login') ?? '')
			.trim()
			.replace(/^@/, '');
		const r = role(f.get('role')) ?? 'member';
		const found = await lookupGithubUser(userClient(locals.user!.id), login).catch(() => null);
		if (!found) return fail(400, { reason: `GitHub has no user called ${login || '(nothing)'}.` });
		const projectRoles: Record<string, ProjectRole> = {};
		if (locals.tenant!.access === 'managed')
			for (const [k, v] of f.entries())
				if (k.startsWith('pr_') && PROJECT_ROLES.includes(String(v)))
					projectRoles[k.slice(3)] = String(v) as ProjectRole;
		const res = await createInvitation(locals.tenant!.id, locals.user!.id, found, r, projectRoles);
		if (!res.ok) return fail(400, { reason: res.reason });
		return {
			done: `Invited ${found.login}. They will see it when they next sign in, or you can send them this link:`,
			link: `${url.origin}/invite/${res.token}`
		};
	},
	revoke: async ({ locals, request }) => {
		const ok = await revokeInvitation(
			locals.tenant!.id,
			locals.user!.id,
			String((await request.formData()).get('id'))
		);
		return ok
			? { done: 'Invitation withdrawn.' }
			: fail(404, { reason: 'No such open invitation.' });
	},
	github: async ({ locals, request }) => {
		const on = (await request.formData()).get('on') === 'on';
		await setJoinByGithub(locals.tenant!.id, locals.user!.id, on);
		return {
			done: on
				? 'People with GitHub access to your organisations can now join.'
				: 'Joining by GitHub access is off.'
		};
	}
};
