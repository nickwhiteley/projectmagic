import { bugsPosition } from '#lib/core/bugs.ts';
import { checkId, suggestId, type Op, type Position } from '#lib/core/splice.ts';
import { updateMeta } from '#lib/core/meta.ts';
import { asMessage, respond } from '#lib/server/edit-actions.ts';
import { edits } from '#lib/server/edits.ts';
import { settleEpic } from '#lib/server/epic-field.ts';
import { problems, readItemForm, type ItemFormValues } from '#lib/server/item-form.ts';
import { assigneesInUse, epicsInUse } from '#lib/server/item-view.ts';
import { epicChoices } from '#lib/server/cross.ts';
import { loadProjectState, neighbours, projectState } from '#lib/server/project-state.ts';
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const s = await projectState({ locals, params });
	if (!s.hasBacklog) error(404, 'This project has no backlog');
	// `?bug=1` starts a bug in the bugs file, with its own prefix (PM29).
	// Without a bugs file the bug goes in the backlog, with `Type: bug`.
	const bugs = url.searchParams.get('bug') === '1';
	const suggested = suggestId(bugs ? s.bugPrefix : s.newIdPrefix, s.usedIds);
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
		// From an epic's "Add an item to EP3 in …" (PM36): that epic, maybe another repository's.
		epic: (url.searchParams.get('epic') ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
		body: ''
	};
	// A backlog with no `##` sections has none to pick, and the merged Bugs section would be the
	// first (and default) one: offer the backlog itself, as -1, so a new item isn't a bug.
	const hasSection = s.sections.some((x) => !x.file);
	const listed = s.sections.map((x) => ({ index: x.index, title: x.titleText }));
	return {
		values,
		suggested,
		bugs,
		hasBugsFile: !!s.bugsFile,
		section:
			bugs && s.bugsFile
				? (s.sections.find((x) => x.file)?.index ?? 0)
				: Number(url.searchParams.get('section') ?? (hasSection ? 0 : -1)),
		sections: hasSection ? listed : [{ index: -1, title: 'Backlog' }, ...listed],
		assignees: assigneesInUse(s),
		epics: epicChoices(epicsInUse(s), await neighbours(locals)),
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
		const s = await loadProjectState(locals.project!.id, {
			pending: await edits.batching(locals.user!, locals.project!)
		});
		const bug = form.get('bug') === '1';
		const bad = problems(v) ?? checkId(v.id, s.usedIds);
		if (bad) return fail(400, { values: v, message: bad, reauth: false });
		// A name in the Epic field starts a new epic (PM1): declare it, then use its id.
		const epic = await settleEpic(locals.user!, locals.project!, s, v.epic).catch((e) => e);
		if (epic instanceof Error) return asMessage(epic, { values: v });
		if ('message' in epic) return fail(400, { values: v, message: epic.message, reauth: false });
		// The Bugs section is bugs.md, which has no place of its own for it: next to its bugs (PM29).
		const file = s.sections[section]?.file ?? null;
		const to: Position = file
			? (bugsPosition(s.items, at) ?? { section: 0, at })
			: { section: s.sections[section] ? section : 0, at };
		const op: Op = {
			op: 'add',
			item: {
				id: v.id,
				title: v.title,
				star: v.star,
				job: v.job || null,
				meta: [
					...updateMeta([], {
						status: v.status,
						size: v.size,
						branch: v.branch,
						plan: v.plan ? v.plan.split(',') : [],
						waiting: v.waiting,
						for: v.assignee,
						epic: epic.epic
					}),
					// In the bugs file an item is a bug already; elsewhere it says so (PM2).
					...(bug && !file ? [{ key: 'Type', value: 'bug' }] : [])
				],
				body: v.body
			},
			to
		};
		try {
			const result = await edits.edit(locals.user!, locals.project!, op, null, file);
			return respond(result, `/p/${params.repo}/i/${encodeURIComponent(v.id)}`, { values: v });
		} catch (e) {
			return asMessage(e, { values: v });
		}
	}
};
