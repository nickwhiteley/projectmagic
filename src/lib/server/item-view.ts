// What a row or card shows for an item: its status, where the status came from, and its parts
// rendered.
import type { ItemView, ProjectState } from '#lib/core/state.ts';
import { ago } from '#lib/format.ts';
import { inline, md } from './views.ts';

/** "in progress · feat/nw9-dxf-export · 3 ahead · 2 h ago", "PR #7 open", "plan task 46". */
export function sourceText(it: ItemView, now = Date.now()): string {
	const src = it.statusSource;
	if (src.rule === 3 && it.branches.length) {
		const b = it.branches.find((x) => `branch ${x.name}` === src.detail) ?? it.branches[0];
		return `${b.name} · ${b.ahead} ahead · ${ago(b.committedAt, now)}`;
	}
	if (src.rule === 4) {
		const tasks = it.tasks.map((t) => `plan task ${t.number}`).join(', ');
		return tasks || (it.branches[0] ? it.branches[0].name : 'the backlog');
	}
	return src.detail;
}

export function row(s: ProjectState, it: ItemView, withBody = false) {
	return {
		id: it.id,
		star: it.star,
		titleHtml: inline(s, it.title),
		titleText: it.titleText,
		job: it.job,
		size: it.size,
		assignee: it.assignee,
		epic: it.epic,
		type: it.type,
		inferred: it.inferred,
		status: it.status,
		blocked: it.blocked,
		pending: it.pending,
		section: it.section,
		source: sourceText(it),
		waitingHtml: it.waiting ? inline(s, it.waiting) : null,
		noMeta: !it.meta,
		bodyHtml: withBody ? md(s, it.body) : null
	};
}

export type Row = ReturnType<typeof row>;

/** The `Type:` values in use (PM2), for the List's and Board's filter. */
export function typesInUse(s: ProjectState): string[] {
	return [...new Set(s.items.map((i) => i.type).filter((t): t is string => !!t))].sort();
}

/** The epics (PM1), for the List's and Board's filter: declared or named by an item. */
export function epicsInUse(s: ProjectState): { id: string; title: string | null }[] {
	return s.epics.map((e) => ({ id: e.id, title: e.title }));
}

/** The `For:` values in use (PM16), plus the two kinds, for suggestions and filters. */
export function assigneesInUse(s: ProjectState): string[] {
	const used = s.items.map((i) => i.assignee).filter((a): a is string => !!a);
	return [...new Set(['person', 'agent', ...used])].sort();
}
