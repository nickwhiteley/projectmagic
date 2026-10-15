import { describe, expect, it } from 'vitest';
import { parseBlob } from '../server/sync.ts';
import { parseConfig } from './config.ts';
import { fixture, type FixtureRepo } from './fixtures.ts';
import {
	assembleState,
	type PrInfo,
	type RefInput,
	type StoredBacklog,
	type StoredPlan
} from './state.ts';

const NOW = Date.parse('2026-10-14T12:00:00Z');

function ref(over: Partial<RefInput> & { name: string }): RefInput {
	return {
		headOid: `oid-${over.name}`,
		committedAt: '2026-10-13T10:00:00Z',
		ahead: 0,
		behind: 0,
		active: true,
		message: `last commit on ${over.name}`,
		prs: [],
		backlog: null,
		plan: null,
		...over
	};
}
const backlog = (repo: FixtureRepo, refName = 'main') =>
	parseBlob('backlog', fixture(repo, 'backlog.md', refName), repo, 'main') as StoredBacklog;
const plan = (repo: FixtureRepo, refName = 'main') =>
	parseBlob('progress', fixture(repo, 'PROGRESS.md', refName), repo, 'main') as StoredPlan;
const pr = (number: number, head: string, state: PrInfo['state'] = 'OPEN'): PrInfo => ({
	number,
	title: `PR ${number}`,
	body: null,
	state,
	isDraft: false,
	url: `https://github.com/x/y/pull/${number}`,
	baseRefName: 'main',
	headRefName: head,
	createdAt: '2026-10-10T00:00:00Z',
	mergedAt: null
});

describe('assembleState: lantern', () => {
	const config = parseConfig(fixture('lantern', '.projectmagic.yml'), {
		name: 'lantern',
		defaultBranch: 'main'
	});
	const s = assembleState({
		owner: 'nickwhiteley',
		repo: 'lantern',
		config: config.config,
		configWarnings: config.warnings,
		refs: [
			ref({ name: 'main', backlog: backlog('lantern'), plan: plan('lantern') }),
			ref({
				name: 'feat/sketch-editor',
				ahead: 1,
				behind: 7,
				plan: plan('lantern', 'feat-sketch-editor')
			}),
			ref({
				name: 'fix/assistant-start-errors',
				ahead: 2,
				behind: 19,
				prs: [pr(66, 'fix/assistant-start-errors')]
			}),
			ref({ name: 'vercel', ahead: 3, behind: 11 }),
			ref({ name: 'feat/comments', ahead: 0, behind: 58, active: false })
		],
		done: [],
		lastSyncAt: null,
		lastError: null,
		now: NOW
	});
	const item = (id: string) => s.items.find((i) => i.id === id)!;

	it('derives each item’s status, and says where it came from', () => {
		expect(item('5.8')).toMatchObject({
			status: 'in progress',
			statusSource: { rule: 3, detail: 'branch feat/sketch-editor' }
		});
		expect(item('5.8').tasks.map((t) => t.number)).toEqual(['5.8']);
		expect(item('9.1')).toMatchObject({ status: 'blocked', blocked: true });
		expect(item('2.6')).toMatchObject({ status: 'in progress', statusSource: { rule: 4 } });
		expect(s.items.map((i) => `${i.id} ${i.status}`)).toMatchSnapshot();
	});

	it('lists unlinked active branches first after main, and stale ones last', () => {
		expect(s.branches.map((b) => [b.name, b.unlinked, b.items])).toEqual([
			['main', false, []],
			['fix/assistant-start-errors', true, []],
			['vercel', true, []],
			// In the backlog's own order, which is its priority.
			['feat/sketch-editor', false, ['5.8', '5.7', '5.9', '5.10', '5.11']],
			['feat/comments', false, []]
		]);
	});

	it('has a plan with linked items, and one real disagreement', () => {
		expect(s.plan!.next).toBe('0.4');
		expect(s.plan!.tasks.find((t) => t.number === '9.1')!.items).toEqual(['9.1']);
		expect(s.health).toMatchObject({ warnings: [], dangling: [], unknownTasks: [] });
		// main's PROGRESS.md still says todo; only the sketch branch says in progress.
		expect(s.health.disagreements).toEqual([
			'2.6: backlog says in progress, plan task 2.6 says todo'
		]);
		expect(s.preambleText).toMatch(/^# /);
	});
});

describe('assembleState: orchard', () => {
	const config = parseConfig(fixture('orchard', '.projectmagic.yml'), {
		name: 'orchard',
		defaultBranch: 'main'
	});
	const main = backlog('orchard');
	// A pending edit: NW9's meta changed on the projectmagic branch.
	const edited = structuredClone(main);
	const nw9 = edited.items.find((i) => i.id === 'NW9')!;
	nw9.source = nw9.source.replace('**Status:** built', '**Status:** done');
	const s = assembleState({
		owner: 'nickwhiteley',
		repo: 'orchard',
		config: config.config,
		configWarnings: [],
		refs: [
			ref({ name: 'main', backlog: main, plan: plan('orchard') }),
			ref({ name: 'projectmagic', ahead: 1, backlog: edited, prs: [pr(41, 'projectmagic')] })
		],
		done: [
			{
				itemId: 'B5',
				title: 'Client share link',
				lastBody: '…',
				removedOid: 'eb631d4',
				removedAt: '2026-10-09T10:00:00Z',
				prNumber: 31
			},
			{
				itemId: 'C7',
				title: 'Analytics',
				lastBody: '…',
				removedOid: '0e577f9',
				removedAt: '2026-09-22T10:00:00Z',
				prNumber: 4
			},
			{
				itemId: 'B9',
				title: 'A test item',
				lastBody: '…',
				removedOid: '5d0c1a2',
				removedAt: '2026-10-12T10:00:00Z',
				prNumber: null,
				deleted: { by: 'nickwhiteley', at: '2026-10-12T10:00:02Z' }
			}
		],
		lastSyncAt: null,
		lastError: null,
		now: NOW
	});

	it('reports NW7’s disagreement with its plan task', () => {
		expect(s.health.disagreements).toContain('NW7: backlog says built, plan task 35 says done');
	});

	it('marks the pending edit, without the edit PR moving the item to in review', () => {
		const v = s.items.find((i) => i.id === 'NW9')!;
		expect(v).toMatchObject({ pending: true, status: 'built' });
		expect(s.items.filter((i) => i.pending).map((i) => i.id)).toEqual(['NW9']);
		expect(s.branches.find((b) => b.name === 'projectmagic')).toMatchObject({
			isEdits: true,
			unlinked: false
		});
	});

	it('lists done items: unpruned first, then shipped, newest first', () => {
		expect(s.done.map((d) => [d.id, d.unpruned])).toEqual([
			['B4', true],
			['B12', true],
			['NW2', true],
			['NW3', true],
			['NW4', true],
			['E2', true],
			['NW10', true],
			['B5', false],
			['C7', false]
		]);
	});

	it('keeps a deleted item out of done, and its id out of reach of new items (PM24)', () => {
		expect(s.deleted).toEqual([
			{
				id: 'B9',
				title: 'A test item',
				at: '2026-10-12T10:00:00Z',
				commit: '5d0c1a2',
				by: 'nickwhiteley',
				body: '…'
			}
		]);
		expect(s.done.map((d) => d.id)).not.toContain('B9');
		expect(s.usedIds).toContain('B9');
	});
});
