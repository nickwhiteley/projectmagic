import { visibleProjects } from '#lib/core/access.ts';
import { activity } from '#lib/core/activity.ts';
import { loadProjectState } from '#lib/server/project-state.ts';
import { projectsFor } from '#lib/server/projects.ts';
import type { PageServerLoad } from './$types';
import { accessCtx } from '#lib/server/tenants.ts';
import { failedEdits } from '#lib/server/ops-view.ts';

export const load: PageServerLoad = async ({ locals }) => {
	const projects = visibleProjects(locals.user, await projectsFor(locals), accessCtx(locals));
	const states = await Promise.all(projects.map((p) => loadProjectState(p.id)));
	const param = new Map(projects.map((p) => [p.id, p.param]));
	const failed = locals.user
		? await failedEdits(
				locals.user.id,
				projects.map((p) => p.id)
			)
		: [];
	return {
		// Your own edits that didn't reach GitHub (PM54).
		failed: failed.map((f) => ({ ...f, repo: param.get(f.projectId) ?? '' })),
		groups: activity(
			states.map((s, i) => ({ ...s, repo: projects[i].param })).filter((s) => s.hasBacklog)
		),
		now: Date.now()
	};
};
