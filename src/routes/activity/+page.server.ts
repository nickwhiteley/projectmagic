import { visibleProjects } from '#lib/core/access.ts';
import { activity } from '#lib/core/activity.ts';
import { loadProjectState } from '#lib/server/project-state.ts';
import { allProjects } from '#lib/server/projects.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const projects = visibleProjects(locals.user, await allProjects(), locals.memberships);
	const states = await Promise.all(projects.map((p) => loadProjectState(p.id)));
	return {
		groups: activity(states.filter((s) => s.hasBacklog)),
		now: Date.now()
	};
};
