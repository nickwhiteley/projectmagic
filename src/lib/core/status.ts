// An item's displayed status and where it came from (spec §7.2). The first rule that applies wins,
// and the item's own meta line beats its plan task. Disagreements are reported, never resolved.
import type { Item } from './backlog.ts';
import type { Status } from './meta.ts';
import type { PlanStatus, Task } from './progress.ts';

export interface LinkedBranch {
	name: string;
	/** Main, an open PR, or ahead of main and committed to within `active_branch_days`. */
	active: boolean;
	ahead: number;
	committedAt: string;
}

export interface LinkedPr {
	number: number;
	state: 'open' | 'merged' | 'closed';
	draft: boolean;
}

export interface BranchCopy {
	branch: string;
	item: Item;
	/** The item's source on that branch, for the diff. */
	text: string;
}

export interface StatusInput {
	/** The item on main, or null when it has been removed. */
	item: Item | null;
	/** main's source of the item, to compare branch copies against. */
	text: string | null;
	/** Removed from main's backlog at some commit (§7.3). */
	removed: boolean;
	branches: LinkedBranch[];
	prs: LinkedPr[];
	/** Every other branch's copy of the item. */
	copies: BranchCopy[];
	/** The linked plan tasks that are current (not superseded). */
	tasks: Task[];
}

export type StatusRule = 1 | 2 | 3 | 4 | 5 | 6;

export interface StatusSource {
	rule: StatusRule;
	/** For a card: "removed from main", "PR #7 open", "branch feat/nw9-dxf-export", "plan task 46". */
	detail: string;
	branch?: LinkedBranch;
	pr?: LinkedPr;
	task?: Task;
}

export interface DerivedStatus {
	status: Status;
	source: StatusSource;
	/** `blocked` is also a flag on in-progress and in-review cards, with the Waiting: text. */
	blocked: boolean;
	waiting: string | null;
	/** "backlog says built, plan task 35 says done": shown on the health panel. */
	disagreements: string[];
	/** "all plan tasks done; still in backlog" (§7.3). */
	hints: string[];
	/** Branch copies whose text differs from main's, for the item view's diffs. */
	differs: BranchCopy[];
}

// How far along a status is. blocked is a todo with a reason; skipped is as finished as done.
const RANK: Record<PlanStatus | Status, number> = {
	todo: 0,
	blocked: 0,
	'in progress': 1,
	'in review': 2,
	built: 3,
	done: 4,
	skipped: 4,
	unknown: -1
};

// For comparing a meta line with a plan task: the plan has no in review, and blocked is a todo.
const comparable = (s: PlanStatus | Status) =>
	s === 'blocked' ? 'todo' : s === 'in review' ? 'in progress' : s === 'skipped' ? 'done' : s;

const latest = (bs: LinkedBranch[]) =>
	[...bs].sort((a, b) => b.committedAt.localeCompare(a.committedAt))[0];

export function deriveStatus(input: StatusInput): DerivedStatus {
	const { item, removed } = input;
	const meta = item?.meta?.status ? item.meta : null;
	const tasks = input.tasks.filter((t) => t.status !== 'unknown');
	const open = input.prs.filter((p) => p.state === 'open').sort((a, b) => b.number - a.number);
	const active = input.branches.filter((b) => b.active);
	const copyInProgress = input.copies.find((c) => c.item.meta?.status === 'in progress');

	const result = (status: Status, source: StatusSource): DerivedStatus => {
		const disagreements: string[] = [];
		if (meta && item)
			for (const t of tasks)
				if (comparable(meta.status!) !== comparable(t.status))
					disagreements.push(
						`${item.id}: backlog says ${meta.status}, plan task ${t.number} says ${t.status}`
					);
		const hints: string[] = [];
		if (
			item &&
			!removed &&
			status !== 'done' &&
			tasks.length &&
			tasks.every((t) => RANK[t.status] === 4)
		)
			hints.push('all plan tasks done; still in backlog');
		return {
			status,
			source,
			blocked: meta?.status === 'blocked',
			waiting: item?.meta?.waiting ?? null,
			disagreements,
			hints,
			differs: input.text === null ? [] : input.copies.filter((c) => c.text !== input.text)
		};
	};

	// 1. Removed from main, or done in main's meta line.
	if (removed || !item) return result('done', { rule: 1, detail: 'removed from main' });
	if (meta?.status === 'done') return result('done', { rule: 1, detail: 'done in the backlog' });

	// 2. A linked open PR.
	if (open.length) {
		const pr = open[0];
		return result('in review', {
			rule: 2,
			detail: `PR #${pr.number} ${pr.draft ? 'open as a draft' : 'open'}`,
			pr
		});
	}

	// 3. Main says todo or blocked, or nothing (§5.1), but a branch says work has started.
	if (!meta || meta.status === 'todo' || meta.status === 'blocked') {
		if (active.length) {
			const branch = latest(active);
			return result('in progress', { rule: 3, detail: `branch ${branch.name}`, branch });
		}
		if (copyInProgress)
			return result('in progress', {
				rule: 3,
				detail: `in progress on ${copyInProgress.branch}`
			});
	}

	// 4. Main's meta line.
	if (meta) return result(meta.status!, { rule: 4, detail: 'the backlog' });

	// 5. No meta line: the linked plan task's status, or the least advanced of several.
	if (tasks.length) {
		const task = [...tasks].sort((a, b) => RANK[a.status] - RANK[b.status])[0];
		const status: Status = task.status === 'skipped' ? 'done' : (task.status as Status);
		return result(status, { rule: 5, detail: `plan task ${task.number}`, task });
	}

	// 6. Otherwise.
	return result('todo', { rule: 6, detail: 'no meta line' });
}
