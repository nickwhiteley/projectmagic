import { PROJECT_ROLES, type AccessMode, type ProjectRole } from '#lib/core/access.ts';
import { allProjects } from '#lib/server/projects.ts';
import { projectAccess, setAccessMode, setProjectRole } from '#lib/server/project-access.ts';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const t = locals.tenant!;
	const projects = await allProjects(t.id);
	const chosen =
		projects.find((p) => p.param === url.searchParams.get('project')) ?? projects[0] ?? null;
	return {
		access: t.access ?? 'github',
		defaultRole: t.defaultProjectRole ?? 'none',
		projects: projects.map((p) => ({ id: p.id, name: p.name, param: p.param })),
		project: chosen && { id: chosen.id, name: chosen.name, param: chosen.param },
		members: chosen
			? await projectAccess(t.id, chosen.id, t.access ?? 'github', t.defaultProjectRole ?? 'none')
			: []
	};
};

export const actions: Actions = {
	mode: async ({ locals, request }) => {
		const f = await request.formData();
		const access = String(f.get('access')) as AccessMode;
		const def = String(f.get('default') ?? 'none');
		if (!['github', 'managed'].includes(access) || !['none', 'viewer', 'editor'].includes(def))
			return fail(400, { reason: 'Choose how roles are decided.' });
		await setAccessMode(
			locals.tenant!.id,
			locals.user!.id,
			access,
			def as 'none' | 'viewer' | 'editor'
		);
		return { done: 'Saved.' };
	},
	role: async ({ locals, request }) => {
		const f = await request.formData();
		const role = String(f.get('role'));
		if (![...PROJECT_ROLES, 'none', 'inherit'].includes(role))
			return fail(400, { reason: 'Choose a role.' });
		const res = await setProjectRole(
			locals.tenant!.id,
			locals.user!.id,
			String(f.get('project')),
			String(f.get('user')),
			role as ProjectRole | 'none' | 'inherit'
		);
		return res.ok ? { done: 'Saved.' } : fail(400, { reason: res.reason });
	}
};
