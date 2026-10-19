import { describe, expect, it } from 'vitest';
import { parseConfig } from '#lib/core/config.ts';
import { assembleState, type PrInfo, type StoredBacklog } from '#lib/core/state.ts';
import { epicChoices, epicMembers, itemLinks, withCrossWaits, type Neighbour } from './cross.ts';
import type { ProjectRow } from './projects.ts';
import { parseBlob } from './sync.ts';

// Three repositories of one tenant (PM36): a person service that owns the change, and two that
// take part in it.
function state(repo: string, text: string, prs: Partial<PrInfo>[] = [], done: string[] = []) {
	return assembleState({
		owner: 'nw',
		repo,
		config: parseConfig(null, { name: repo, defaultBranch: 'main' }).config,
		configWarnings: [],
		refs: [
			{
				name: 'main',
				headOid: 'a',
				committedAt: '2026-10-19T10:00:00Z',
				ahead: 0,
				behind: 0,
				active: true,
				message: 'm',
				prs: [],
				backlog: parseBlob('backlog', text, repo, 'main') as StoredBacklog,
				plan: null
			},
			...prs.map((p, i) => ({
				name: `feat/x${i}`,
				headOid: `b${i}`,
				committedAt: '2026-10-19T10:00:00Z',
				ahead: 1,
				behind: 0,
				active: true,
				message: 'm',
				prs: [
					{
						number: i + 1,
						title: 'A PR',
						body: null,
						state: 'OPEN' as const,
						isDraft: false,
						url: `https://github.com/nw/${repo}/pull/${i + 1}`,
						baseRefName: 'main',
						headRefName: `feat/x${i}`,
						createdAt: '2026-10-19T10:00:00Z',
						mergedAt: null,
						...p
					}
				],
				backlog: null,
				plan: null
			}))
		],
		done: done.map((body, i) => ({
			itemId: body.match(/### (\S+)/)![1],
			title: 'Shipped one',
			lastBody: body,
			removedOid: `c${i}`,
			removedAt: '2026-10-18T00:00:00Z',
			prNumber: null
		})),
		lastSyncAt: null,
		lastError: null,
		now: Date.parse('2026-10-19T12:00:00Z')
	});
}

const row = (repo: string): ProjectRow =>
	({ id: repo, tenantId: 't', hidden: false, owner: 'nw', repo, param: repo }) as ProjectRow;

const person = state(
	'person-service',
	`# Backlog

### EP1 Person service
**Status:** todo

### PS1 The service
**Status:** in progress · **Epic:** EP1
`
);
const bloom = state(
	'bloomprint',
	`# Backlog

### BP40 Use the person service
**Status:** todo · **Epic:** person-service:EP1

### BP41 Wait for plinth
**Status:** todo · **Waiting:** plinth:PL4 being released

### BP42 Wait for something shipped
**Status:** todo · **Waiting:** plinth:PL3
`,
	[{ body: 'Backlog: person-service:PS1, BP40' }]
);
const plinth = state(
	'plinth',
	`# Backlog

### PL4 Release
**Status:** in progress · **Epic:** \`Person-Service:ep1\`
`,
	[],
	['### PL3 Old\n**Status:** done · **Epic:** person-service:EP1\n']
);

const ns = (visible = true): Neighbour[] => [
	{ project: row('bloomprint'), state: bloom, visible },
	{ project: row('plinth'), state: plinth, visible }
];

describe('cross-repository epics (PM36)', () => {
	it('finds the other repositories’ items in an epic, shipped ones included', () => {
		const m = epicMembers(ns(), row('person-service')).get('EP1')!;
		expect(m.map((x) => [x.repo, x.id, x.status, x.shipped])).toEqual([
			['bloomprint', 'BP40', 'in review', false], // its PR is open
			['plinth', 'PL4', 'in progress', false],
			['plinth', 'PL3', 'done', true]
		]);
		expect(m[0]).toMatchObject({
			title: 'Use the person service',
			href: '/p/bloomprint/i/BP40'
		});
	});

	it('names an item in a repository this person can’t open, without its title', () => {
		const m = epicMembers(ns(false), row('person-service')).get('EP1')!;
		expect(m.every((x) => x.title === null)).toBe(true);
	});

	it('leaves the other repositories’ items out of the owner’s own roll-up', () => {
		expect(bloom.epics).toEqual([]);
		expect(person.epics.find((e) => e.id === 'EP1')!.items).toEqual(['PS1']);
	});

	it('suggests the other repositories’ declared epics for the Epic field, once each', () => {
		const choices = epicChoices(
			[{ id: 'person-service:EP1', title: null }],
			[{ project: row('person-service'), state: person, visible: true }]
		);
		expect(choices).toEqual([{ id: 'person-service:EP1', title: 'Person service' }]);
	});
});

describe('waiting on another repository’s item (PM36)', () => {
	it('marks the item blocked, with a hint, until that item is done', () => {
		const s = withCrossWaits(bloom, ns(), row('bloomprint'));
		const it = (id: string) => s.items.find((i) => i.id === id)!;
		expect(it('BP41').blocked).toBe(true);
		expect(it('BP41').hints).toContain('Waits on plinth:PL4, which is in progress.');
		expect(it('BP42').blocked).toBe(false);
		expect(it('BP40').blocked).toBe(false);
		// The cached state is shared, so it is never changed.
		expect(bloom.items.find((i) => i.id === 'BP41')!.blocked).toBe(false);
	});
});

describe('an item’s links from other repositories (PM36)', () => {
	it('lists PRs that name it, and items that wait on it', () => {
		const ps1 = itemLinks(ns(), row('person-service'), 'PS1');
		expect(ps1.prs.map((p) => [p.repo, p.number])).toEqual([['bloomprint', 1]]);
		const pl4 = itemLinks(ns(), row('plinth'), 'PL4');
		expect(pl4.waitedOnBy.map((w) => `${w.repo}:${w.id}`)).toEqual(['bloomprint:BP41']);
	});

	it('links a PR whose Backlog: names its own repository like a bare id', () => {
		const bp40 = bloom.items.find((i) => i.id === 'BP40')!;
		expect(bp40.prs.map((p) => p.number)).toEqual([1]);
		expect(bloom.crossPrs.map((c) => c.refs)).toEqual([['person-service:PS1']]);
	});
});
