import { describe, expect, it } from 'vitest';
import { parseBlob } from '../server/sync.ts';
import { parseConfig } from './config.ts';
import { declaredEpic, epicId, rollUp } from './epics.ts';
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
	it('declaredEpic reads an item or section id', () => {
		expect(declaredEpic('EP3')).toBe('EP3');
		expect(declaredEpic('ep3')).toBe('EP3');
		expect(declaredEpic('PM3')).toBeNull();
		expect(declaredEpic('EP3a')).toBeNull();
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
	it('puts the epic on the item, and flags a value that is not an id', () => {
		expect(s.items.find((i) => i.id === 'B2')!.epic).toBe('EP3');
		expect(s.items.find((i) => i.id === 'B3')!.epic).toBeNull();
		expect(s.health.epics).toEqual(["B3: Epic billing isn't an epic id (EP and a number)"]);
	});
});
