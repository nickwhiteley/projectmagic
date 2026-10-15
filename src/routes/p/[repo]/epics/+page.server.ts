import { projectState } from '#lib/server/project-state.ts';
import { inline } from '#lib/server/views.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const s = await projectState({ locals, params });
	const byId = new Map(s.items.map((i) => [i.id, i]));
	const shipped = new Map(s.done.map((d) => [d.id, d]));
	return {
		epics: s.epics.map((e) => ({
			id: e.id,
			title: e.title,
			declared: e.declared,
			hasItem: byId.has(e.id),
			counts: e.counts,
			total: e.total,
			items: e.items.flatMap((id) => {
				const i = byId.get(id);
				return i ? [{ id, titleHtml: inline(s, i.title), status: i.status }] : [];
			}),
			shipped: e.shipped.flatMap((id) => {
				const d = shipped.get(id);
				return d ? [{ id, title: d.title }] : [];
			})
		}))
	};
};
