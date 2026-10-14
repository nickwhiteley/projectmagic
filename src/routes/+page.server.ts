import { visibleProjects } from '#lib/core/access.ts';
import { loadProjectState } from '#lib/server/project-state.ts';
import { allProjects } from '#lib/server/projects.ts';
import { summarise } from '#lib/server/summary.ts';
import { revalidate } from '#lib/server/sync-runner.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) return { landing: true as const };
	const projects = visibleProjects(locals.user, await allProjects(), locals.memberships);
	await revalidate(projects.map((p) => p.id));
	const states = await Promise.all(projects.map((p) => loadProjectState(p.id)));
	// Projects with a backlog first; the rest are repositories the App can see but that aren't tracked yet.
	const cards = states
		.map((s) => summarise(s))
		.sort((a, b) => Number(b.hasBacklog) - Number(a.hasBacklog));
	return { landing: false as const, cards, now: Date.now() };
};
