import { describe, expect, it } from 'vitest';
import { applyBatch, describeBatch, due, type PendingOp } from './batch.ts';
import { itemSource } from './splice.ts';

const text = `# Backlog

## Now

### A1 First
**Status:** todo

One.

### A2 Second
**Status:** todo

Two.
`;

const status = (id: string, s: string): PendingOp['op'] => ({
	op: 'edit',
	id,
	change: { meta: [{ key: 'Status', value: s }] }
});

describe('applyBatch', () => {
	it('applies edits in order and reports which', () => {
		const r = applyBatch(text, [
			{ id: 1, op: status('A1', 'built'), base: itemSource(text, 'A1') },
			{ id: 2, op: status('A2', 'done'), base: itemSource(text, 'A2') }
		]);
		expect(r.applied).toEqual([1, 2]);
		expect(r.conflicts).toEqual([]);
		expect(r.text).toContain('**Status:** built');
		expect(r.text).toContain('**Status:** done');
	});

	it('checks a later edit against the text the earlier ones made', () => {
		const first = applyBatch(text, [
			{ id: 1, op: status('A1', 'built'), base: itemSource(text, 'A1') }
		]);
		const r = applyBatch(text, [
			{ id: 1, op: status('A1', 'built'), base: itemSource(text, 'A1') },
			{ id: 2, op: status('A1', 'done'), base: itemSource(first.text, 'A1') }
		]);
		expect(r.applied).toEqual([1, 2]);
		expect(r.text).toContain('**Status:** done');
	});

	it('leaves out an edit whose item changed, and still applies the others', () => {
		const stale = itemSource(text, 'A1');
		const changed = text.replace('One.', 'One, edited on main.');
		const r = applyBatch(changed, [
			{ id: 1, op: status('A1', 'built'), base: stale },
			{ id: 2, op: status('A2', 'done'), base: itemSource(changed, 'A2') }
		]);
		expect(r.applied).toEqual([2]);
		expect(r.conflicts).toEqual([{ id: 1, detail: 'A1 has changed since this edit' }]);
		expect(r.text).toContain('One, edited on main.');
	});

	it('reports an item that is gone, and an edit splice refuses', () => {
		const r = applyBatch(text, [
			{ id: 1, op: status('A9', 'done'), base: 'x' },
			{ id: 2, op: status('A9', 'done'), base: null }
		]);
		expect(r.applied).toEqual([]);
		expect(r.conflicts.map((c) => c.detail)).toEqual(['A9 is no longer there', 'no item A9']);
	});

	it('adds an item', () => {
		const r = applyBatch(text, [
			{
				id: 1,
				op: { op: 'add', item: { id: 'A3', title: 'Third', meta: [] }, to: { after: 'A2' } },
				base: null
			}
		]);
		expect(r.applied).toEqual([1]);
		expect(r.text).toContain('### A3 Third');
	});
});

describe('describeBatch', () => {
	it('names one edit as a single edit would, several as a count', () => {
		expect(describeBatch(text, [status('A1', 'built')])).toMatch(/A1/);
		expect(
			describeBatch(text, [status('A1', 'built'), status('A2', 'done'), status('A1', 'x')])
		).toBe('Backlog: 3 edits (A1, A2)');
	});
});

describe('due', () => {
	const t0 = Date.parse('2026-10-16T10:00:00Z');
	it('waits for a quiet minute', () => {
		expect(due([], t0)).toBe(false);
		expect(due([{ createdAt: t0 }], t0 + 59_000)).toBe(false);
		expect(due([{ createdAt: t0 }], t0 + 60_000)).toBe(true);
	});
	it('does not wait past five minutes from the first edit', () => {
		const busy = [t0, t0 + 50_000, t0 + 100_000, t0 + 200_000, t0 + 290_000].map((createdAt) => ({
			createdAt
		}));
		expect(due(busy, t0 + 299_000)).toBe(false);
		expect(due(busy, t0 + 300_000)).toBe(true);
	});
});
