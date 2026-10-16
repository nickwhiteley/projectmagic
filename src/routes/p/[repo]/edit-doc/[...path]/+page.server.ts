// Editing a document as text (PM6): any of the project's documents on main, in a text box, saved
// as one commit through the same path as a backlog edit, with a conflict if main changed.
import { parseConfig } from '#lib/core/config.ts';
import { asMessage, respond } from '#lib/server/edit-actions.ts';
import { db } from '#lib/server/db.ts';
import { docText, listDocs } from '#lib/server/docs.ts';
import { edits } from '#lib/server/edits.ts';
import { loadProjectState } from '#lib/server/project-state.ts';
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

const MAX_DOC_BYTES = 1_000_000;

const lf = (s: string) => s.replace(/\r\n/g, '\n');

/** The document on main, or a 404: only the project's own document files can be edited. */
async function document(locals: App.Locals, path: string) {
	const project = locals.project!;
	const s = await loadProjectState(project.id);
	const [row] = await db()<{ config_json: ReturnType<typeof parseConfig>['config'] | null }[]>`
		select config_json from project where id = ${project.id}`;
	const config =
		row?.config_json ?? parseConfig(null, { name: project.repo, defaultBranch: s.main }).config;
	const [head] = await db()<{ head_oid: string }[]>`
		select head_oid from ref where project_id = ${project.id} and name = ${s.main}`;
	if (!head) error(404, `No branch ${s.main}`);
	const doc = (await listDocs(project, config, head.head_oid)).find((d) => d.path === path);
	if (!doc) error(404, `${path} is not one of this project’s documents on ${s.main}`);
	return { project, s, doc, text: (await docText(project, doc.oid)) ?? '' };
}

export const load: PageServerLoad = async ({ locals, params }) => {
	const { text } = await document(locals, params.path);
	return { path: params.path, text: lf(text) };
};

export const actions: Actions = {
	save: async ({ locals, params, request }) => {
		const form = await request.formData();
		const text = lf(String(form.get('text') ?? ''));
		const base = lf(String(form.get('base') ?? ''));
		if (new TextEncoder().encode(text).length > MAX_DOC_BYTES)
			return fail(400, {
				text,
				base,
				message: 'The document is too large to edit here.',
				reauth: false
			});
		const { project, s } = await document(locals, params.path);
		const change = {
			// A file with Windows line endings keeps them.
			apply: (current: string) => (current.includes('\r\n') ? text.replace(/\n/g, '\r\n') : text),
			describe: () => `Docs: edit ${params.path}`,
			current: (current: string) => lf(current)
		};
		try {
			const result = await edits.editFile(locals.user!, project, params.path, change, base, {
				op: 'doc',
				item: params.path
			});
			if (result.kind === 'conflict')
				return fail(409, {
					text,
					// Resubmitting keeps these edits against what is there now.
					base: result.theirs ?? '',
					message: `${params.path} changed on ${s.main} while you were editing it. Saving again replaces the new version with yours.`,
					reauth: false
				});
			return respond(result, `/p/${params.repo}/docs/${params.path}`, { text, base });
		} catch (e) {
			return asMessage(e, { text, base });
		}
	}
};
