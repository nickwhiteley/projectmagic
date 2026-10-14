import { projectState } from '#lib/server/project-state.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const s = await projectState({ locals, params });
	const titleOf = new Map(s.items.map((i) => [i.id, i.titleText]));
	return {
		repoUrl: `https://github.com/${s.owner}/${s.repo}`,
		branches: s.branches.map((b) => ({
			...b,
			items: b.items.map((id) => ({ id, title: titleOf.get(id) ?? '' }))
		}))
	};
};
