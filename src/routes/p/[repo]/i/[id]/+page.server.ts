import { diffLines } from '#lib/core/diff.ts';
import { edits } from '#lib/server/edits.ts';
import { findRefs, parseRef } from '#lib/core/crossref.ts';
import { itemLinks, resolve } from '#lib/server/cross.ts';
import { neighbours, projectState } from '#lib/server/project-state.ts';
import { sourceText } from '#lib/server/item-view.ts';
import { inline, md } from '#lib/server/views.ts';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const s = await projectState({ locals, params });
	const it = s.items.find((i) => i.id === params.id);
	if (!it) {
		const done = s.done.find((d) => d.id === params.id);
		if (!done) {
			// Deleted with Project Magic's Remove: say so, with its last text (PM24).
			const gone = s.deleted.find((d) => d.id === params.id);
			if (gone)
				return {
					adding: false,
					deleted: {
						id: gone.id,
						title: gone.title,
						at: gone.at,
						by: gone.by,
						commit: gone.commit,
						bodyHtml: md(s, gone.body.replace(/^###[^\n]*\n/, ''))
					},
					done: null,
					item: null,
					repoUrl: `https://github.com/${s.owner}/${s.repo}`
				};
			// Just added, and the sync hasn't caught up: say so, and the page refreshes (PM17).
			if (await edits.justAdded(locals.project!.id, params.id))
				return { adding: true, deleted: null, done: null, item: null };
			error(404, `No item ${params.id}`);
		}
		return {
			adding: false,
			deleted: null,
			done: {
				id: done.id,
				title: done.title,
				at: done.at,
				commit: done.commit,
				pr: done.pr,
				bodyHtml: md(s, done.body.replace(/^###[^\n]*\n/, ''))
			},
			item: null,
			repoUrl: `https://github.com/${s.owner}/${s.repo}`
		};
	}
	// Across the tenant's repositories (PM36): what its Waiting: names, and who names it.
	const ns = await neighbours(locals);
	const here = locals.project!;
	const elsewhere = itemLinks(ns, here, it.id);
	const waits = it.waiting ? findRefs(it.waiting).map((r) => resolve(ns, s, here, r)) : [];
	const epicRef = it.epic ? parseRef(it.epic) : null;
	const linked = new Set(it.branches.map((b) => b.name));
	const deploy = new Set(s.branches.filter((b) => b.isDeploy).map((b) => b.name));
	return {
		adding: false,
		deleted: null,
		done: null,
		item: {
			id: it.id,
			star: it.star,
			titleHtml: inline(s, it.title),
			titleText: it.titleText,
			job: it.job,
			size: it.size,
			assignee: it.assignee,
			epic: it.epic,
			epicHref: epicRef
				? `/p/${ns.find((n) => n.project.param.toLowerCase() === epicRef.repo)?.project.param ?? epicRef.repo}/epics#${epicRef.id}`
				: it.epic
					? `/p/${here.param}/epics#${it.epic}`
					: null,
			waits,
			elsewhere,
			type: it.type,
			inferred: it.inferred,
			found: it.found,
			raised: it.raised,
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
			inferredBranches: it.inferredBranches,
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
