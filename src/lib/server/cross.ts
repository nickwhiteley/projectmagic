// Across a tenant's repositories (PM36): items in another repository's epic, items waiting on
// another repository's item, and PRs that name another repository's items. Each project's state
// is its own; this reads the others' alongside it, in the same tenant only.
import { findRefs, isHere, parseRef, refString, type CrossRef } from '#lib/core/crossref.ts';
import type { Status } from '#lib/core/meta.ts';
import type { PrLink, ProjectState } from '#lib/core/state.ts';
import type { ProjectRow } from './projects.ts';

export interface Neighbour {
	project: ProjectRow;
	state: ProjectState;
	/** Whether this person may open it. One they can't is named, with no titles, and refused. */
	visible: boolean;
}

/** The project a reference names, among the neighbours. */
function find(ns: Neighbour[], repo: string): Neighbour | null {
	return ns.find((n) => isHere(repo, n.project)) ?? null;
}

/** Another repository's item, as one repository shows it to a person in another. */
export interface Member {
	repo: string;
	id: string;
	/** Null when this person can't open that project. */
	title: string | null;
	status: Status;
	shipped: boolean;
	href: string;
}

/** Items of the neighbours that join an epic of `here` (`Epic: <here>:EP3`), by epic id. */
export function epicMembers(ns: Neighbour[], here: ProjectRow): Map<string, Member[]> {
	const out = new Map<string, Member[]>();
	const add = (epic: string | null, m: Member) => {
		const r = epic ? parseRef(epic) : null;
		if (!r || !isHere(r.repo, here)) return;
		out.set(r.id, [...(out.get(r.id) ?? []), m]);
	};
	for (const n of ns) {
		const repo = n.project.param;
		for (const it of n.state.items)
			add(it.epic, {
				repo,
				id: it.id,
				title: n.visible ? it.titleText : null,
				status: it.status,
				shipped: false,
				href: `/p/${repo}/i/${encodeURIComponent(it.id)}`
			});
		for (const d of n.state.done)
			if (!d.unpruned)
				add(d.epic, {
					repo,
					id: d.id,
					title: n.visible ? d.title : null,
					status: 'done',
					shipped: true,
					href: `/p/${repo}/done#${d.id}`
				});
	}
	return out;
}

/**
 * The Epic field's suggestions: this project's epics, then those declared in the neighbours, as
 * `<repo>:EP3`. An epic both lists name (an item here already joins it) is listed once, titled.
 */
export function epicChoices(
	mine: { id: string; title: string | null }[],
	ns: Neighbour[]
): { id: string; title: string | null }[] {
	const theirs = neighbourEpics(ns);
	return [
		...mine.map((e) => theirs.find((t) => t.id.toLowerCase() === e.id.toLowerCase()) ?? e),
		...theirs.filter((t) => !mine.some((e) => e.id.toLowerCase() === t.id.toLowerCase()))
	];
}

function neighbourEpics(ns: Neighbour[]): { id: string; title: string | null }[] {
	return ns
		.filter((n) => n.visible)
		.flatMap((n) =>
			n.state.epics
				.filter((e) => e.declared)
				.map((e) => ({ id: `${n.project.param}:${e.id}`, title: e.title }))
		);
}

/** What a reference points at now: its status (`done` once shipped), or null if it isn't there. */
export interface Resolved {
	ref: string;
	status: Status | null;
	title: string | null;
	href: string | null;
}

export function resolve(
	ns: Neighbour[],
	here: ProjectState,
	hereRow: { owner: string; repo: string },
	r: CrossRef
): Resolved {
	const ref = refString(r);
	const n = isHere(r.repo, hereRow) ? null : find(ns, r.repo);
	const state = n ? n.state : isHere(r.repo, hereRow) ? here : null;
	if (!state) return { ref, status: null, title: null, href: null };
	const repo = n ? n.project.param : here.repo;
	const titled = !n || n.visible;
	const it = state.items.find((i) => i.id === r.id);
	if (it)
		return {
			ref,
			status: it.status,
			title: titled ? it.titleText : null,
			href: `/p/${repo}/i/${encodeURIComponent(it.id)}`
		};
	const d = state.done.find((x) => x.id === r.id);
	if (d)
		return {
			ref,
			status: 'done',
			title: titled ? d.title : null,
			href: `/p/${repo}/done#${d.id}`
		};
	return { ref, status: null, title: null, href: null };
}

/** Whether any item waits on a `<repo>:<id>`, so the neighbours are worth loading. */
export const hasCrossWaits = (s: ProjectState): boolean =>
	s.items.some((i) => i.waiting && findRefs(i.waiting).length);

/**
 * The state with each item that waits on another repository's item (`Waiting: plinth:PL4 …`)
 * marked blocked until that item is done, and a hint saying so. A new state: the cached one is
 * shared, so it is never changed.
 */
export function withCrossWaits(
	s: ProjectState,
	ns: Neighbour[],
	hereRow: { owner: string; repo: string }
): ProjectState {
	let changed = false;
	const items = s.items.map((it) => {
		if (!it.waiting) return it;
		const open = findRefs(it.waiting)
			.map((r) => resolve(ns, s, hereRow, r))
			.filter((x) => x.status && x.status !== 'done');
		if (!open.length) return it;
		changed = true;
		return {
			...it,
			blocked: true,
			hints: [...it.hints, ...open.map((x) => `Waits on ${x.ref}, which is ${x.status}.`)]
		};
	});
	return changed ? { ...s, items } : s;
}

/** For an item's page: what other repositories say about it. */
export interface ItemLinks {
	/** Neighbours' PRs whose `Backlog:` line names this item. */
	prs: (PrLink & { repo: string })[];
	/** Neighbours' items whose `Waiting:` names this item. */
	waitedOnBy: Member[];
}

export function itemLinks(ns: Neighbour[], here: ProjectRow, id: string): ItemLinks {
	const names = (r: CrossRef) => isHere(r.repo, here) && r.id === id;
	const prs: ItemLinks['prs'] = [];
	const waitedOnBy: Member[] = [];
	for (const n of ns) {
		if (!n.visible) continue;
		for (const c of n.state.crossPrs)
			if (c.refs.some((x) => names(parseRef(x)!))) prs.push({ ...c.pr, repo: n.project.param });
		for (const it of n.state.items)
			if (it.waiting && findRefs(it.waiting).some(names))
				waitedOnBy.push({
					repo: n.project.param,
					id: it.id,
					title: it.titleText,
					status: it.status,
					shipped: false,
					href: `/p/${n.project.param}/i/${encodeURIComponent(it.id)}`
				});
	}
	return { prs, waitedOnBy };
}
