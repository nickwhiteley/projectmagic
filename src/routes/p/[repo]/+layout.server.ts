import { can } from '#lib/core/access.ts';
import { db } from '#lib/server/db.ts';
import { loadProjectState } from '#lib/server/project-state.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	const project = locals.project!;
	const s = await loadProjectState(project.id);
	const h = s.health;
	const [e] = await db()<
		{ edit_state: string | null; edit_detail: string | null; edit_pr: number | null }[]
	>`
		select edit_state, edit_detail, edit_pr from project where id = ${project.id}`;
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
			edits: e?.edit_state ? { state: e.edit_state, detail: e.edit_detail, pr: e.edit_pr } : null,
			counts: {
				items: s.items.length,
				done: s.done.length,
				branches: s.branches.filter((b) => b.active).length
			}
		}
	};
};
