import { describe, expect, it } from 'vitest';
import {
	changeFailure,
	delivery,
	EDITS_PR_TITLE,
	founderQueue,
	isoOf,
	itemTimes,
	leadTimes,
	mainHealth,
	median,
	prFacts,
	restores,
	sizeWeight,
	weekly,
	weekOf,
	type DeployEvent,
	type PrEvent,
	type RunEvent
} from './delivery.ts';
import { emptyHistory, statusChanges } from './history.ts';

const NOW = Date.parse('2026-10-16T12:00:00Z'); // a Friday
const dep = (id: string, at: string, sha = id, state = 'success'): DeployEvent => ({
	id,
	at,
	sha,
	environment: 'Production – x',
	state
});
const pr = (n: number, over: Partial<PrEvent> = {}): PrEvent => ({
	number: n,
	title: `PR ${n}`,
	at: '2026-10-14T10:00:00Z',
	sha: `m${n}`,
	createdAt: '2026-10-14T08:00:00Z',
	firstCommitAt: '2026-10-14T06:00:00Z',
	head: `feat/x${n}`,
	bug: false,
	backlog: [],
	...over
});

describe('prFacts', () => {
	it('reads Bug: production and the items cited with Backlog:', () => {
		expect(prFacts('Fixes it.\n\nBug: production\nBacklog: BP12, 5.8 and nonsense!')).toEqual({
			bug: true,
			backlog: ['BP12', '5.8']
		});
		expect(prFacts('Bug: preview')).toEqual({ bug: false, backlog: [] });
		expect(prFacts(null)).toEqual({ bug: false, backlog: [] });
	});
});

describe('weeks', () => {
	it('starts a week on Monday, UTC', () => {
		expect(weekOf('2026-10-16T12:00:00Z')).toBe('2026-10-12');
		expect(weekOf('2026-10-18T23:59:00Z')).toBe('2026-10-12');
		expect(weekOf('2026-10-19T00:00:00Z')).toBe('2026-10-19');
	});
	it('totals by week with a 4-week rolling mean, empty weeks as zero', () => {
		const w = weekly(
			[
				{ at: '2026-10-14T10:00:00Z' },
				{ at: '2026-10-15T10:00:00Z' },
				{ at: '2026-10-05T10:00:00Z', weight: 3 }
			],
			NOW,
			3
		);
		expect(w.map((p) => [p.week, p.value])).toEqual([
			['2026-09-28', 0],
			['2026-10-05', 3],
			['2026-10-12', 2]
		]);
		expect(w[2].rolling).toBe((0 + 0 + 3 + 2) / 4);
	});
});

describe('deploys', () => {
	it('leaves out deploys of a Project Magic edit', () => {
		const prs = [pr(1, { title: EDITS_PR_TITLE, sha: 'edit' }), pr(2)];
		const d = delivery({
			deploys: [dep('a', '2026-10-14T12:00:00Z', 'm2'), dep('b', '2026-10-15T12:00:00Z', 'edit')],
			prs,
			runs: [],
			changes: [],
			shipped: [],
			items: [],
			raisedOf: () => null,
			now: NOW
		});
		expect(d.realDeploys).toBe(1);
		expect(d.editDeploysLeftOut).toBe(1);
		expect(d.deploysThisWeek).toBe(1);
	});

	it('times lead from the first commit to the deploy of the merge, or the next one', () => {
		const t = leadTimes(
			[pr(1), pr(2, { sha: 'unseen', at: '2026-10-14T13:00:00Z' }), pr(3, { firstCommitAt: null })],
			[dep('a', '2026-10-14T12:00:00Z', 'm1'), dep('b', '2026-10-15T06:00:00Z', 'zzz')]
		);
		expect(t.map((x) => [x.pr.number, x.deploy.id, x.hours])).toEqual([
			[1, 'a', 6],
			[2, 'b', 24]
		]);
		expect(median(t.map((x) => x.hours))).toBe(15);
	});

	it('ignores deploys that did not succeed', () => {
		const t = leadTimes([pr(1)], [dep('a', '2026-10-14T12:00:00Z', 'm1', 'failure')]);
		expect(t).toEqual([]);
	});
});

describe('change failure: counts until the denominator is 10', () => {
	const many = (n: number) =>
		Array.from({ length: n }, (_, i) =>
			dep(`d${i}`, `2026-10-${String(10 + (i % 5)).padStart(2, '0')}T10:00:00Z`)
		);
	it('is a count with few deploys', () => {
		expect(changeFailure([pr(1, { bug: true })], many(7), NOW)).toEqual({
			count: 1,
			of: 7,
			rate: null
		});
	});
	it('is a rate with 10 or more', () => {
		expect(changeFailure([pr(1, { bug: true }), pr(2)], many(10), NOW)).toEqual({
			count: 1,
			of: 10,
			rate: 0.1
		});
	});
	it('ignores bug PRs older than four weeks', () => {
		expect(
			changeFailure([pr(1, { bug: true, at: '2026-08-01T00:00:00Z' })], many(10), NOW).count
		).toBe(0);
	});
});

describe('time to restore', () => {
	it('starts at the item’s Raised date, else the fix’s first commit', () => {
		const prs = [
			pr(1, { bug: true, backlog: ['BUG1'], at: '2026-10-14T10:00:00Z' }),
			pr(2, { bug: true, at: '2026-10-15T10:00:00Z', firstCommitAt: '2026-10-15T08:00:00Z' })
		];
		const r = restores(
			prs,
			[dep('a', '2026-10-14T12:00:00Z', 'm1'), dep('b', '2026-10-15T12:00:00Z', 'm2')],
			(id) => (id === 'BUG1' ? '2026-10-14T06:00:00Z' : null)
		);
		expect(r.map((x) => [x.pr.number, x.fromKind, x.hours])).toEqual([
			[2, 'first commit', 4],
			[1, 'raised', 6]
		]);
	});
	it('has no time when nothing has deployed it yet', () => {
		expect(restores([pr(1, { bug: true })], [], () => null)[0].hours).toBeNull();
	});
});

describe('throughput and sizes', () => {
	it('weights S, M and L, and takes the midpoint of a range', () => {
		expect([
			sizeWeight('S'),
			sizeWeight('M'),
			sizeWeight('L'),
			sizeWeight('S–M'),
			sizeWeight('M-L')
		]).toEqual([1, 3, 8, 2, 5.5]);
		expect(sizeWeight(null)).toBe(3);
	});
});

describe('the founder queue', () => {
	const items = [
		{ id: 'A', title: 'a', status: 'built', waiting: 'your check', assignee: null },
		{ id: 'B', title: 'b', status: 'blocked', waiting: null, assignee: 'person.nick' },
		{ id: 'C', title: 'c', status: 'todo', waiting: 'x', assignee: null },
		{ id: 'D', title: 'd', status: 'built', waiting: null, assignee: 'agent' }
	];
	it('lists built and blocked items waiting on a person, oldest first, with the days since', () => {
		const q = founderQueue(
			items,
			[
				{ id: 'A', from: 'todo', to: 'built', at: '2026-10-10T12:00:00Z' },
				{ id: 'A', from: 'built', to: 'built', at: '2026-10-12T12:00:00Z' },
				{ id: 'B', from: 'todo', to: 'blocked', at: '2026-10-01T12:00:00Z' }
			],
			NOW
		);
		expect(q.map((x) => [x.id, x.days])).toEqual([
			['B', 15],
			['A', 4]
		]);
	});
	it('says nothing about age when history does not know', () => {
		expect(founderQueue(items, [], NOW).every((x) => x.days === null)).toBe(true);
	});
});

describe('item lead and cycle time', () => {
	it('measures from arrival and from the first in progress to shipping', () => {
		const t = itemTimes(
			[
				{ id: 'A', from: null, to: 'todo', at: '2026-10-01T00:00:00Z' },
				{ id: 'A', from: 'todo', to: 'in progress', at: '2026-10-05T00:00:00Z' },
				{ id: 'B', from: null, to: 'todo', at: '2026-10-02T00:00:00Z' }
			],
			[
				{ id: 'A', at: '2026-10-09T00:00:00Z' },
				{ id: 'B', at: '2026-10-12T00:00:00Z' },
				{ id: 'Z', at: '2026-10-12T00:00:00Z' }
			]
		);
		expect(t).toEqual([
			{ id: 'A', lead: 8, cycle: 4 },
			{ id: 'B', lead: 10, cycle: null }
		]);
	});
	it('comes from the history walk: arrival, changes and removal', () => {
		const at = (status: string | null, date: string) => ({
			oid: date,
			date,
			pr: null,
			text: status ? `## Now\n\n### A1 Thing\n**Status:** ${status}\n` : '## Now\n'
		});
		const changes = statusChanges(emptyHistory(), [
			at('todo', '2026-10-01T00:00:00Z'),
			at('in progress', '2026-10-02T00:00:00Z'),
			at(null, '2026-10-03T00:00:00Z')
		]);
		expect(changes.map((c) => [c.id, c.from, c.to])).toEqual([
			['A1', null, 'todo'],
			['A1', 'todo', 'in progress'],
			['A1', 'in progress', null]
		]);
	});
});

describe('main health: a run that never started is not a failure', () => {
	const run = (id: string, at: string, conclusion: string, started = true): RunEvent => ({
		id,
		at,
		sha: id,
		conclusion,
		started
	});
	it('leaves unstarted runs out and says how many', () => {
		const h = mainHealth(
			[
				run('1', '2026-10-10T00:00:00Z', 'success'),
				run('2', '2026-10-11T00:00:00Z', 'failure', false),
				run('3', '2026-10-12T00:00:00Z', 'failure'),
				run('4', '2026-10-13T00:00:00Z', 'success')
			],
			NOW
		);
		expect(h).toMatchObject({ runs: 3, failed: 1, unstarted: 1, failRate: null, redNow: null });
		expect(h.longestRed).toBe(24);
	});
	it('says how long main has been red', () => {
		const h = mainHealth(
			[run('1', '2026-10-16T00:00:00Z', 'failure'), run('2', '2026-10-16T06:00:00Z', 'failure')],
			NOW
		);
		expect(h.redNow).toBe(12);
	});
});

describe('median', () => {
	it('works for odd, even and none', () => {
		expect([median([3, 1, 2]), median([1, 2, 3, 4]), median([])]).toEqual([2, 2.5, null]);
	});
});

describe('isoOf', () => {
	it('reads the dates an item’s Raised: holds', () => {
		expect(isoOf('2026-10-14 09:30')).toBe('2026-10-14T09:30:00.000Z');
		expect(isoOf('2026-10-14')).toBe('2026-10-14T00:00:00.000Z');
		expect(isoOf('2026-10-14T09:30:00+01:00')).toBe('2026-10-14T08:30:00.000Z');
		expect(isoOf('last Tuesday')).toBeNull();
		expect(isoOf(null)).toBeNull();
	});
});
