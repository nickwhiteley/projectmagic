import { visibleProjects } from '#lib/core/access.ts';
import { allProjects } from '#lib/server/projects.ts';
import { revalidate } from '#lib/server/sync-runner.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const projects = visibleProjects(locals.user, await allProjects(), locals.memberships);
	await revalidate(projects.map((p) => p.id));
	return {
		user: { login: locals.user!.githubLogin, name: locals.user!.name },
		projects: projects.map((p) => ({
			owner: p.owner,
			repo: p.repo,
			lastSyncAt: p.lastSyncAt,
			lastError: p.lastError
		}))
	};
};
