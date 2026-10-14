import { describe, expect, it } from 'vitest';
import { fixture, type FixtureRepo } from './fixtures';
import { parseProgress, parseStatusCell, type Plan } from './progress';

describe('parseStatusCell', () => {
	it.each([
		['done', 'done', ''],
		['**done**: passed on 18.6', 'done', 'passed on 18.6'],
		['**done** except the room plan *drawing*', 'done', 'except the room plan *drawing*'],
		['**done: sorting only**; filtering is BP3', 'done', 'sorting only; filtering is BP3'],
		['built*', 'built', ''],
		['built\\* — waiting on CAD', 'built', 'waiting on CAD'],
		['In Progress, phase 6', 'in progress', 'phase 6'],
		['skipped', 'skipped', ''],
		['todone', 'unknown', 'todone'],
		['Yes', 'unknown', 'Yes'],
		['', 'unknown', '']
	])('%j', (raw, status, note) => expect(parseStatusCell(raw)).toEqual({ status, note }));
});

const SAMPLE = `# Plan

| # | Not a plan table |
|---|---|
| 1 | ignored |

## Phase 1: one

| # | Task | Status |
|---|------|--------|
| 1 | First | **done** |
| 2 | Second \`code\` | built* |
| 3 | Third | maybe |

## v2

| #  | Task | Spec | Status |
|----|------|------|--------|
| 2  | Second again | a.md | todo |
| 4  | Fourth | b.md | in progress |
`;

describe('parseProgress on a sample', () => {
	const p = parseProgress(SAMPLE);

	it('reads only plan tables, with groups and every column', () => {
		expect(p.tasks.map((t) => [t.number, t.group, t.status, t.superseded])).toEqual([
			['1', 'Phase 1: one', 'done', false],
			['2', 'Phase 1: one', 'built', true],
			['3', 'Phase 1: one', 'unknown', false],
			['2', 'v2', 'todo', false],
			['4', 'v2', 'in progress', false]
		]);
		expect(p.tasks[1].title).toBe('Second `code`');
		expect(p.tasks[3].cells.map((c) => c.header)).toEqual(['#', 'Task', 'Spec', 'Status']);
		expect(p.tasks[3].line).toBe(19);
	});

	it('lets the later table win', () => {
		expect(p.byNumber.get('2')!.title).toBe('Second again');
		expect(p.groups.map((g) => [g.title, g.done, g.total])).toEqual([
			['Phase 1: one', 1, 2],
			['v2', 0, 2]
		]);
	});

	it('finds the next task and the unknown ones', () => {
		expect(p.next!.number).toBe('2');
		expect(p.unknown.map((t) => t.number)).toEqual(['3']);
	});
});

function summary(p: Plan) {
	return {
		groups: p.groups,
		next: p.next?.number ?? null,
		tasks: p.tasks.map((t) => ({
			number: t.number,
			line: t.line,
			group: t.group,
			status: t.status,
			superseded: t.superseded || undefined,
			title: t.title.length > 80 ? t.title.slice(0, 80) + '…' : t.title,
			note: t.note.length > 80 ? t.note.slice(0, 80) + '…' : t.note
		}))
	};
}

describe.each([
	['orchard', 'main'],
	['lantern', 'main'],
	['lantern', 'feat-sketch-editor']
] as [FixtureRepo, string][])('%s PROGRESS.md on %s', (repo, ref) => {
	const p = parseProgress(fixture(repo, 'PROGRESS.md', ref));

	it('matches its golden summary', async () => {
		await expect(JSON.stringify(summary(p), null, '\t') + '\n').toMatchFileSnapshot(
			`../../../test/golden/${repo}-${ref}-progress.json`
		);
	});

	it('has no unknown status cells', () => expect(p.unknown).toEqual([]));
});

describe('the fixtures in particular', () => {
	it('orchard: v2 restarts the numbering, and the later table wins', () => {
		const p = parseProgress(fixture('orchard', 'PROGRESS.md'));
		expect(p.byNumber.get('9')!.title).toMatch(/^Catalogue sorting and filtering/);
		expect(p.byNumber.get('46')!.status).toBe('built');
		expect(p.byNumber.get('35')!.status).toBe('done');
		expect(p.next!.status).toBe('todo');
	});

	it('lantern: rows only on the sketch branch', () => {
		const main = parseProgress(fixture('lantern', 'PROGRESS.md'));
		const branch = parseProgress(fixture('lantern', 'PROGRESS.md', 'feat-sketch-editor'));
		for (const n of ['3.7', '5.7', '5.8', '5.9', '5.10', '5.11']) {
			expect(main.byNumber.has(n)).toBe(false);
			expect(branch.byNumber.has(n)).toBe(true);
		}
		expect(branch.byNumber.get('2.6')!.status).toBe('in progress');
	});
});
