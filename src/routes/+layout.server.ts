import { visibleProjects } from '#lib/core/access.ts';
import { allProjects } from '#lib/server/projects.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) return { user: null, projects: [] };
	const projects = visibleProjects(locals.user, await allProjects(), locals.memberships);
	return {
		user: {
			login: locals.user.githubLogin,
			name: locals.user.name,
			admin: locals.user.systemRole === 'admin'
		},
		projects: projects.map((p) => ({
			repo: p.repo,
			name: p.name,
			hidden: p.hidden,
			failed: !!p.lastError
		}))
	};
};
