import { parseConfig } from '#lib/core/config.ts';
import type { TocEntry } from '#lib/core/render.ts';
import { db } from '#lib/server/db.ts';
import { docText, listDocs } from '#lib/server/docs.ts';
import { projectState } from '#lib/server/project-state.ts';
import { md } from '#lib/server/views.ts';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const project = locals.project!;
	const s = await projectState({ locals, params });
	const [row] = await db()<{ config_json: ReturnType<typeof parseConfig>['config'] | null }[]>`
		select config_json from project where id = ${project.id}`;
	const config =
		row?.config_json ?? parseConfig(null, { name: project.repo, defaultBranch: s.main }).config;

	const branches = s.branches.filter((b) => b.active && !b.isEdits && !b.isDeploy);
	const ref = url.searchParams.get('ref') ?? s.main;
	const branch = s.branches.find((b) => b.name === ref);
	if (!branch) error(404, `No branch ${ref}`);
	const [head] = await db()<{ head_oid: string }[]>`
		select head_oid from ref where project_id = ${project.id} and name = ${ref}`;
	const docs = await listDocs(project, config, head.head_oid);
	const query = ref === s.main ? '' : `?ref=${encodeURIComponent(ref)}`;

	if (!params.path) {
		const first = docs.find((d) => /^readme\.md$/i.test(d.path)) ?? docs[0];
		if (first) redirect(307, `/p/${project.repo}/docs/${first.path}${query}`);
		return {
			docs: [],
			branches: branches.map((b) => b.name),
			ref,
			path: null,
			html: null,
			toc: [],
			query
		};
	}
	const doc = docs.find((d) => d.path === params.path);
	if (!doc) error(404, `${params.path} is not one of this project’s documents on ${ref}`);
	const text = (await docText(project, doc.oid)) ?? '';
	const toc: TocEntry[] = [];
	const html = md(s, text, {
		docPath: doc.path,
		docHref: (p) => `/p/${project.repo}/docs/${p}${query}`,
		imgHref: (p) => `/p/${project.repo}/raw/${p}${query}`,
		toc
	});
	return {
		docs: docs.map((d) => d.path),
		branches: branches.map((b) => b.name),
		ref,
		path: doc.path,
		html,
		toc: toc.filter((t) => t.depth >= 2 && t.depth <= 3),
		query,
		githubUrl: `https://github.com/${project.owner}/${project.repo}/blob/${encodeURIComponent(ref)}/${doc.path}`
	};
};
