import { loadProjectState } from '#lib/server/project-state.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	const s = await loadProjectState(locals.project!.id);
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
			counts: {
				items: s.items.length,
				done: s.done.length,
				branches: s.branches.filter((b) => b.active).length
			}
		}
	};
};
