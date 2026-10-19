import { assigneesInUse, epicsInUse } from '#lib/server/item-view.ts';
import { settleEpic } from '#lib/server/epic-field.ts';
import { bugsPosition } from '#lib/core/bugs.ts';
import { checkId, splice, type Op, type Position } from '#lib/core/splice.ts';
import { editChange, formValues, statusChange } from '#lib/core/edit-form.ts';
import { updateMeta, type Status } from '#lib/core/meta.ts';
import { edits } from '#lib/server/edits.ts';
import { asMessage, conflictDiffs, respond, safeBack } from '#lib/server/edit-actions.ts';
import { problems, readBase, readItemForm } from '#lib/server/item-form.ts';
import { loadProjectState } from '#lib/server/project-state.ts';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

/**
 * The item as this person edits it: with the pending batch edits when theirs are batched too, and
 * as saved on main when their edit is saved at once, so it never carries someone else's unsaved
 * edit (PM25).
 */
async function context(locals: App.Locals, id: string) {
	const pending = await edits.batching(locals.user!, locals.project!);
	const s = await loadProjectState(locals.project!.id, { pending });
	const it = s.items.find((i) => i.id === id);
	if (!it) error(404, `No item ${id} on main`);
	return { s, it };
}

export const load: PageServerLoad = async ({ locals, params }) => {
	void params.repo; // a dependency, so moving between projects re-runs this load
	const { s, it } = await context(locals, params.id);
	const values = formValues(it);
	return {
		values,
		base: it.source,
		assignees: assigneesInUse(s),
		epics: epicsInUse(s),
		jobs: [...new Set(s.items.map((i) => i.job).filter((j): j is string => !!j))].sort(),
		tasks: (s.plan?.tasks ?? [])
			.filter((t) => !t.superseded)
			.map((t) => ({ number: t.number, title: t.title.replace(/[*`]/g, '').slice(0, 80) })),
		items: s.items.map((i) => ({ id: i.id, title: i.titleText, section: i.section })),
		sections: s.sections.map((x) => ({ index: x.index, title: x.titleText }))
	};
};

export const actions: Actions = {
	save: async ({ locals, params, request }) => {
		const form = await request.formData();
		const v = readItemForm(form);
		const base = readBase(form);
		const { s, it } = await context(locals, params.id);
		const bad = problems(v) ?? (v.id !== it.id ? checkId(v.id, s.usedIds) : null);
		if (bad) return fail(400, { values: v, base, message: bad, reauth: false });

		// A name in the Epic field starts a new epic (PM1): declare it, then use its id.
		const epic = await settleEpic(locals.user!, locals.project!, s, v.epic).catch((e) => e);
		if (epic instanceof Error) return asMessage(epic, { values: v, base });
		if ('message' in epic)
			return fail(400, { values: v, base, message: epic.message, reauth: false });
		v.epic = epic.epic;

		const op: Op = { op: 'edit', id: it.id, change: editChange(it, v) };
		try {
			const result = await edits.edit(locals.user!, locals.project!, op, base, it.file);
			if (result.kind === 'conflict') {
				// What this edit would make of the item: the change applied to what the form opened.
				const mine = base ? splice(base, op) : '';
				return fail(409, {
					values: v,
					// Keep mine resubmits against what is there now.
					base: result.theirs ?? '',
					conflict: conflictDiffs(base, result.theirs, mine)
				});
			}
			return respond(result, `/p/${params.repo}/i/${encodeURIComponent(v.id)}`, {
				values: v,
				base
			});
		} catch (e) {
			return asMessage(e, { values: v, base });
		}
	},

	move: async ({ locals, params, request }) => {
		const form = await request.formData();
		const [where, target] = String(form.get('to') ?? '').split(':');
		const { s, it } = await context(locals, params.id);
		// Each file keeps its own items (PM29): a move stays inside the one the item is in.
		const targetFile =
			where === 'before' || where === 'after'
				? (s.items.find((i) => i.id === target)?.file ?? null)
				: (s.sections[Number(target)]?.file ?? null);
		if (targetFile !== it.file)
			return fail(400, {
				message: it.file
					? `A bug stays in ${it.file}: move it among the bugs.`
					: 'An item can’t move into the bugs file: change its Type instead.',
				reauth: false
			});
		let to: Position =
			where === 'before'
				? { before: target }
				: where === 'after'
					? { after: target }
					: {
							section: Number(target),
							at: where === 'start' ? ('start' as const) : ('end' as const)
						};
		if ('section' in to && it.file)
			to = bugsPosition(s.items, to.at, it.id) ?? { section: 0, at: to.at };
		try {
			const result = await edits.edit(
				locals.user!,
				locals.project!,
				{ op: 'move', id: params.id, to },
				null,
				it.file
			);
			return respond(result, `/p/${params.repo}`);
		} catch (e) {
			return asMessage(e);
		}
	},

	// The Board's drag into another column (PM27) and the Accept buttons (PM10): only the status, and
	// the waiting reason. `back` is where to go afterwards.
	status: async ({ locals, params, request }) => {
		const form = await request.formData();
		const status = String(form.get('status') ?? '') as Status;
		if (!['todo', 'blocked', 'built', 'done'].includes(status))
			return fail(400, {
				message:
					'Only todo, blocked, built and done can be set; in progress and in review come from branches and pull requests.',
				reauth: false
			});
		const waiting = form.get('waiting');
		const { it } = await context(locals, params.id);
		const change = statusChange(it, status, waiting === null ? undefined : String(waiting).trim());
		try {
			const result = await edits.edit(
				locals.user!,
				locals.project!,
				{ op: 'edit', id: it.id, change },
				null,
				it.file
			);
			return respond(result, safeBack(form.get('back'), `/p/${params.repo}/board`));
		} catch (e) {
			return asMessage(e);
		}
	},

	// A person's comment for the agents (PM32), from the item page. It goes in the item's body, sets
	// `Comment:`, sends a built or done item back to todo, and is posted on the item's open PRs.
	comment: async ({ locals, params, request, url }) => {
		const form = await request.formData();
		const text = String(form.get('text') ?? '')
			.replace(/\r\n/g, '\n')
			.trim();
		const back = `/p/${params.repo}/i/${encodeURIComponent(params.id)}`;
		if (!text)
			return fail(400, { comment: text, message: 'Write a comment first.', reauth: false });
		if (text.length > 4000)
			return fail(400, { comment: text, message: 'Keep it under 4000 characters.', reauth: false });
		const { it } = await context(locals, params.id);
		const op: Op = {
			op: 'comment',
			id: it.id,
			by: locals.user!.githubLogin,
			date: new Date().toISOString().slice(0, 10),
			text
		};
		try {
			const result = await edits.edit(locals.user!, locals.project!, op, null, it.file);
			if (result.kind !== 'conflict' && result.kind !== 'blocked' && result.kind !== 'refused')
				await edits.commentOnPrs(
					locals.user!,
					locals.project!,
					it.prs,
					{ id: it.id, url: `${url.origin}${back}` },
					text
				);
			return respond(result, back, { comment: text });
		} catch (e) {
			return asMessage(e, { comment: text });
		}
	},

	// The person has read the agents' reply (PM32): clear `Reply:`.
	read: async ({ locals, params }) => {
		const { it } = await context(locals, params.id);
		if (!it.reply) redirect(303, `/p/${params.repo}/i/${encodeURIComponent(it.id)}`);
		const op: Op = {
			op: 'edit',
			id: it.id,
			change: { meta: updateMeta(it.meta ?? [], { reply: '' }) }
		};
		try {
			const result = await edits.edit(locals.user!, locals.project!, op, null, it.file);
			return respond(result, `/p/${params.repo}/i/${encodeURIComponent(it.id)}`);
		} catch (e) {
			return asMessage(e);
		}
	},

	remove: async ({ locals, params, request }) => {
		const form = await request.formData();
		if (form.get('confirm') !== 'yes')
			return fail(400, { message: 'Tick the box to confirm.', reauth: false });
		const mode = form.get('mode');
		const { it } = await context(locals, params.id);
		const op: Op =
			mode === 'done'
				? { op: 'edit', id: it.id, change: { meta: updateMeta(it.meta ?? [], { status: 'done' }) } }
				: { op: 'remove', id: it.id };
		try {
			const result = await edits.edit(locals.user!, locals.project!, op, null, it.file);
			return respond(
				result,
				mode === 'done' ? `/p/${params.repo}/i/${encodeURIComponent(it.id)}` : `/p/${params.repo}`
			);
		} catch (e) {
			return asMessage(e);
		}
	}
};
