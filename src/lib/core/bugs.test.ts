import { describe, expect, it } from 'vitest';
import { parseBlob } from '../server/sync.ts';
import { bugsPosition } from './bugs.ts';
import { parseConfig } from './config.ts';
import { advanceHistory, emptyHistory } from './history.ts';
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

describe('bugs.md (PM29)', () => {
	const main = `# Backlog

## Now

### B1 Dark mode
**Status:** todo

### BUG1 Mentioned twice
**Status:** todo
`;
	const bugsText = `# Bugs

### BUG1 Crash on save
**Status:** todo · **Found:** production · **Raised:** 2026-10-14 09:30

### BUG2 Wrong total
**Status:** blocked · **Waiting:** a repro
`;
	const config = parseConfig(null, { name: 'x', defaultBranch: 'main' }).config;
	const ref = (backlog: string, bugs?: string) => ({
		name: 'main',
		headOid: 'a',
		committedAt: '2026-10-13T10:00:00Z',
		ahead: 0,
		behind: 0,
		active: true,
		message: 'm',
		prs: [],
		backlog: parseBlob('backlog', backlog, 'x', 'main') as StoredBacklog,
		bugs: bugs ? (parseBlob('backlog', bugs, 'x', 'main') as StoredBacklog) : null,
		plan: null
	});
	const state = (r = ref(main, bugsText)) =>
		assembleState({
			owner: 'o',
			repo: 'x',
			config,
			configWarnings: [],
			refs: [r],
			done: [],
			lastSyncAt: null,
			lastError: null,
			now: Date.parse('2026-10-14T12:00:00Z')
		});

	it('adds the bugs after the main items, in a Bugs section, marked with their file', () => {
		const s = state();
		expect(s.items.map((i) => [i.id, i.file, i.type])).toEqual([
			['B1', null, null],
			['BUG1', null, null],
			['BUG2', 'bugs.md', 'bug']
		]);
		const bugs = s.sections.find((x) => x.file);
		expect(bugs).toMatchObject({ titleText: 'Bugs', file: 'bugs.md' });
		expect(s.items.find((i) => i.id === 'BUG2')!.section).toBe(bugs!.index);
		expect(s.bugsFile).toBe('bugs.md');
		expect(s.bugPrefix).toBe('BUG');
		expect(s.usedIds).toEqual(expect.arrayContaining(['B1', 'BUG1', 'BUG2']));
	});

	it('keeps an id once when both files have it, and says so', () => {
		const s = state();
		expect(s.health.warnings.map((w) => w.message)).toContain(
			'bugs.md: BUG1 is also in the main backlog, so only that one is shown'
		);
	});

	it('reads a project whose only backlog is the bugs file', () => {
		const s = state(ref('', bugsText));
		expect(s.hasBacklog).toBe(true);
		expect(s.items.map((i) => i.id)).toEqual(['BUG1', 'BUG2']);
	});

	it('is unchanged with no bugs file', () => {
		const s = state(ref(main));
		expect(s.bugsFile).toBeNull();
		expect(s.sections.some((x) => x.file)).toBe(false);
	});

	it('finds where to put a bug in the file, next to its bugs', () => {
		const items = [
			{ id: 'B1', file: null },
			{ id: 'BUG2', file: 'bugs.md' },
			{ id: 'BUG3', file: 'bugs.md' }
		];
		expect(bugsPosition(items, 'start')).toEqual({ before: 'BUG2' });
		expect(bugsPosition(items, 'end')).toEqual({ after: 'BUG3' });
		expect(bugsPosition(items, 'end', 'BUG3')).toEqual({ after: 'BUG2' });
		expect(bugsPosition(items.slice(0, 1), 'end')).toBeNull();
	});

	it('detects a fixed bug as shipped when it leaves bugs.md, by reading both files as one', () => {
		const at = (bugs: string, oid: string, date: string) => ({
			oid,
			date,
			pr: null,
			text: [main, bugs].join('\n\n')
		});
		const after = bugsText.replace(/### BUG2[\s\S]*/, '');
		const h = advanceHistory(emptyHistory(), [
			at(bugsText, 'c1', '2026-10-01T00:00:00Z'),
			at(after, 'c2', '2026-10-02T00:00:00Z')
		]);
		expect([...h.done.keys()]).toEqual(['BUG2']);
	});
});
