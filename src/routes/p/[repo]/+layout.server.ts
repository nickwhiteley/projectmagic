import { can } from '#lib/core/access.ts';
import { projectState } from '#lib/server/project-state.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, params }) => {
	const project = locals.project!;
	const s = await projectState({ locals, params });
	const h = s.health;
	return {
		project: {
			repo: s.repo,
			owner: s.owner,
			name: s.name,
			main: s.main,
			lastSyncAt: s.lastSyncAt,
			lastError: h.lastError,
			hasBacklog: s.hasBacklog,
			hasPlan: !!s.plan,
			canEdit: can(locals.user, 'edit', project, locals.memberships),
			canMerge: can(locals.user, 'merge', project, locals.memberships),
			edits: project.edits,
			counts: {
				items: s.items.length,
				epics: s.epics.length,
				done: s.done.length,
				branches: s.branches.filter((b) => b.active).length
			}
		}
	};
};
