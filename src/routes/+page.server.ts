import { visibleProjects } from '#lib/core/access.ts';
import { allProjects } from '#lib/server/projects.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const projects = visibleProjects(locals.user, await allProjects(), locals.memberships);
	return {
		user: { login: locals.user!.githubLogin, name: locals.user!.name },
		projects: projects.map((p) => ({ owner: p.owner, repo: p.repo, lastSyncAt: p.lastSyncAt }))
	};
};
