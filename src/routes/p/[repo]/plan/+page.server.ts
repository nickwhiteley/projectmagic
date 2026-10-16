import { can } from '#lib/core/access.ts';
import {
	PLAN_STATUSES,
	parseStatusCell,
	PlanEditError,
	setTaskStatus,
	taskStatusCell
} from '#lib/core/progress.ts';
import { asMessage, respond, safeBack } from '#lib/server/edit-actions.ts';
import { edits } from '#lib/server/edits.ts';
import { loadProjectState, projectState } from '#lib/server/project-state.ts';
import { inline } from '#lib/server/views.ts';
import { error, fail } from '@sveltejs/kit';
import { WriteError } from '#lib/server/write.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const s = await projectState({ locals, params });
	if (!s.plan) error(404, 'This project has no plan');
	const task = (t: (typeof s.plan.tasks)[number]) => ({
		number: t.number,
		titleHtml: inline(s, t.title),
		status: t.status,
		noteHtml: t.note ? inline(s, t.note) : null,
		note: t.note,
		statusRaw: t.statusRaw,
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

export const actions: Actions = {
	// Set a task's status in PROGRESS.md (PM6): the status word, and the note after it if changed.
	status: async ({ locals, params, request }) => {
		const project = locals.project!;
		if (!can(locals.user, 'edit', project, locals.memberships)) error(403, 'Not allowed');
		const form = await request.formData();
		const number = String(form.get('number') ?? '');
		const status = String(form.get('status') ?? '');
		const base = String(form.get('base') ?? '').replace(/\r\n/g, '\n');
		if (!(PLAN_STATUSES as readonly string[]).includes(status))
			return fail(400, { message: `${status} is not a plan status.`, reauth: false });
		const s = await loadProjectState(project.id);
		if (!s.progressPath) error(404, 'This project has no plan');
		// An untouched note keeps its markdown exactly; a changed one replaces it.
		const asked = String(form.get('note') ?? '')
			.replace(/\s+/g, ' ')
			.trim();
		const shown = parseStatusCell(base).note.replace(/\s+/g, ' ').trim();
		const note = asked === shown ? undefined : asked;
		const change = {
			apply: (text: string) => {
				try {
					return setTaskStatus(text, number, status as (typeof PLAN_STATUSES)[number], note);
				} catch (e) {
					if (e instanceof PlanEditError) throw new WriteError(e.message);
					throw e;
				}
			},
			describe: () => `Plan: ${number} ${status}`,
			current: (text: string) => taskStatusCell(text, number)
		};
		try {
			const result = await edits.editFile(locals.user!, project, s.progressPath, change, base, {
				op: 'plan',
				item: number
			});
			if (result.kind === 'conflict')
				return fail(409, {
					message: `Task ${number} changed on ${s.main} while you were looking. Reload and try again.`,
					reauth: false
				});
			return respond(result, safeBack(form.get('back'), `/p/${params.repo}/plan#task-${number}`));
		} catch (e) {
			return asMessage(e);
		}
	}
};
