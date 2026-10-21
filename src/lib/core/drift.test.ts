import { describe, expect, it } from 'vitest';
import { drift, driftAsk, driftLabel, driftText, type DriftItem } from './drift.ts';

const NOW = Date.parse('2026-10-21T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const item = (over: Partial<DriftItem> = {}): DriftItem => ({
	id: 'PM40',
	status: 'in progress',
	branches: [],
	openPr: false,
	...over
});
const branch = (h: number, name = 'feat/pm40-trust') => ({
	name,
	committedAt: hoursAgo(h),
	active: true
});

describe('drift: stalled', () => {
	it('flags an in-progress item whose newest branch commit is older than the limit', () => {
		expect(
			drift([item({ branches: [branch(30), branch(50, 'feat/pm40-old')] })], [], [], 24, NOW)
		).toEqual({
			PM40: [{ kind: 'stalled', hours: 30, branch: 'feat/pm40-trust' }]
		});
		expect(drift([item({ branches: [branch(3)] })], [], [], 24, NOW)).toEqual({});
	});

	it('flags one in progress with no branch, from when it went in progress', () => {
		const changes = [{ id: 'PM40', from: 'todo', to: 'in progress', at: hoursAgo(72) }];
		expect(drift([item()], [], changes, 24, NOW)).toEqual({
			PM40: [{ kind: 'stalled', hours: 72, branch: null }]
		});
		expect(drift([item()], [], [], 24, NOW)).toEqual({});
	});
});

describe('drift: merged but not moved', () => {
	const pr = (h: number, over = {}) => ({
		number: 7,
		at: hoursAgo(h),
		head: 'feat/other',
		backlog: ['PM40'],
		...over
	});

	it('flags an item still in progress after a PR naming it merged, past the grace hour', () => {
		expect(drift([item({ branches: [branch(5)] })], [pr(4)], [], 24, NOW)).toEqual({
			PM40: [{ kind: 'merged', pr: 7, status: 'in progress' }]
		});
		expect(
			drift(
				[item({ status: 'in review' })],
				[pr(4, { backlog: [], head: 'feat/pm40-x' })],
				[],
				24,
				NOW
			)
		).toEqual({
			PM40: [{ kind: 'merged', pr: 7, status: 'in review' }]
		});
	});

	it('ignores a PR citing many items, and Project Magic’s own edits', () => {
		const tidy = pr(4, { backlog: ['PM40', 'PM1', 'PM2', 'PM3', 'PM4', 'PM5'], head: 'docs/tidy' });
		expect(drift([item()], [tidy], [], 24 * 10, NOW)).toEqual({});
		expect(drift([item()], [pr(4, { head: 'projectmagic' })], [], 24 * 10, NOW)).toEqual({});
	});

	it('leaves work that went on after the merge, an open PR, and a merge within the hour', () => {
		expect(drift([item({ branches: [branch(2)] })], [pr(4)], [], 24, NOW)).toEqual({});
		expect(drift([item({ openPr: true })], [pr(4)], [], 24, NOW)).toEqual({});
		expect(drift([item()], [pr(0.5)], [], 24, NOW)).toEqual({});
	});
});

describe('drift: done without a merge', () => {
	const done = (from: string, h = 10) => [{ id: 'PM40', from, to: 'done', at: hoursAgo(h) }];

	it('flags an item done after work was under way, with no merged PR naming it', () => {
		expect(drift([item({ status: 'done' })], [], done('built'), 24, NOW)).toEqual({
			PM40: [{ kind: 'unmerged' }]
		});
	});

	it('leaves one done straight from todo, one done long ago, and one a PR names', () => {
		expect(drift([item({ status: 'done' })], [], done('todo'), 24, NOW)).toEqual({});
		expect(drift([item({ status: 'done' })], [], done('built', 24 * 20), 24, NOW)).toEqual({});
		const pr = { number: 3, at: hoursAgo(30), head: 'x', backlog: ['pm40'] };
		expect(drift([item({ status: 'done' })], [pr], done('built'), 24, NOW)).toEqual({});
	});
});

describe('drift text', () => {
	it('labels, explains and asks', () => {
		const stalled = { kind: 'stalled' as const, hours: 60, branch: 'feat/pm40-trust' };
		expect(driftLabel(stalled)).toBe('stalled 2 days');
		expect(driftText(stalled)).toBe(
			'In progress, but `feat/pm40-trust` has had no commit for 2 days.'
		);
		expect(driftAsk('PM40', { kind: 'merged', pr: 7, status: 'in progress' })).toMatch(
			/^PR #7 is merged, but PM40 still says in progress\./
		);
		expect(driftAsk('PM40', { kind: 'unmerged' })).toContain('"Backlog: PM40"');
	});
});
