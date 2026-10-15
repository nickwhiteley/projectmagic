import { describe, expect, it } from 'vitest';
import { activity } from './activity.ts';
import type { ProjectState } from './state.ts';

const NOW = Date.parse('2026-10-14T12:00:00Z');

const branch = (over: object) => ({
	name: 'feat/x',
	isMain: false,
	isEdits: false,
	isDeploy: false,
	active: true,
	committedAt: '2026-10-14T10:00:00Z',
	message: 'a commit',
	items: [] as string[],
	prs: [] as { number: number }[],
	...over
});

const state = (repo: string, over: object): ProjectState =>
	({
		repo,
		name: repo.toUpperCase(),
		items: [{ id: 'B1', titleText: 'Invoices' }],
		done: [],
		branches: [],
		...over
	}) as unknown as ProjectState;

describe('activity', () => {
	const groups = activity(
		[
			state('a', {
				branches: [
					branch({ name: 'feat/b1', items: ['B1'], message: 'Add invoices', prs: [{ number: 7 }] }),
					branch({ name: 'spike/y', committedAt: '2026-10-13T09:00:00Z', message: 'Try a thing' }),
					branch({ name: 'projectmagic', isEdits: true }),
					branch({ name: 'vercel', isDeploy: true }),
					branch({ name: 'old', committedAt: '2026-08-01T00:00:00Z' }),
					branch({ name: 'gone', active: false })
				],
				done: [
					{ id: 'B1', title: 'Invoices', at: '2026-10-14T11:00:00Z', pr: 6 },
					{ id: 'B0', title: 'Old', at: '2026-07-01T00:00:00Z', pr: null }
				]
			}),
			state('b', {
				branches: [branch({ name: 'fix/z', committedAt: '2026-10-14T11:30:00Z', message: 'Fix z' })]
			})
		],
		NOW
	);

	it('groups events by linked item, newest group first', () => {
		expect(groups.map((g) => [g.repo, g.itemId])).toEqual([
			['b', null],
			['a', 'B1'],
			['a', null]
		]);
		const b1 = groups[1];
		expect(b1.itemTitle).toBe('Invoices');
		expect(b1.events.map((e) => [e.kind, e.text, e.pr])).toEqual([
			['shipped', 'B1 shipped', 6],
			['commit', 'Add invoices', 7]
		]);
	});
	it('leaves out edits and deployment branches, inactive branches and anything older than 14 days', () => {
		const text = groups.flatMap((g) => g.events.map((e) => e.branch ?? e.text));
		expect(text).not.toContain('projectmagic');
		expect(text).not.toContain('vercel');
		expect(text).not.toContain('old');
		expect(text).not.toContain('gone');
		expect(text).not.toContain('B0 shipped');
	});
});
