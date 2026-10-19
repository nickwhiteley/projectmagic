// Linking (spec §6): items, plan tasks, branches and pull requests into edges. Links are derived,
// never stored in the files beyond §5. Sources 1–5 are here; source 6, inferred links for older
// branches, is plan task 4.8.
import { EDIT_BRANCH, parseBranchName, parsePrText } from './branchref.ts';
import { isHere } from './crossref.ts';
import type { Item } from './backlog.ts';

/** 1 a task-number id · 2 a branch's ref · 3 a PR body · 4 an item's Branch:/Plan: keys · 5 a PR
 * title · 6 inferred, for older branches: never moves an item's status (§6). */
export type LinkSource = 1 | 2 | 3 | 4 | 5 | 6;

export type LinkNode =
	| { kind: 'item'; id: string }
	| { kind: 'task'; number: string }
	| { kind: 'branch'; name: string }
	| { kind: 'pr'; number: number };

export interface Edge {
	/** An item or a task. */
	from: Extract<LinkNode, { kind: 'item' | 'task' }>;
	/** A task, a branch or a PR. */
	to: Extract<LinkNode, { kind: 'task' | 'branch' | 'pr' }>;
	source: LinkSource;
}

export interface Dangling {
	/** The id or task number that doesn't exist. */
	ref: string;
	source: LinkSource;
	/** Where it was written: "branch feat/zz9-x", "PR #12", "NW9's Plan:". */
	where: string;
}

export interface BranchInput {
	name: string;
}

export interface PrInput {
	number: number;
	title: string;
	body: string | null;
	headRef: string;
}

/** One branch's copy of the backlog's items; main's copy included. */
export interface ItemCopy {
	branch: string;
	items: Item[];
}

export interface LinkInput {
	/** The items on main: what exists. */
	items: Item[];
	/** The plan task numbers that exist (main's, and active branches' where they differ). */
	tasks: Iterable<string>;
	branches: BranchInput[];
	prs: PrInput[];
	/** Every copy of the backlog, for source 4. */
	copies: ItemCopy[];
	/** This repository, so a PR's `Backlog: <repo>:<id>` naming it links like a bare id (PM36). */
	here?: { owner: string; repo: string };
}

export interface Links {
	edges: Edge[];
	dangling: Dangling[];
}

const key = (n: LinkNode) =>
	n.kind === 'item'
		? `i:${n.id}`
		: n.kind === 'task'
			? `t:${n.number}`
			: n.kind === 'branch'
				? `b:${n.name}`
				: `p:${n.number}`;

export function link(input: LinkInput): Links {
	const itemIds = new Set(input.items.map((i) => i.id));
	const taskNumbers = new Set(input.tasks);
	const branchNames = new Set(input.branches.map((b) => b.name).filter((n) => n !== EDIT_BRANCH));
	const prs = input.prs.filter((p) => p.headRef !== EDIT_BRANCH);

	const best = new Map<string, Edge>();
	const dangling: Dangling[] = [];
	const add = (from: Edge['from'], to: Edge['to'], source: LinkSource) => {
		const k = `${key(from)}>${key(to)}`;
		const had = best.get(k);
		if (!had || source < had.source) best.set(k, { from, to, source });
	};

	/** An id may name an item, a task, or both (Lantern's `5.8`). */
	const resolve = (
		ref: string,
		to: Edge['to'],
		source: LinkSource,
		where: string,
		tasksOnly = false
	) => {
		let found = false;
		if (!tasksOnly && itemIds.has(ref)) {
			add({ kind: 'item', id: ref }, to, source);
			found = true;
		}
		if (taskNumbers.has(ref)) {
			add({ kind: 'task', number: ref }, to, source);
			found = true;
		}
		if (!found) dangling.push({ ref, source, where });
	};

	// 1. An item whose id is a plan task number links to that task.
	for (const it of input.items)
		if (it.idKind === 'task' && taskNumbers.has(it.id))
			add({ kind: 'item', id: it.id }, { kind: 'task', number: it.id }, 1);

	// 2. A branch's ref, which its PRs share.
	for (const name of branchNames) {
		const ref = parseBranchName(name)?.ref;
		if (!ref) continue;
		resolve(ref, { kind: 'branch', name }, 2, `branch ${name}`);
		for (const pr of prs)
			if (pr.headRef === name)
				resolve(ref, { kind: 'pr', number: pr.number }, 2, `PR #${pr.number}`);
	}

	// 3 and 5. A PR body's Backlog: and Plan: lines, and an id at the start of its title.
	for (const pr of prs) {
		const t = parsePrText(pr.title, pr.body);
		const to = { kind: 'pr', number: pr.number } as const;
		for (const id of t.backlog) resolve(id, to, 3, `PR #${pr.number}'s Backlog:`);
		for (const r of t.refs)
			if (input.here && isHere(r.repo, input.here))
				resolve(r.id, to, 3, `PR #${pr.number}'s Backlog:`);
		for (const n of t.plan) resolve(n, to, 3, `PR #${pr.number}'s Plan:`, true);
		if (t.titleId) resolve(t.titleId, to, 5, `PR #${pr.number}'s title`);
	}

	// 4. Every copy of an item: its Branch: keys (and that branch's PRs) and its Plan: keys.
	for (const copy of input.copies) {
		for (const it of copy.items) {
			if (!itemIds.has(it.id) || !it.meta) continue;
			const from = { kind: 'item', id: it.id } as const;
			for (const name of it.meta.branches) {
				if (name === EDIT_BRANCH) continue;
				// A branch that no longer exists, such as a merged one, is history, not a fault.
				if (branchNames.has(name)) add(from, { kind: 'branch', name }, 4);
				for (const pr of prs)
					if (pr.headRef === name) add(from, { kind: 'pr', number: pr.number }, 4);
			}
			for (const n of it.meta.plan) {
				if (taskNumbers.has(n)) add(from, { kind: 'task', number: n }, 4);
				else dangling.push({ ref: n, source: 4, where: `${it.id}'s Plan: on ${copy.branch}` });
			}
		}
	}

	// 6. Inferred links for branches nothing else links: a spec file one item cites, named like the
	// branch, or else a strong overlap between the branch's words and exactly one item's title.
	const linkedBranches = new Set(
		[...best.values()].flatMap((e) => (e.to.kind === 'branch' ? [e.to.name] : []))
	);
	for (const name of branchNames) {
		if (linkedBranches.has(name)) continue;
		const target = inferItem(name, input.items);
		if (target) add({ kind: 'item', id: target }, { kind: 'branch', name }, 6);
	}

	const seen = new Set<string>();
	return {
		edges: [...best.values()],
		dangling: dangling.filter((d) => {
			const k = `${d.ref}|${d.where}`;
			if (seen.has(k)) return false;
			seen.add(k);
			return true;
		})
	};
}

const STOP = new Set([
	'a',
	'an',
	'and',
	'the',
	'of',
	'to',
	'in',
	'on',
	'for',
	'with',
	'v1',
	'v2',
	'fix',
	'wip',
	'new'
]);
const words = (s: string) =>
	s
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((w) => w.length > 1 && !STOP.has(w));

/** The one item an older branch is probably about, or null when there is no clear single answer. */
export function inferItem(branch: string, items: Item[]): string | null {
	const slug = parseBranchName(branch)?.slug ?? branch.slice(branch.lastIndexOf('/') + 1);
	if (!slug || slug === 'main') return null;
	// A spec file named like the branch, cited by exactly one item (`specs/dxf-export.md` for `dxf-export`).
	const cite = new RegExp(
		`(^|[\\s\`(/])${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.md\\b`,
		'i'
	);
	const citing = items.filter((it) => cite.test(it.body));
	if (citing.length === 1) return citing[0].id;
	if (citing.length > 1) return null;
	// Words: at least two shared, covering most of the branch's words, and one item clearly best.
	const bw = new Set(words(slug));
	if (bw.size < 2) return null;
	const scored = items
		.map((it) => {
			const tw = new Set(words(it.titleText));
			return { id: it.id, shared: [...bw].filter((w) => tw.has(w)).length };
		})
		.filter((x) => x.shared >= 2 && x.shared >= Math.ceil((bw.size * 2) / 3))
		.sort((a, b) => b.shared - a.shared);
	if (!scored.length || scored[1]?.shared === scored[0].shared) return null;
	return scored[0].id;
}
