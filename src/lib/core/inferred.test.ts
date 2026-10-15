import { describe, expect, it } from 'vitest';
import { parseBlob } from '../server/sync.ts';
import { parseConfig } from './config.ts';
import { assembleState, type InferenceInput, type StoredBacklog } from './state.ts';

const text = `# Backlog

## Now

### B1 Invoices
Built last week; waiting on the bank.

### B2 Has a meta line
**Status:** todo
`;

function state(inferences: InferenceInput[], backlogText = text) {
	const config = parseConfig(null, { name: 'x', defaultBranch: 'main' }).config;
	return assembleState({
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
				backlog: parseBlob('backlog', backlogText, 'x', 'main') as StoredBacklog,
				plan: null
			}
		],
		done: [],
		inferences,
		lastSyncAt: null,
		lastError: null,
		now: Date.parse('2026-10-14T12:00:00Z')
	});
}

describe('inferred status (PM3)', () => {
	const source = state([]).items.find((i) => i.id === 'B1')!.source;
	const guess = (id: string, src: string): InferenceInput => ({
		itemId: id,
		source: src,
		status: 'built',
		waiting: 'the bank',
		model: 'ollama:llama3.1'
	});

	it('shows a proposal on an item with no meta line, without changing its status', () => {
		const b1 = state([guess('B1', source)]).items.find((i) => i.id === 'B1')!;
		expect(b1.inferred).toEqual({ status: 'built', waiting: 'the bank', model: 'ollama:llama3.1' });
		expect(b1.status).toBe('todo');
	});
	it('drops a proposal once the item has changed', () => {
		const changed = text.replace('last week', 'yesterday');
		expect(state([guess('B1', source)], changed).items[0].inferred).toBeNull();
	});
	it('ignores a proposal for an item that has a meta line', () => {
		const b2 = state([guess('B2', 'x')]).items.find((i) => i.id === 'B2')!;
		expect(b2.inferred).toBeNull();
	});
});
