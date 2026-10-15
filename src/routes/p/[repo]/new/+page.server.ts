import { checkId, suggestId, type Op } from '#lib/core/splice.ts';
import { updateMeta } from '#lib/core/meta.ts';
import { asMessage, respond } from '#lib/server/edit-actions.ts';
import { edits } from '#lib/server/edits.ts';
import { problems, readItemForm, type ItemFormValues } from '#lib/server/item-form.ts';
import { assigneesInUse } from '#lib/server/item-view.ts';
import { loadProjectState, projectState } from '#lib/server/project-state.ts';
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const s = await projectState({ locals, params });
	if (!s.hasBacklog) error(404, 'This project has no backlog');
	const suggested = suggestId(s.newIdPrefix, s.usedIds);
	const values: ItemFormValues = {
		id: suggested,
		title: '',
		star: false,
		job: '',
		size: '',
		status: 'todo',
		waiting: '',
		plan: '',
		branch: '',
		assignee: '',
		body: ''
	};
	return {
		values,
		suggested,
		section: Number(url.searchParams.get('section') ?? 0),
		sections: s.sections.map((x) => ({ index: x.index, title: x.titleText })),
		assignees: assigneesInUse(s),
		jobs: [...new Set(s.items.map((i) => i.job).filter((j): j is string => !!j))].sort(),
		tasks: (s.plan?.tasks ?? [])
			.filter((t) => !t.superseded && !s.items.some((i) => i.id === t.number))
			.map((t) => ({ number: t.number, title: t.title.replace(/[*`]/g, '').slice(0, 80) }))
	};
};

export const actions: Actions = {
	default: async ({ locals, params, request }) => {
		const form = await request.formData();
		const v = readItemForm(form);
		const section = Number(form.get('section'));
		const at = form.get('at') === 'start' ? ('start' as const) : ('end' as const);
		const s = await loadProjectState(locals.project!.id);
		const bad = problems(v) ?? checkId(v.id, s.usedIds);
		if (bad) return fail(400, { values: v, message: bad, reauth: false });
		const op: Op = {
			op: 'add',
			item: {
				id: v.id,
				title: v.title,
				star: v.star,
				job: v.job || null,
				meta: updateMeta([], {
					status: v.status,
					size: v.size,
					branch: v.branch,
					plan: v.plan ? v.plan.split(',') : [],
					waiting: v.waiting,
					for: v.assignee
				}),
				body: v.body
			},
			to: s.sections[section] ? { section, at } : { section: 0, at }
		};
		try {
			const result = await edits.edit(locals.user!, locals.project!, op, null);
			return respond(result, `/p/${params.repo}/i/${encodeURIComponent(v.id)}`, { values: v });
		} catch (e) {
			return asMessage(e, { values: v });
		}
	}
};
