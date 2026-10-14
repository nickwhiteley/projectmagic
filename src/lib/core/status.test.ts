import { describe, expect, it } from 'vitest';
import { parseBacklog, type Item } from './backlog.ts';
import { fixture } from './fixtures.ts';
import { parseProgress, type Task } from './progress.ts';
import { deriveStatus, type LinkedBranch, type StatusInput } from './status.ts';

const one = (src: string): Item => parseBacklog(src).items[0];
const task = (number: string, status: Task['status']): Task => ({
	number,
	group: null,
	title: '',
	status,
	note: '',
	statusRaw: status,
	cells: [],
	line: 1,
	superseded: false
});
const branch = (
	name: string,
	active = true,
	committedAt = '2026-10-10T00:00:00Z'
): LinkedBranch => ({
	name,
	active,
	ahead: 2,
	committedAt
});

const base = (item: Item | null, over: Partial<StatusInput> = {}): StatusInput => ({
	item,
	text: null,
	removed: false,
	branches: [],
	prs: [],
	copies: [],
	tasks: [],
	...over
});

const TODO = one('### NW9 DXF\n**Status:** todo · **Plan:** 46\n');
const BLOCKED = one('### A1b bank\n**Status:** blocked · **Waiting:** the bank account\n');
const BUILT = one('### NW7 Reminder\n**Status:** built · **Plan:** 35\n');
const BARE = one('### C9 Something\n\nProse only.\n');

describe('deriveStatus: the rules in order', () => {
	it('1: removed from main, or done in the meta line', () => {
		expect(deriveStatus(base(TODO, { removed: true })).source.rule).toBe(1);
		expect(deriveStatus(base(null)).status).toBe('done');
		const done = one('### X1 Shipped\n**Status:** done\n');
		expect(
			deriveStatus(base(done, { prs: [{ number: 3, state: 'open', draft: false }] }))
		).toMatchObject({ status: 'done', source: { rule: 1 } });
	});

	it('2: an open PR, even over a branch and the meta line', () => {
		const d = deriveStatus(
			base(TODO, {
				branches: [branch('feat/nw9-dxf')],
				prs: [
					{ number: 6, state: 'merged', draft: false },
					{ number: 7, state: 'open', draft: true }
				]
			})
		);
		expect(d).toMatchObject({
			status: 'in review',
			source: { rule: 2, detail: 'PR #7 open as a draft' }
		});
	});

	it('3: todo or blocked on main, with an active branch or a branch copy in progress', () => {
		const d = deriveStatus(
			base(BLOCKED, {
				branches: [
					branch('feat/a1b-old', true, '2026-10-01'),
					branch('feat/a1b-new', true, '2026-10-09')
				]
			})
		);
		expect(d).toMatchObject({
			status: 'in progress',
			blocked: true,
			waiting: 'the bank account',
			source: { rule: 3, detail: 'branch feat/a1b-new' }
		});
		const copy = one('### NW9 DXF\n**Status:** in progress\n');
		expect(
			deriveStatus(base(TODO, { copies: [{ branch: 'feat/x', item: copy, text: 'x' }] })).source
		).toMatchObject({ rule: 3, detail: 'in progress on feat/x' });
		expect(deriveStatus(base(BARE, { branches: [branch('feat/c9-x')] })).status).toBe(
			'in progress'
		);
	});

	it('3 needs the branch to be active', () => {
		expect(deriveStatus(base(TODO, { branches: [branch('feat/nw9-old', false)] }))).toMatchObject({
			status: 'todo',
			source: { rule: 4 }
		});
	});

	it('4: the meta line beats the plan task, and says so', () => {
		const d = deriveStatus(base(BUILT, { tasks: [task('35', 'done')] }));
		expect(d).toMatchObject({ status: 'built', source: { rule: 4 } });
		expect(d.disagreements).toEqual(['NW7: backlog says built, plan task 35 says done']);
		expect(d.hints).toEqual(['all plan tasks done; still in backlog']);
	});

	it('5: with no meta line, the least advanced linked task', () => {
		const d = deriveStatus(
			base(BARE, { tasks: [task('3', 'done'), task('4', 'built'), task('5', 'unknown')] })
		);
		expect(d).toMatchObject({ status: 'built', source: { rule: 5, detail: 'plan task 4' } });
		expect(d.disagreements).toEqual([]);
		expect(deriveStatus(base(BARE, { tasks: [task('6', 'skipped')] })).status).toBe('done');
	});

	it('6: otherwise todo', () => {
		expect(deriveStatus(base(BARE))).toMatchObject({ status: 'todo', source: { rule: 6 } });
	});
});

describe('deriveStatus: disagreements and diffs', () => {
	it('blocked against todo is not a disagreement, nor in review against in progress', () => {
		expect(deriveStatus(base(BLOCKED, { tasks: [task('9', 'todo')] })).disagreements).toEqual([]);
		const review = one('### X2 Y\n**Status:** in review\n');
		expect(deriveStatus(base(review, { tasks: [task('9', 'in progress')] })).disagreements).toEqual(
			[]
		);
	});

	it('lists the branch copies that differ from main', () => {
		const d = deriveStatus(
			base(TODO, {
				text: 'main text',
				copies: [
					{ branch: 'feat/a', item: TODO, text: 'main text' },
					{ branch: 'feat/b', item: TODO, text: 'changed' }
				]
			})
		);
		expect(d.differs.map((c) => c.branch)).toEqual(['feat/b']);
	});
});

describe('deriveStatus on the fixtures', () => {
	const bp = parseBacklog(fixture('orchard', 'backlog.md'));
	const bpPlan = parseProgress(fixture('orchard', 'PROGRESS.md'));
	const tasksOf = (it: Item) => it.meta!.plan.map((n) => bpPlan.byNumber.get(n)!).filter(Boolean);
	const status = (id: string) => {
		const it = bp.items.find((i) => i.id === id)!;
		return deriveStatus(base(it, { tasks: tasksOf(it) }));
	};

	it('orchard NW7: built, and the disagreement with task 35 is reported', () => {
		const d = status('NW7');
		expect(d.status).toBe('built');
		expect(d.disagreements).toEqual(['NW7: backlog says built, plan task 35 says done']);
	});

	it('orchard F9: the item is in progress though its task built phases 1-5', () => {
		const d = status('F9');
		expect(d.status).toBe('in progress');
		expect(d.disagreements).toEqual(['F9: backlog says in progress, plan task 26 says built']);
	});

	it('orchard: every disagreement on main', () => {
		const all = bp.items.flatMap((it) => status(it.id).disagreements);
		expect(all).toMatchSnapshot();
	});

	it('lantern 5.8: todo on main, in progress through the sketch branch', () => {
		const fm = parseBacklog(fixture('lantern', 'backlog.md'));
		const it = fm.items.find((i) => i.id === '5.8')!;
		const d = deriveStatus(base(it, { branches: [branch('feat/sketch-editor')] }));
		expect(d).toMatchObject({
			status: 'in progress',
			source: { detail: 'branch feat/sketch-editor' }
		});
	});
});
