import { describe, expect, it } from 'vitest';
import { parseBlob } from '../server/sync.ts';
import { parseConfig } from './config.ts';
import { assembleState, type StoredBacklog } from './state.ts';

const text = `# Backlog

## Now

### B1 Crash on save
**Status:** todo · **Type:** bug · **Found:** production · **Raised:** 2026-10-14 09:30

### B2 Dark mode
**Status:** todo · **Type:** Feature

### B3 No type
**Status:** todo
`;

describe('Type, Found and Raised (PM2)', () => {
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
		done: [],
		lastSyncAt: null,
		lastError: null,
		now: Date.parse('2026-10-14T12:00:00Z')
	});
	const item = (id: string) => s.items.find((i) => i.id === id)!;

	it('reads the type lower-cased, and where a bug was found and when', () => {
		expect(item('B1')).toMatchObject({
			type: 'bug',
			found: 'production',
			raised: '2026-10-14 09:30'
		});
		expect(item('B2').type).toBe('feature');
		expect(item('B3')).toMatchObject({ type: null, found: null, raised: null });
	});
});
