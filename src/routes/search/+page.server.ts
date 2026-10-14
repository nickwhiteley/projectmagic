import { visibleProjects } from '#lib/core/access.ts';
import { search } from '#lib/core/search.ts';
import { loadProjectState } from '#lib/server/project-state.ts';
import { allProjects } from '#lib/server/projects.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const q = url.searchParams.get('q') ?? '';
	if (!q.trim()) return { q, hits: [] };
	const projects = visibleProjects(locals.user, await allProjects(), locals.memberships);
	const states = await Promise.all(projects.map((p) => loadProjectState(p.id)));
	const items = states.flatMap((s) =>
		s.items.map((i) => ({
			repo: s.repo,
			project: s.name,
			id: i.id,
			title: i.titleText,
			body: i.body,
			status: i.status
		}))
	);
	return { q, hits: search(items, q) };
};
