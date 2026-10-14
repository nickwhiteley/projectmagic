import { diffLines } from '#lib/core/diff.ts';
import { loadProjectState } from '#lib/server/project-state.ts';
import { sourceText } from '#lib/server/item-view.ts';
import { inline, md } from '#lib/server/views.ts';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const s = await loadProjectState(locals.project!.id);
	const it = s.items.find((i) => i.id === params.id);
	if (!it) {
		const done = s.done.find((d) => d.id === params.id);
		if (!done) error(404, `No item ${params.id}`);
		return {
			done: {
				id: done.id,
				title: done.title,
				at: done.at,
				commit: done.commit,
				pr: done.pr,
				bodyHtml: md(s, done.body.replace(/^###[^\n]*\n/, ''))
			},
			item: null
		};
	}
	const linked = new Set(it.branches.map((b) => b.name));
	const deploy = new Set(s.branches.filter((b) => b.isDeploy).map((b) => b.name));
	return {
		done: null,
		item: {
			id: it.id,
			star: it.star,
			titleHtml: inline(s, it.title),
			titleText: it.titleText,
			job: it.job,
			size: it.size,
			section: it.section === null ? null : (s.sections[it.section]?.titleText ?? null),
			status: it.status,
			rule: it.statusSource.rule,
			source: sourceText(it),
			sourceDetail: it.statusSource.detail,
			blocked: it.blocked,
			waitingHtml: it.waiting ? inline(s, it.waiting) : null,
			meta: (it.meta ?? []).map((e) => ({ key: e.key, html: inline(s, e.value) })),
			noMeta: !it.meta,
			bodyHtml: md(s, it.body),
			branches: it.branches,
			prs: it.prs,
			tasks: it.tasks.map((t) => ({ ...t, titleHtml: inline(s, t.title) })),
			disagreements: it.disagreements,
			hints: it.hints,
			pending: it.pending,
			line: it.line,
			// Diffs for the branches doing this item's work. Other branches' copies are usually just
			// older (a branch behind main carries main's old backlog), so they are only named.
			diffs: it.differs
				.filter((d) => linked.has(d.branch))
				.map((d) => ({ branch: d.branch, lines: diffLines(it.source, d.source) })),
			olderCopies: it.differs
				.filter((d) => !linked.has(d.branch) && !deploy.has(d.branch))
				.map((d) => d.branch)
		},
		repoUrl: `https://github.com/${s.owner}/${s.repo}`,
		main: s.main
	};
};
