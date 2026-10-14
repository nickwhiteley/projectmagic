import { loadProjectState } from '#lib/server/project-state.ts';
import { inline } from '#lib/server/views.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const s = await loadProjectState(locals.project!.id);
	return {
		repoUrl: `https://github.com/${s.owner}/${s.repo}`,
		done: s.done.map((d) => ({
			id: d.id,
			titleHtml: inline(s, d.title),
			at: d.at,
			commit: d.commit,
			pr: d.pr,
			unpruned: d.unpruned
		}))
	};
};
