import { projectState } from '#lib/server/project-state.ts';
import { inline } from '#lib/server/views.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const s = await projectState({ locals, params });
	return {
		repoUrl: `https://github.com/${s.owner}/${s.repo}`,
		done: s.done.map((d) => ({
			id: d.id,
			titleHtml: inline(s, d.title),
			at: d.at,
			commit: d.commit,
			pr: d.pr,
			unpruned: d.unpruned
		})),
		deleted: s.deleted.map((d) => ({
			id: d.id,
			titleHtml: inline(s, d.title),
			at: d.at,
			by: d.by
		}))
	};
};
