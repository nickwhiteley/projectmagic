import { projectState } from '#lib/server/project-state.ts';
import { inline } from '#lib/server/views.ts';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const s = await projectState({ locals, params });
	if (!s.plan) error(404, 'This project has no plan');
	const task = (t: (typeof s.plan.tasks)[number]) => ({
		number: t.number,
		titleHtml: inline(s, t.title),
		status: t.status,
		noteHtml: t.note ? inline(s, t.note) : null,
		items: t.items,
		line: t.line
	});
	const current = s.plan.tasks.filter((t) => !t.superseded);
	return {
		next: s.plan.next,
		groups: s.plan.groups.map((g) => ({
			...g,
			tasks: current.filter((t) => t.group === g.title).map(task)
		})),
		history: s.plan.tasks.filter((t) => t.superseded).map(task),
		disagreements: s.health.disagreements,
		unknown: s.health.unknownTasks
	};
};
