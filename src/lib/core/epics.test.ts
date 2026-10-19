import { describe, expect, it } from 'vitest';
import { parseBlob } from '../server/sync.ts';
import { parseConfig } from './config.ts';
import { chooseEpic, declareEpic, declaredEpic, epicId, parseEpicsFile, rollUp } from './epics.ts';
import { assembleState, type StoredBacklog } from './state.ts';

describe('epicId', () => {
	it('takes the first word as an id, in upper case', () => {
		expect(epicId('EP3')).toBe('EP3');
		expect(epicId('`ep12` — onboarding')).toBe('EP12');
		expect(epicId('**EP4**')).toBe('EP4');
	});
	it('rejects anything that is not EP and a number', () => {
		expect(epicId('onboarding')).toBeNull();
		expect(epicId('EP')).toBeNull();
		expect(epicId('')).toBeNull();
		expect(epicId(undefined)).toBeNull();
	});
	it('reads another repository’s epic as <repo>:EPn, and its own repo’s as the bare id (PM36)', () => {
		expect(epicId('person-service:ep1')).toBe('person-service:EP1');
		expect(epicId('`Person-Service:EP1` the person service')).toBe('person-service:EP1');
		const here = { owner: 'nickwhiteley', repo: 'person-service' };
		expect(epicId('person-service:EP1', here)).toBe('EP1');
		expect(epicId('nickwhiteley--person-service:EP1', here)).toBe('EP1');
		expect(epicId('bloomprint:BP4', here)).toBeNull();
	});
	it('declaredEpic reads an item or section id', () => {
		expect(declaredEpic('EP3')).toBe('EP3');
		expect(declaredEpic('ep3')).toBe('EP3');
		expect(declaredEpic('PM3')).toBeNull();
		expect(declaredEpic('EP3a')).toBeNull();
	});
});

describe('rollUp: another repository’s epic (PM36)', () => {
	it('leaves items in another repository’s epic out of this one’s roll-up', () => {
		const out = rollUp(
			[{ id: 'EP1', title: 'Here' }],
			[
				{ id: 'A1', epic: 'EP1', status: 'todo' },
				{ id: 'A2', epic: 'person-service:EP1', status: 'todo' }
			],
			[{ id: 'A3', epic: 'person-service:EP1' }]
		);
		expect(out.map((e) => [e.id, e.items, e.shipped])).toEqual([['EP1', ['A1'], []]]);
	});
});

describe('rollUp', () => {
	const out = rollUp(
		[
			{ id: 'EP2', title: 'Second' },
			{ id: 'EP1', title: 'First' }
		],
		[
			{ id: 'A1', epic: 'EP1', status: 'todo' },
			{ id: 'A2', epic: 'EP1', status: 'built' },
			{ id: 'A3', epic: null, status: 'todo' },
			{ id: 'A4', epic: 'EP9', status: 'blocked' }
		],
		[
			{ id: 'A0', epic: 'EP1' },
			{ id: 'Z0', epic: null }
		]
	);

	it('counts items by status, shipped ones as done', () => {
		const e1 = out.find((e) => e.id === 'EP1')!;
		expect(e1).toMatchObject({
			title: 'First',
			declared: true,
			total: 3,
			counts: { todo: 1, built: 1, done: 1 },
			items: ['A1', 'A2'],
			shipped: ['A0']
		});
	});
	it('lists declared epics first, by number, then undeclared ones', () => {
		expect(out.map((e) => e.id)).toEqual(['EP1', 'EP2', 'EP9']);
		expect(out[2]).toMatchObject({ declared: false, title: null, total: 1 });
		expect(out[1]).toMatchObject({ declared: true, total: 0 });
	});
});

describe('assembleState epics', () => {
	const text = `# Backlog

## EP5 Onboarding

### EP3 Billing
**Status:** in progress · **Size:** L

### B1 Invoices
**Status:** todo · **Epic:** EP3

### B2 Receipts
**Status:** built · **Epic:** \`ep3\`

### B3 Odd
**Status:** todo · **Epic:** billing
`;
	const config = parseConfig(null, { name: 'x', defaultBranch: 'main' }).config;
	const s = assembleState({
		owner: 'o',
		repo: 'x',
		config,
		configWarnings: [],
		refs: [
			{
				name: 'main',
				headOid: 'a',
				committedAt: '2026-10-13T10:00:00Z',
				ahead: 0,
				behind: 0,
				active: true,
				message: 'm',
				prs: [],
				backlog: parseBlob('backlog', text, 'x', 'main') as StoredBacklog,
				plan: null
			}
		],
		done: [
			{
				itemId: 'B0',
				title: 'Old',
				lastBody: '### B0 Old\n**Status:** done · **Epic:** EP3\n\nShipped.\n',
				removedOid: 'c',
				removedAt: '2026-10-01T00:00:00Z',
				prNumber: null
			}
		],
		lastSyncAt: null,
		lastError: null,
		now: Date.parse('2026-10-14T12:00:00Z')
	});

	it('declares epics from an item and a section, and rolls the items up', () => {
		expect(s.epics.map((e) => [e.id, e.title, e.total])).toEqual([
			['EP3', 'Billing', 3],
			['EP5', 'Onboarding', 0]
		]);
		expect(s.epics[0].counts).toEqual({ todo: 1, built: 1, done: 1 });
		expect(s.epics[0].shipped).toEqual(['B0']);
	});
	it('takes the description and target from epics.md, and an epic only it declares (PM28)', () => {
		const withFile = assembleState({
			owner: 'o',
			repo: 'x',
			config,
			configWarnings: [],
			refs: [
				{
					name: 'main',
					headOid: 'a',
					committedAt: '2026-10-13T10:00:00Z',
					ahead: 0,
					behind: 0,
					active: true,
					message: 'm',
					prs: [],
					backlog: parseBlob('backlog', text, 'x', 'main') as StoredBacklog,
					plan: null,
					epics: parseEpicsFile(
						'### EP3 Billing\n\nAll of billing.\n\n**Target:** Q4\n\n### EP7 Reports\n\nLater.\n'
					)
				}
			],
			done: [],
			lastSyncAt: null,
			lastError: null,
			now: Date.parse('2026-10-14T12:00:00Z')
		});
		expect(withFile.epics.map((e) => [e.id, e.description, e.target, e.declared])).toEqual([
			['EP3', 'All of billing.', 'Q4', true],
			['EP5', '', null, true],
			['EP7', 'Later.', null, true]
		]);
	});
	it('puts the epic on the item, and flags a value that is not an id', () => {
		expect(s.items.find((i) => i.id === 'B2')!.epic).toBe('EP3');
		expect(s.items.find((i) => i.id === 'B3')!.epic).toBeNull();
		expect(s.health.epics).toEqual(["B3: Epic billing isn't an epic id (EP and a number)"]);
	});
});

describe('parseEpicsFile (PM28)', () => {
	it('reads descriptions and targets from items and sections', () => {
		const text = `# Epics

## EP1 Billing

The whole of billing, end to end.

**Target:** Q4 2026

### EP2 Onboarding

**Status:** todo · **Target:** 2026-12-01

New customers reach a first report in a day.

More detail.

### Notes on epics

Not an epic.
`;
		expect(parseEpicsFile(text)).toEqual([
			{
				id: 'EP1',
				title: 'Billing',
				description: 'The whole of billing, end to end.',
				target: 'Q4 2026'
			},
			{
				id: 'EP2',
				title: 'Onboarding',
				description: 'New customers reach a first report in a day.\n\nMore detail.',
				target: '2026-12-01'
			}
		]);
	});

	it('rolls a description and target onto the epic a heading in the backlog declared', () => {
		const [e] = rollUp(
			[
				{ id: 'EP1', title: 'Billing' },
				{ id: 'EP1', title: 'Other', description: 'Why.', target: 'Q4' }
			],
			[],
			[]
		);
		expect(e).toMatchObject({ title: 'Billing', description: 'Why.', target: 'Q4' });
	});
});

describe('chooseEpic (PM1)', () => {
	const known = [
		{ id: 'EP1', title: 'Billing' },
		{ id: 'EP4', title: null }
	];
	it('takes an id as an id, in upper case, and nothing as none', () => {
		expect(chooseEpic('ep1', known)).toEqual({ kind: 'id', id: 'EP1' });
		expect(chooseEpic('  ', known)).toEqual({ kind: 'none' });
	});
	it('takes the name of an epic that exists as that epic, ignoring case', () => {
		expect(chooseEpic('billing', known)).toEqual({ kind: 'id', id: 'EP1' });
	});
	it('takes any other name as a new epic numbered after the highest in use', () => {
		expect(chooseEpic(' Onboarding   flow ', known)).toEqual({
			kind: 'new',
			id: 'EP5',
			title: 'Onboarding flow'
		});
		expect(chooseEpic('First', [])).toEqual({ kind: 'new', id: 'EP1', title: 'First' });
	});
	it('refuses a name that would not make a heading', () => {
		expect(chooseEpic('# Heading', known).kind).toBe('bad');
		expect(chooseEpic('x'.repeat(81), known).kind).toBe('bad');
	});
});

describe('declareEpic', () => {
	it('starts a file, and adds to one, with a heading the parser reads back', () => {
		const first = declareEpic('', 'EP1', 'Billing');
		const both = declareEpic(first, 'EP2', 'Onboarding');
		expect(parseEpicsFile(both).map((e) => [e.id, e.title])).toEqual([
			['EP1', 'Billing'],
			['EP2', 'Onboarding']
		]);
	});
});
