import { can, visibleProjects } from '#lib/core/access.ts';
import { cardLine, loadDelivery } from '#lib/server/delivery.ts';
import { loadProjectState } from '#lib/server/project-state.ts';
import { projectsFor } from '#lib/server/projects.ts';
import { summarise } from '#lib/server/summary.ts';
import { revalidate } from '#lib/server/sync-runner.ts';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { accessCtx } from '#lib/server/tenants.ts';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) return { landing: true as const };
	// Signed in but in no tenant yet: create one, or wait to be invited.
	if (!locals.tenant) redirect(303, '/welcome');
	const projects = visibleProjects(locals.user, await projectsFor(locals), accessCtx(locals));
	await revalidate(projects.map((p) => p.id));
	const states = await Promise.all(projects.map((p) => loadProjectState(p.id)));
	const lines = await Promise.all(
		states.map((s, i) => loadDelivery(s, projects[i].id).then(cardLine, () => null))
	);
	// Projects with a backlog first; the rest are repositories the App can see but that aren't tracked yet.
	const cards = states
		.map((s, i) => ({
			...summarise(s),
			// How the project is addressed, which is its bare name unless its tenant has two of them.
			repo: projects[i].param,
			canEdit: can(locals.user, 'edit', accessCtx(locals, projects[i])),
			delivery: lines[i]
		}))
		.sort((a, b) => Number(b.hasBacklog) - Number(a.hasBacklog));
	return { landing: false as const, cards, now: Date.now() };
};
